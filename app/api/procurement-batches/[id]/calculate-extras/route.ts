import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier } from "@/lib/pricing/types";

/**
 * POST /api/procurement-batches/[id]/calculate-extras
 *
 * Recalculates overage at the COMBINED order quantity.
 *
 * This is the key cost-saving step: when you order 500 of a component once
 * instead of 5 orders of 100, the overage is calculated at the 500 tier
 * which often requires FEWER extras per unit.
 *
 * Example:
 *   - Job A needs 100 CP parts → overage at 100 = 35 extras
 *   - Job B needs 200 CP parts → overage at 200 = 40 extras
 *   - Original total extras = 75
 *   - Combined 300 CP parts → overage at 300 = 50 extras
 *   - Savings = 25 fewer extras to order
 *
 * Input: Batch must be in status "merged"
 * Output: Batch moves to "extras_calculated", lines updated with combined overage
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Validate batch
  const { data: batch } = await admin
    .from("procurement_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "merged") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Calculate extras requires "merged".` },
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

  // Fetch all lines
  const { data: lines } = await admin
    .from("procurement_batch_lines")
    .select("id, mpn, m_code, individual_qty, original_extras, unit_price")
    .eq("batch_id", batchId)
    .order("line_number", { ascending: true });

  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "No component lines found" }, { status: 400 });
  }

  let totalSavings = 0;
  let totalOrderValue = 0;

  for (const line of lines) {
    const mCode = line.m_code || "CP";
    const combinedExtras = getOverage(mCode, line.individual_qty, overageData);
    const extrasSavings = (line.original_extras ?? 0) - combinedExtras;
    const orderQty = line.individual_qty + combinedExtras;
    const extendedPrice = line.unit_price ? +(Number(line.unit_price) * orderQty).toFixed(2) : null;

    totalSavings += Math.max(0, extrasSavings);
    if (extendedPrice) totalOrderValue += extendedPrice;

    await admin
      .from("procurement_batch_lines")
      .update({
        combined_extras: combinedExtras,
        extras_savings: extrasSavings,
        order_qty: orderQty,
        extended_price: extendedPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
  }

  // Update batch status and total order value
  await admin
    .from("procurement_batches")
    .update({
      status: "extras_calculated",
      total_order_value: +totalOrderValue.toFixed(2),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batchId,
    action: "extras_calculated",
    old_status: "merged",
    new_status: "extras_calculated",
    details: {
      components: lines.length,
      total_extras_savings: totalSavings,
      total_order_value: +totalOrderValue.toFixed(2),
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "extras_calculated",
    components: lines.length,
    total_extras_savings: totalSavings,
    total_order_value: +totalOrderValue.toFixed(2),
    message: totalSavings > 0
      ? `Extras recalculated. Batch ordering saves ${totalSavings} extra parts vs individual ordering. Review order quantities, then allocate suppliers.`
      : "Extras recalculated. Review order quantities, then allocate suppliers.",
  });
}
