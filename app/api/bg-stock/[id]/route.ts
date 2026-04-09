import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: item, error } = await supabase
    .from("bg_stock")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Fetch recent stock log entries
  const { data: logs } = await supabase
    .from("bg_stock_log")
    .select("id, change_type, quantity_change, quantity_after, notes, created_at, created_by")
    .eq("bg_stock_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ ...item, logs: logs ?? [] });
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

  const body = (await req.json()) as {
    manufacturer?: string;
    description?: string;
    m_code?: string;
    min_qty?: number;
    feeder_slot?: string;
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.manufacturer !== undefined) update.manufacturer = body.manufacturer;
  if (body.description !== undefined) update.description = body.description;
  if (body.m_code !== undefined) update.m_code = body.m_code;
  if (body.min_qty !== undefined) update.min_qty = body.min_qty;
  if (body.feeder_slot !== undefined) update.feeder_slot = body.feeder_slot;

  const { data, error } = await supabase
    .from("bg_stock")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
