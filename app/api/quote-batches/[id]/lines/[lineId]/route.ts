import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { saveManualOverride } from "@/lib/mcode/classifier";

/**
 * PATCH /api/quote-batches/[id]/lines/[lineId]
 *
 * Update a single batch line — primarily for M-code overrides (Step 5: "Add Manual MCode").
 * This is the human checkpoint where Piyush corrects auto-assigned M-codes.
 *
 * CRITICAL: When an M-code override is set, it saves to the components table
 * so future BOMs with the same MPN get auto-classified (the learning loop).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { id: batchId, lineId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  // Only allow updating specific fields
  const allowedFields = [
    "m_code_override", "m_code_final", "needs_review", "review_notes",
    "unit_price_1", "unit_price_2", "unit_price_3", "unit_price_4",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const { data, error } = await admin
    .from("quote_batch_lines")
    .update(updates)
    .eq("id", lineId)
    .eq("batch_id", batchId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Learning loop: save manual override to components table
  // so Layer 1 catches this MPN automatically next time
  if (body.m_code_override && data?.mpn) {
    await saveManualOverride(
      data.mpn,
      body.m_code_override,
      data.description,
      data.manufacturer,
      admin
    );
  }

  return NextResponse.json({ line: data });
}
