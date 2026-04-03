import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/gmps?customer_id=xxx — List GMPs for a customer */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id");

  if (!customerId) {
    return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  }

  const { data: gmps, error } = await supabase
    .from("gmps")
    .select("id, gmp_number, board_name, revision, is_active")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("gmp_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gmps });
}

/** POST /api/gmps — Create a new GMP */
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { customer_id, gmp_number, board_name } = body;

  if (!customer_id || !gmp_number) {
    return NextResponse.json({ error: "customer_id and gmp_number required" }, { status: 400 });
  }

  const { data: gmp, error } = await supabase
    .from("gmps")
    .insert({ customer_id, gmp_number, board_name: board_name ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "GMP number already exists for this customer" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(gmp, { status: 201 });
}
