import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";

/**
 * POST /api/quote-batches/[id]/calculate-extras
 *
 * Step 6 of the 11-button sequence: "Get Final Qty"
 *
 * For each component line, calculates:
 *   order_qty = (bom_qty × board_qty_per_tier) + extras
 *   where extras depend on the M-code (TH gets more than CP, 0402 gets most)
 *
 * This is where BOM quantity diverges from ORDER quantity.
 * The user MUST see these numbers before authorizing API calls.
 *
 * Input: Batch must be in status "mcodes_assigned" and qty tiers must be set
 * Output: Batch moves to "extras_calculated", lines updated with extras and order_qty per tier
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Validate batch
  const { data: batch } = await admin
    .from("quote_batches")
    .select("id, status, qty_1, qty_2, qty_3, qty_4")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "mcodes_assigned") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Calculate extras requires "mcodes_assigned".` },
      { status: 400 }
    );
  }

  // At least one qty tier must be set
  const tiers = [batch.qty_1, batch.qty_2, batch.qty_3, batch.qty_4].filter(Boolean);
  if (tiers.length === 0) {
    return NextResponse.json(
      { error: "No quantity tiers set. Update the batch with at least one qty tier before calculating extras." },
      { status: 400 }
    );
  }

  // Check for unreviewed lines
  const { count: unreviewedCount } = await admin
    .from("quote_batch_lines")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("is_pcb", false)
    .eq("needs_review", true)
    .is("m_code_override", null);

  if (unreviewedCount && unreviewedCount > 0) {
    return NextResponse.json(
      { error: `${unreviewedCount} component(s) still need M-code review. Override or confirm all flagged lines before calculating extras.` },
      { status: 400 }
    );
  }

  // Fetch overage tiers from database
  const { data: overageTiers } = await admin
    .from("overage_table")
    .select("m_code, qty_threshold, extras")
    .order("m_code")
    .order("qty_threshold", { ascending: true });

  const overageData: OverageTier[] = (overageTiers ?? []).map((t) => ({
    m_code: t.m_code,
    qty_threshold: t.qty_threshold,
    extras: t.extras,
  }));

  // Fetch all non-PCB lines
  const { data: lines } = await admin
    .from("quote_batch_lines")
    .select("id, mpn, bom_qty, m_code, m_code_override, is_pcb")
    .eq("batch_id", batchId)
    .eq("is_pcb", false)
    .order("line_number", { ascending: true });

  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "No component lines found" }, { status: 400 });
  }

  // For each line, calculate extras and order qty per tier
  for (const line of lines) {
    const mCode = line.m_code_override ?? line.m_code ?? "CP";
    const extras = getOverage(mCode, line.bom_qty, overageData);

    // Order qty per tier = (bom_qty_per_board × boards_in_tier) + extras
    // bom_qty is already the cross-board total from the merge step
    // For quoting, order_qty = bom_qty × tier_qty + extras
    // But actually: bom_qty is "per board" total across all boards in the batch
    // and tier qty is how many SETS of boards the customer wants
    const orderQty1 = batch.qty_1 ? (line.bom_qty * batch.qty_1) + extras : null;
    const orderQty2 = batch.qty_2 ? (line.bom_qty * batch.qty_2) + extras : null;
    const orderQty3 = batch.qty_3 ? (line.bom_qty * batch.qty_3) + extras : null;
    const orderQty4 = batch.qty_4 ? (line.bom_qty * batch.qty_4) + extras : null;

    await admin
      .from("quote_batch_lines")
      .update({
        m_code_final: mCode,
        extras,
        order_qty_1: orderQty1,
        order_qty_2: orderQty2,
        order_qty_3: orderQty3,
        order_qty_4: orderQty4,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
  }

  // Update batch status
  await admin
    .from("quote_batches")
    .update({ status: "extras_calculated", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  // Log
  await admin.from("quote_batch_log").insert({
    batch_id: batchId,
    action: "extras_calculated",
    old_status: "mcodes_assigned",
    new_status: "extras_calculated",
    details: {
      components: lines.length,
      tiers_active: tiers.length,
      qty_tiers: { qty_1: batch.qty_1, qty_2: batch.qty_2, qty_3: batch.qty_3, qty_4: batch.qty_4 },
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "extras_calculated",
    components: lines.length,
    tiers: { qty_1: batch.qty_1, qty_2: batch.qty_2, qty_3: batch.qty_3, qty_4: batch.qty_4 },
    message: "Extras calculated. Review order quantities, then run API pricing.",
  });
}
