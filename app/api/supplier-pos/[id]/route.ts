import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: po, error } = await supabase
    .from("supplier_pos")
    .select("*, procurements(proc_code, jobs(job_number, customers(code, company_name)))")
    .eq("id", id)
    .single();

  if (error || !po) {
    return NextResponse.json({ error: "Supplier PO not found" }, { status: 404 });
  }

  return NextResponse.json(po);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "sent") {
      updates.sent_at = new Date().toISOString();
    }
  }
  if (body.tracking_number !== undefined) {
    updates.tracking_number = body.tracking_number;
  }
  if (body.expected_arrival !== undefined) {
    updates.expected_arrival = body.expected_arrival;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: po, error } = await supabase
    .from("supplier_pos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(po);
}
