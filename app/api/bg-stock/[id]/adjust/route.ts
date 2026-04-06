import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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
    change_type: "addition" | "subtraction" | "adjustment" | "physical_count";
    quantity: number;
    notes?: string;
    reference_id?: string;
    reference_type?: string;
  };

  if (!body.change_type || body.quantity == null) {
    return NextResponse.json(
      { error: "change_type and quantity are required" },
      { status: 400 }
    );
  }

  const validTypes = ["addition", "subtraction", "adjustment", "physical_count"];
  if (!validTypes.includes(body.change_type)) {
    return NextResponse.json(
      { error: `change_type must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // Fetch current stock
  const { data: item, error: fetchError } = await supabase
    .from("bg_stock")
    .select("id, current_qty")
    .eq("id", id)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: "BG stock item not found" }, { status: 404 });
  }

  // Calculate new quantity
  let newQty: number;
  let quantityChange: number;

  if (body.change_type === "physical_count") {
    // Physical count sets absolute quantity
    newQty = body.quantity;
    quantityChange = body.quantity - item.current_qty;
  } else if (body.change_type === "subtraction") {
    quantityChange = -Math.abs(body.quantity);
    newQty = item.current_qty + quantityChange;
  } else if (body.change_type === "addition") {
    quantityChange = Math.abs(body.quantity);
    newQty = item.current_qty + quantityChange;
  } else {
    // adjustment — signed value
    quantityChange = body.quantity;
    newQty = item.current_qty + quantityChange;
  }

  // Prevent negative stock
  if (newQty < 0) {
    return NextResponse.json(
      { error: `Cannot reduce stock below 0. Current: ${item.current_qty}, change: ${quantityChange}` },
      { status: 400 }
    );
  }

  // Update stock quantity
  const { error: updateError } = await supabase
    .from("bg_stock")
    .update({
      current_qty: newQty,
      updated_at: new Date().toISOString(),
      ...(body.change_type === "physical_count"
        ? { last_counted_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Create log entry
  const { data: logEntry, error: logError } = await supabase
    .from("bg_stock_log")
    .insert({
      bg_stock_id: id,
      change_type: body.change_type,
      quantity_change: quantityChange,
      quantity_after: newQty,
      reference_id: body.reference_id ?? null,
      reference_type: body.reference_type ?? null,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  return NextResponse.json({
    bg_stock_id: id,
    previous_qty: item.current_qty,
    new_qty: newQty,
    change: quantityChange,
    log: logEntry,
  });
}
