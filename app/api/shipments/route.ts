import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/shipments — List shipments with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const carrier = url.searchParams.get("carrier");
  const jobId = url.searchParams.get("job_id");

  let query = supabase
    .from("shipments")
    .select("*, jobs(job_number, customer_id, quantity, customers(code, company_name), gmps(gmp_number, board_name))")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (carrier) query = query.eq("carrier", carrier);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/shipments — Create a shipment
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { job_id, carrier, tracking_number, ship_date, estimated_delivery, shipping_cost, notes } = body;

  if (!job_id || !carrier) {
    return NextResponse.json(
      { error: "job_id and carrier are required" },
      { status: 400 }
    );
  }

  const validCarriers = ["FedEx", "Purolator", "UPS", "Canada Post", "Other"];
  if (!validCarriers.includes(carrier)) {
    return NextResponse.json(
      { error: `carrier must be one of: ${validCarriers.join(", ")}` },
      { status: 400 }
    );
  }

  const status = ship_date ? "shipped" : "pending";

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      job_id,
      carrier,
      tracking_number: tracking_number || null,
      ship_date: ship_date || null,
      estimated_delivery: estimated_delivery || null,
      shipping_cost: shipping_cost || 0,
      status,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/shipments — Update a shipment (pass id in body)
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

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("shipments")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
