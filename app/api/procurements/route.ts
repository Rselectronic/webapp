import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";

/**
 * Maps job assembly_type to the SOP X+Y code characters.
 * X = B (Batch/multiple boards) or S (Single board)
 * Y = T (Turnkey), A (Assembly Only), C (Consignment), P (PCB Only)
 */
const ASSEMBLY_TYPE_MAP: Record<string, string> = {
  TB: "BT", // Top+Bottom → Batch Turnkey
  TS: "ST", // Top-side only → Single Turnkey
  CS: "BC", // Consignment → Batch Consignment
  CB: "BA", // Customer Board → Batch Assembly
  AS: "BA", // Assembly-only → Batch Assembly
};

/**
 * Generates a proc code in SOP format: "YYMMDD CUST-XYNNN"
 * Example: "250413 TLAN-BT029"
 */
async function generateProcCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string,
  assemblyType: string,
  isBatch: boolean = true
): Promise<string> {
  const xy = ASSEMBLY_TYPE_MAP[assemblyType] ?? "BT";
  // Override the X character if caller explicitly specifies batch/single
  const xChar = isBatch ? "B" : "S";
  const yChar = xy[1] ?? "T";
  const typeCode = `${xChar}${yChar}`;

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;

  // Match existing codes for this customer + type code to find next sequence
  // Format: "YYMMDD CUST-XYNNN" — match on "% CUST-XY%"
  const pattern = `% ${customerCode}-${typeCode}%`;
  const { data: existing } = await supabase
    .from("procurements")
    .select("proc_code")
    .like("proc_code", pattern);

  // Extract the highest NNN from existing codes
  let maxSeq = 0;
  const seqRegex = new RegExp(
    `\\d{6} ${customerCode}-${typeCode}(\\d{3})$`
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
    is_batch?: boolean;
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
  const isBatch = body.is_batch ?? true;
  const procCode = await generateProcCode(
    supabase,
    customerCode,
    assemblyType,
    isBatch
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

  return NextResponse.json(procurement);
}
