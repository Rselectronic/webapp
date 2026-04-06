import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const lowStockOnly = url.searchParams.get("low_stock") === "true";

  let query = supabase
    .from("bg_stock")
    .select("*")
    .order("mpn", { ascending: true });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items = data ?? [];

  // Filter to low/out of stock items if requested
  if (lowStockOnly) {
    items = items.filter((item) => item.current_qty <= item.min_qty);
  }

  // Compute summary stats
  const totalItems = items.length;
  const lowStockCount = (data ?? []).filter(
    (item) => item.current_qty > 0 && item.current_qty <= item.min_qty
  ).length;
  const outOfStockCount = (data ?? []).filter(
    (item) => item.current_qty === 0
  ).length;

  return NextResponse.json({
    items,
    summary: {
      total_items: (data ?? []).length,
      low_stock: lowStockCount,
      out_of_stock: outOfStockCount,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    mpn: string;
    manufacturer?: string;
    description?: string;
    m_code?: string;
    current_qty?: number;
    min_qty?: number;
    feeder_slot?: string;
  };

  if (!body.mpn) {
    return NextResponse.json({ error: "mpn is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bg_stock")
    .insert({
      mpn: body.mpn,
      manufacturer: body.manufacturer ?? null,
      description: body.description ?? null,
      m_code: body.m_code ?? null,
      current_qty: body.current_qty ?? 0,
      min_qty: body.min_qty ?? 0,
      feeder_slot: body.feeder_slot ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `BG stock item with MPN "${body.mpn}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the initial stock as an addition if qty > 0
  if (data && (body.current_qty ?? 0) > 0) {
    await supabase.from("bg_stock_log").insert({
      bg_stock_id: data.id,
      change_type: "addition",
      quantity_change: body.current_qty!,
      quantity_after: body.current_qty!,
      notes: "Initial stock entry",
      created_by: user.id,
    });
  }

  return NextResponse.json(data, { status: 201 });
}
