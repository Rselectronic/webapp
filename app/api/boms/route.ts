import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/boms — List parsed BOMs, optionally filtered by customer_id
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerId = new URL(req.url).searchParams.get("customer_id");

  let query = supabase
    .from("boms")
    .select("id, file_name, revision, status, gmp_id, customer_id, component_count, created_at, gmps(gmp_number)")
    .eq("status", "parsed")
    .order("created_at", { ascending: false });

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
