import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";
import { autoAllocateProcInventory } from "@/lib/inventory/auto-allocate-proc";
import {
  generateProcCode,
  type ProcurementMode,
} from "@/lib/proc/generate-proc-code";
/**
 * Single-job PROC creation (one job â†’ one PROC). Multi-job batch PROCs
 * still use POST /api/proc, which shares the same generator.
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  const status = url.searchParams.get("status");

  // procurements â†” jobs has TWO FKs; hint with the constraint name to avoid
  // PostgREST's ambiguity 300 (which silently returns nulls).
  let query = supabase
    .from("procurements")
    .select(
      "id, proc_code, status, total_lines, lines_ordered, lines_received, notes, created_at, jobs!procurements_job_id_fkey(job_number, status, quantity)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (jobId) query = query.eq("job_id", jobId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ procurements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only: PROC creation is a financial / sourcing action.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    job_id: string;
  };

  if (!body.job_id) {
    return NextResponse.json(
      { error: "job_id is required" },
      { status: 400 }
    );
  }

  // Fetch the job with customer code + the quote's procurement_mode (the
  // canonical billing model). Falls back to "turnkey" if the job has no
  // linked quote (legacy data) or the quote's mode is missing.
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, customer_id, bom_id, quantity, status, quote_id, customers(code), quotes!jobs_quote_id_fkey(procurement_mode)"
    )
    .eq("id", body.job_id)
    .single();

  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Check if a procurement already exists for this job
  const { count: existingCount } = await supabase
    .from("procurements")
    .select("id", { count: "exact", head: true })
    .eq("job_id", body.job_id);

  if (existingCount && existingCount > 0) {
    return NextResponse.json(
      { error: "Procurement already exists for this job" },
      { status: 409 }
    );
  }

  const customer = job.customers as unknown as { code: string } | null;
  const customerCode = customer?.code ?? "UNK";

  // Pull procurement_mode off the quote (the billing classification). Single-
  // job PROCs always have member_count=1 â†’ size letter S.
  const quoteJoin = job.quotes as unknown as { procurement_mode?: string | null } | null;
  const rawMode = quoteJoin?.procurement_mode ?? "turnkey";
  const procurementMode: ProcurementMode =
    rawMode === "consignment" || rawMode === "assembly_only" || rawMode === "turnkey"
      ? rawMode
      : "turnkey";

  const procCodeResult = await generateProcCode({
    supabase,
    customer_code: customerCode,
    customer_id: job.customer_id,
    procurement_mode: procurementMode,
    member_count: 1,
  });
  const procCode = procCodeResult.proc_code;

  // Fetch BOM lines (non-PCB). Pull cpc as well â€” Phase 3: procurement_lines
  // is now CPC-keyed (the business identity at RS), with mpn carried for the
  // supplier-facing PO output.
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, line_number, quantity, mpn, cpc, description, m_code")
    .eq("bom_id", job.bom_id)
    .eq("is_pcb", false)
    .eq("is_dni", false)
    .order("line_number", { ascending: true });

  if (bomError)
    return NextResponse.json({ error: bomError.message }, { status: 500 });

  if (!bomLines || bomLines.length === 0) {
    return NextResponse.json(
      { error: "No BOM lines found for this job" },
      { status: 400 }
    );
  }

  // Fetch overage tiers
  const { data: overageRows } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");

  const tiers: OverageTier[] = (overageRows ?? []).map((r) => ({
    m_code: r.m_code,
    qty_threshold: r.qty_threshold,
    extras: r.extras,
  }));

  // Build procurement lines. Falls back to MPN-as-CPC when bom_lines.cpc is
  // blank â€” mirrors the parser convention applied throughout the merged-BOM
  // pipeline.
  const procLines = bomLines.map((line) => {
    const cpcRaw = (line.cpc ?? "").trim();
    const mpnRaw = (line.mpn ?? "").trim();
    return {
      cpc: cpcRaw || mpnRaw,
      mpn: mpnRaw,
      description: line.description ?? null,
      m_code: line.m_code ?? null,
      bom_line_id: line.id,
      qty_needed: line.quantity * job.quantity,
      // Overage thresholds are PART counts, not board counts â€” pass the
      // base part qty (qty_per_board Ã— board_qty).
      qty_extra: getOverage(line.m_code, line.quantity * job.quantity, tiers),
      qty_ordered: 0,
      qty_received: 0,
      order_status: "pending" as const,
      is_bg: false,
      supplier: null as string | null,
      unit_price: null as number | null,
    };
  });

  // Insert procurement record
  const { data: procurement, error: procError } = await supabase
    .from("procurements")
    .insert({
      proc_code: procCode,
      job_id: body.job_id,
      customer_id: job.customer_id,
      procurement_mode: procurementMode,
      is_batch: procCodeResult.is_batch,
      member_count: 1,
      sequence_num: procCodeResult.sequence_num,
      proc_date: procCodeResult.proc_date,
      status: "draft",
      total_lines: procLines.length,
      lines_ordered: 0,
      lines_received: 0,
      created_by: user.id,
    })
    .select("id, proc_code, status, total_lines")
    .single();

  if (procError)
    return NextResponse.json({ error: procError.message }, { status: 500 });

  // --- Supplier Allocation (Best Price Routing) ---
  // BG / Safety stock allocation lives in inventory_allocations and is handled
  // by autoAllocateProcInventory() at the end of this route.
  //
  // Look up cached prices from api_pricing_cache for the supplier-facing
  // MPN of each new procurement_line. Pricing cache stays MPN-keyed because
  // that's what we send to DigiKey/Mouser/etc.
  const uniqueMpns = [...new Set(procLines.map((l) => l.mpn).filter(Boolean))];
  const { data: cachedPrices } = uniqueMpns.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("source, mpn, unit_price")
        .in("mpn", uniqueMpns)
        .not("unit_price", "is", null)
        .gte("expires_at", new Date().toISOString())
    : { data: [] };

  // Build a map: mpn -> { supplier, unit_price } (cheapest). Keyed on MPN
  // because api_pricing_cache rows are MPN-keyed at the supplier API level.
  const bestPriceByMpn = new Map<string, { supplier: string; unit_price: number }>();
  for (const cached of cachedPrices ?? []) {
    if (cached.unit_price == null) continue;
    const existing = bestPriceByMpn.get(cached.mpn);
    if (!existing || cached.unit_price < existing.unit_price) {
      // Capitalize source name for display: "digikey" -> "DigiKey", "mouser" -> "Mouser", "lcsc" -> "LCSC"
      const supplierName =
        cached.source === "digikey" ? "DigiKey" :
        cached.source === "mouser" ? "Mouser" :
        cached.source === "lcsc" ? "LCSC" :
        cached.source === "procurement_history" ? "Historical" :
        cached.source;
      bestPriceByMpn.set(cached.mpn, {
        supplier: supplierName,
        unit_price: Number(cached.unit_price),
      });
    }
  }

  // --- Historical Procurement Prices (fallback for CPCs not in cache) ---
  // Check what was previously paid for the same CPC that have no cached
  // price by MPN. CPC is the canonical identity, so historical procurement
  // lookups are CPC-keyed regardless of which MPN was last on the line.
  const uniqueCpcs = [...new Set(procLines.map((l) => l.cpc).filter(Boolean))];
  const cpcsNeedingHistory = uniqueCpcs.filter((cpc) => {
    // Find the procLines with this cpc and see if any have a price hit.
    const winningMpns = procLines
      .filter((l) => l.cpc === cpc)
      .map((l) => l.mpn);
    return !winningMpns.some((mpn) => bestPriceByMpn.has(mpn));
  });
  const bestPriceByCpc = new Map<string, { supplier: string; unit_price: number }>();
  if (cpcsNeedingHistory.length > 0) {
    const { data: histRows } = await supabase
      .from("procurement_lines")
      .select("cpc, unit_price, supplier")
      .in("cpc", cpcsNeedingHistory)
      .not("unit_price", "is", null)
      .gt("unit_price", 0)
      .order("created_at", { ascending: false });

    if (histRows) {
      for (const row of (histRows ?? []) as {
        cpc: string | null;
        unit_price: number | null;
        supplier: string | null;
      }[]) {
        if (!row.cpc || row.unit_price == null) continue;
        if (!bestPriceByCpc.has(row.cpc)) {
          bestPriceByCpc.set(row.cpc, {
            supplier: row.supplier ?? "Historical",
            unit_price: Number(row.unit_price),
          });
        }
      }
    }
  }

  for (const line of procLines) {
    const byMpn = line.mpn ? bestPriceByMpn.get(line.mpn) : undefined;
    const byCpc = !byMpn && line.cpc ? bestPriceByCpc.get(line.cpc) : undefined;
    const best = byMpn ?? byCpc;
    if (best) {
      line.supplier = best.supplier;
      line.unit_price = best.unit_price;
    }
  }

  // Insert procurement lines
  const linesWithProcId = procLines.map((line) => ({
    ...line,
    procurement_id: procurement.id,
  }));

  const { error: linesError } = await supabase
    .from("procurement_lines")
    .insert(linesWithProcId);

  if (linesError) {
    // Rollback: remove the procurement record
    await supabase.from("procurements").delete().eq("id", procurement.id);
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  // BG / Safety stock deductions are handled by autoAllocateProcInventory()
  // below, which writes to inventory_allocations against inventory_parts.

  // Update job status to "procurement" if currently "created".
  // Use the admin client because jobs RLS may not grant the user-scoped
  // client UPDATE rights on every job â€” and a silent no-op here would leave
  // the job stuck in 'created' even though procurement just kicked off.
  if (job.status === "created") {
    const admin = createAdminClient();
    const { error: jobUpdErr } = await admin
      .from("jobs")
      .update({ status: "procurement", updated_at: new Date().toISOString() })
      .eq("id", body.job_id);
    if (jobUpdErr) {
      console.error("[procurements POST] job status flip failed:", jobUpdErr);
    }

    const { error: logErr } = await admin.from("job_status_log").insert({
      job_id: body.job_id,
      old_status: "created",
      new_status: "procurement",
      changed_by: user.id,
      notes: `Procurement ${procCode} created`,
    });
    if (logErr) {
      console.error("[procurements POST] job_status_log insert failed:", logErr);
    }
  }

  // Best-effort: reserve any BG / Safety stock that matches this PROC's BOM.
  // Failures are swallowed inside the helper â€” a flaky inventory step must
  // never block PROC creation.
  await autoAllocateProcInventory(supabase, procurement.id);

  return NextResponse.json({
    ...procurement,
    // bg_deductions kept as an empty array for backward compatibility with
    // older callers. Inventory allocations now live in inventory_allocations
    // and are written by autoAllocateProcInventory() above.
    bg_deductions: [],
    supplier_allocations: procLines.filter((l) => l.supplier).length,
  });
}
