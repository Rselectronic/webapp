import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";

async function generateProcCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}${mm}-${customerCode}-TB`;
  const { count } = await supabase
    .from("procurements")
    .select("id", { count: "exact", head: true })
    .like("proc_code", `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
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

  const body = (await req.json()) as { job_id: string };

  if (!body.job_id) {
    return NextResponse.json(
      { error: "job_id is required" },
      { status: 400 }
    );
  }

  // Fetch the job with customer code
  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id, bom_id, quantity, status, customers(code)")
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
  const procCode = await generateProcCode(supabase, customerCode);

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
