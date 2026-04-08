import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/** GET /api/quote-batches — List quote batches (optionally filter by customer or status) */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customer_id");
  const status = url.searchParams.get("status");

  const admin = createAdminClient();
  let query = admin
    .from("quote_batches")
    .select("*, customers(code, company_name), quote_batch_boms(id, bom_id, gmp_id, is_active, board_letter)")
    .order("created_at", { ascending: false });

  if (customerId) query = query.eq("customer_id", customerId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ batches: data });
}

/**
 * POST /api/quote-batches — Create a new quote batch
 *
 * Body: {
 *   customer_id: string,
 *   batch_name: string,
 *   bom_ids: string[],        // BOMs to include in this batch
 *   qty_1?: number, qty_2?: number, qty_3?: number, qty_4?: number
 * }
 *
 * This is the equivalent of:
 *   1. Going to DataInputSheets
 *   2. Selecting which GMPs to activate
 *   3. Entering QTY #1 through QTY #4
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { customer_id, batch_name, bom_ids, qty_1, qty_2, qty_3, qty_4 } = body;

  if (!customer_id || !batch_name || !bom_ids?.length) {
    return NextResponse.json(
      { error: "Required: customer_id, batch_name, bom_ids (at least 1)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Validate BOMs exist and belong to this customer
  const { data: boms, error: bomError } = await admin
    .from("boms")
    .select("id, gmp_id, customer_id, status")
    .in("id", bom_ids)
    .eq("customer_id", customer_id);

  if (bomError) return NextResponse.json({ error: bomError.message }, { status: 500 });
  if (!boms || boms.length !== bom_ids.length) {
    return NextResponse.json(
      { error: `Expected ${bom_ids.length} BOMs, found ${boms?.length ?? 0}. All BOMs must belong to the same customer.` },
      { status: 400 }
    );
  }

  const unparsed = boms.filter((b) => b.status !== "parsed");
  if (unparsed.length > 0) {
    return NextResponse.json(
      { error: `${unparsed.length} BOM(s) not yet parsed. Upload and parse all BOMs before creating a batch.` },
      { status: 400 }
    );
  }

  // Create the batch
  const { data: batch, error: batchError } = await admin
    .from("quote_batches")
    .insert({
      batch_name,
      customer_id,
      status: "created",
      qty_1: qty_1 ?? null,
      qty_2: qty_2 ?? null,
      qty_3: qty_3 ?? null,
      qty_4: qty_4 ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Failed to create batch", details: batchError?.message }, { status: 500 });
  }

  // Add BOMs to the batch with board letters (A, B, C, ...)
  const batchBoms = boms.map((bom, idx) => ({
    batch_id: batch.id,
    bom_id: bom.id,
    gmp_id: bom.gmp_id,
    is_active: true,
    board_letter: String.fromCharCode(65 + idx), // A, B, C, ...
  }));

  const { error: bbError } = await admin.from("quote_batch_boms").insert(batchBoms);
  if (bbError) {
    return NextResponse.json({ error: "Failed to add BOMs to batch", details: bbError.message }, { status: 500 });
  }

  // Log the creation
  await admin.from("quote_batch_log").insert({
    batch_id: batch.id,
    action: "created",
    new_status: "created",
    details: { bom_count: bom_ids.length, board_letters: batchBoms.map((b) => b.board_letter) },
    performed_by: user.id,
  });

  return NextResponse.json({
    batch_id: batch.id,
    batch_name: batch.batch_name,
    status: batch.status,
    bom_count: bom_ids.length,
    board_letters: batchBoms.map((b) => b.board_letter),
  });
}
