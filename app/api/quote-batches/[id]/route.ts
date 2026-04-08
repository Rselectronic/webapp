import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/** GET /api/quote-batches/[id] — Get full batch detail with BOMs and lines */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: batch, error } = await admin
    .from("quote_batches")
    .select(`
      *,
      customers(code, company_name),
      quote_batch_boms(*, boms(file_name, status, component_count), gmps(gmp_number, board_name)),
      quote_batch_lines(*)
    `)
    .eq("id", id)
    .single();

  if (error || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  // Also fetch the log
  const { data: log } = await admin
    .from("quote_batch_log")
    .select("*")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ batch, log: log ?? [] });
}

/** PATCH /api/quote-batches/[id] — Update batch settings (qty tiers, pricing config, name) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  // Only allow updating certain fields
  const allowedFields = [
    "batch_name", "qty_1", "qty_2", "qty_3", "qty_4",
    "component_markup_pct", "pcb_markup_pct",
    "smt_cost_per_placement", "th_cost_per_placement", "nre_charge", "notes",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const { data, error } = await admin
    .from("quote_batches")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ batch: data });
}
