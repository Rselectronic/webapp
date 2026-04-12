import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/procurement-batches/[id] — Get batch detail with items and lines
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: batch, error } = await admin
    .from("procurement_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: items } = await admin
    .from("procurement_batch_items")
    .select("*, procurements(proc_code, status, total_lines, jobs(job_number, quantity, customers(code, company_name), gmps(gmp_number, board_name)))")
    .eq("batch_id", id)
    .order("board_letter", { ascending: true });

  const { data: lines } = await admin
    .from("procurement_batch_lines")
    .select("*")
    .eq("batch_id", id)
    .order("line_number", { ascending: true });

  const { data: log } = await admin
    .from("procurement_batch_log")
    .select("*")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ...batch,
    items: items ?? [],
    lines: lines ?? [],
    log: log ?? [],
  });
}
