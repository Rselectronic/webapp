import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/fabrication-orders — List fabrication orders (PCB + stencil)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const orderType = url.searchParams.get("order_type");
  const status = url.searchParams.get("status");
  const jobId = url.searchParams.get("job_id");

  let query = supabase
    .from("fabrication_orders")
    .select("*, jobs(job_number, customer_id, customers(code, company_name), gmps(gmp_number, board_name))")
    .order("created_at", { ascending: false })
    .limit(100);

  if (orderType) query = query.eq("order_type", orderType);
  if (status) query = query.eq("status", status);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/fabrication-orders — Create a fabrication order
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { job_id, order_type, supplier, supplier_ref, quantity, unit_cost, ordered_date, expected_date, notes } = body;

  if (!job_id || !order_type || !supplier) {
    return NextResponse.json(
      { error: "job_id, order_type, and supplier are required" },
      { status: 400 }
    );
  }

  const validTypes = ["pcb", "stencil"];
  if (!validTypes.includes(order_type)) {
    return NextResponse.json(
      { error: `order_type must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const qty = quantity || 1;
  const unitCost = parseFloat(unit_cost) || 0;
  const totalCost = Math.round(qty * unitCost * 100) / 100;

  const { data, error } = await supabase
    .from("fabrication_orders")
    .insert({
      job_id,
      order_type,
      supplier,
      supplier_ref: supplier_ref || null,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: totalCost,
      status: "ordered",
      ordered_date: ordered_date || new Date().toISOString().split("T")[0],
      expected_date: expected_date || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/fabrication-orders — Update a fabrication order
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Recalculate total_cost if quantity or unit_cost changed
  if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
    const { data: existing } = await supabase
      .from("fabrication_orders")
      .select("quantity, unit_cost")
      .eq("id", id)
      .single();

    if (existing) {
      const qty = updates.quantity ?? existing.quantity;
      const uc = updates.unit_cost ?? existing.unit_cost;
      updates.total_cost = Math.round(qty * parseFloat(uc) * 100) / 100;
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("fabrication_orders")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
