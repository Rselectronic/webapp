import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";

/**
 * Valid assembly type codes for proc batch codes (from VBA procbatchcode_generator_V2).
 *
 * Format: XY where X = order type letter, Y = B(atch) or S(ingle)
 *   T = Turnkey, A = Assy Only, C = Consignment,
 *   P = PCB Only, D = Components Only, M = PCB & Components
 *
 * The job's assembly_type column already stores these codes (e.g. "TB", "TS", "AS").
 */
const VALID_TYPE_CODES = new Set([
  "TB", "TS", // Turnkey Batch / Single
  "AB", "AS", // Assembly Only Batch / Single
  "CB", "CS", // Consignment Batch / Single
  "PB", "PS", // PCB Only Batch / Single
  "DB", "DS", // Components Only Batch / Single
  "MB", "MS", // PCB & Components Batch / Single
]);

/**
 * Generates a proc code in legacy SOP format: "YYMMDD CUST-XYNNN"
 *
 * Example: "260403 TLAN-TB085"
 *   Date:     260403 (April 3, 2026)
 *   Customer: TLAN
 *   Type:     TB (Turnkey Batch)
 *   Sequence: 085 (auto-incremented per customer)
 *
 * The sequence number increments globally per customer across ALL type codes,
 * matching the VBA behavior where column X tracks one counter per customer.
 */
async function generateProcCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string,
  assemblyType: string
): Promise<string> {
  // Use the job's assembly_type directly — it already encodes type + batch/single
  const typeCode = VALID_TYPE_CODES.has(assemblyType) ? assemblyType : "TB";

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;

  // Find the highest existing sequence number for this customer.
  // The VBA tracks one counter per customer (column X in Admin sheet),
  // so we look at ALL proc codes for this customer regardless of type code.
  const pattern = `% ${customerCode}-%`;
  const { data: existing } = await supabase
    .from("procurements")
    .select("proc_code")
    .like("proc_code", pattern);

  // Extract the highest NNN from existing codes (last 3 digits)
  let maxSeq = 0;
  const seqRegex = new RegExp(
    `\\d{6} ${customerCode}-[A-Z]{2}(\\d{3})$`
  );
  for (const row of existing ?? []) {
    const match = row.proc_code.match(seqRegex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${datePart} ${customerCode}-${typeCode}${nextSeq}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  const status = url.searchParams.get("status");

  let query = supabase
    .from("procurements")
    .select(
      "id, proc_code, status, total_lines, lines_ordered, lines_received, notes, created_at, jobs(job_number, status, quantity)"
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

  const body = (await req.json()) as {
    job_id: string;
  };

  if (!body.job_id) {
    return NextResponse.json(
      { error: "job_id is required" },
      { status: 400 }
    );
  }

  // Fetch the job with customer code
  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id, bom_id, quantity, status, assembly_type, customers(code)")
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
  const assemblyType = (job.assembly_type as string) ?? "TB";
  const procCode = await generateProcCode(
    supabase,
    customerCode,
    assemblyType
  );

  // Fetch BOM lines (non-PCB)
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, line_number, quantity, mpn, description, m_code")
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

  // Build procurement lines
  const procLines = bomLines.map((line) => ({
    mpn: line.mpn ?? "",
    description: line.description ?? null,
    m_code: line.m_code ?? null,
    bom_line_id: line.id,
    qty_needed: line.quantity * job.quantity,
    qty_extra: getOverage(line.m_code, job.quantity, tiers),
    qty_ordered: 0,
    qty_received: 0,
    order_status: "pending" as const,
    is_bg: false,
    supplier: null as string | null,
    unit_price: null as number | null,
  }));

  // Insert procurement record
  const { data: procurement, error: procError } = await supabase
    .from("procurements")
    .insert({
      proc_code: procCode,
      job_id: body.job_id,
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

  // --- BG Stock Auto-Deduction ---
  // Check which MPNs exist in bg_stock and mark them as BG parts
  const uniqueMpns = [...new Set(procLines.map((l) => l.mpn).filter(Boolean))];
  const { data: bgStockItems } = uniqueMpns.length > 0
    ? await supabase
        .from("bg_stock")
        .select("id, mpn, current_qty")
        .in("mpn", uniqueMpns)
    : { data: [] };

  const bgStockMap = new Map(
    (bgStockItems ?? []).map((item) => [item.mpn, item])
  );

  for (const line of procLines) {
    const bgItem = bgStockMap.get(line.mpn);
    if (bgItem && bgItem.current_qty > 0) {
      line.is_bg = true;
    }
  }

  // --- Supplier Allocation (Best Price Routing) ---
  // Look up cached prices from api_pricing_cache for all MPNs
  const { data: cachedPrices } = uniqueMpns.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("source, mpn, unit_price")
        .in("mpn", uniqueMpns)
        .not("unit_price", "is", null)
        .gte("expires_at", new Date().toISOString())
    : { data: [] };

  // Build a map: mpn -> { supplier, unit_price } (cheapest)
  const bestPriceMap = new Map<string, { supplier: string; unit_price: number }>();
  for (const cached of cachedPrices ?? []) {
    if (cached.unit_price == null) continue;
    const existing = bestPriceMap.get(cached.mpn);
    if (!existing || cached.unit_price < existing.unit_price) {
      // Capitalize source name for display: "digikey" -> "DigiKey", "mouser" -> "Mouser", "lcsc" -> "LCSC"
      const supplierName =
        cached.source === "digikey" ? "DigiKey" :
        cached.source === "mouser" ? "Mouser" :
        cached.source === "lcsc" ? "LCSC" :
        cached.source;
      bestPriceMap.set(cached.mpn, {
        supplier: supplierName,
        unit_price: Number(cached.unit_price),
      });
    }
  }

  for (const line of procLines) {
    const best = bestPriceMap.get(line.mpn);
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

  // --- BG Stock Deductions (after lines are confirmed inserted) ---
  const bgDeductions: Array<{ bgStockId: string; mpn: string; qtyDeducted: number }> = [];
  for (const line of procLines) {
    if (!line.is_bg) continue;
    const bgItem = bgStockMap.get(line.mpn);
    if (!bgItem) continue;

    const deductQty = Math.min(line.qty_needed, bgItem.current_qty);
    if (deductQty <= 0) continue;

    const newQty = bgItem.current_qty - deductQty;

    await supabase
      .from("bg_stock")
      .update({ current_qty: newQty, updated_at: new Date().toISOString() })
      .eq("id", bgItem.id);

    await supabase.from("bg_stock_log").insert({
      bg_stock_id: bgItem.id,
      change_type: "subtraction",
      quantity_change: -deductQty,
      quantity_after: newQty,
      reference_id: procurement.id,
      reference_type: "procurement",
      notes: `Auto-deducted for procurement ${procCode}`,
      created_by: user.id,
    });

    // Update in-memory map so subsequent lines for same MPN see reduced stock
    bgItem.current_qty = newQty;
    bgDeductions.push({ bgStockId: bgItem.id, mpn: line.mpn, qtyDeducted: deductQty });
  }

  // Update job status to "procurement" if currently "created"
  if (job.status === "created") {
    await supabase
      .from("jobs")
      .update({ status: "procurement", updated_at: new Date().toISOString() })
      .eq("id", body.job_id);

    await supabase.from("job_status_log").insert({
      job_id: body.job_id,
      old_status: "created",
      new_status: "procurement",
      changed_by: user.id,
      notes: `Procurement ${procCode} created`,
    });
  }

  return NextResponse.json({
    ...procurement,
    bg_deductions: bgDeductions,
    supplier_allocations: procLines.filter((l) => l.supplier).length,
  });
}
