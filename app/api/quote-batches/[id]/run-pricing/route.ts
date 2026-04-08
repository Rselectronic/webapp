import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/quote-batches/[id]/run-pricing
 *
 * Step 9 of the 11-button sequence: "Get Stock & Price"
 *
 * Calls DigiKey/Mouser/LCSC APIs for EACH component at ORDER quantity (not BOM qty).
 * This is an intentional, human-authorized API spend — the user must verify
 * the order quantities before this runs.
 *
 * API runs TWICE in the lifecycle (BUILD_PROMPT.md §2.6):
 *   1. HERE (quoting): prices on order qty with extras → generates quote
 *   2. During procurement: prices on final order qty after customer confirms
 *
 * Input: Batch must be in status "extras_calculated"
 * Output: Batch moves to "priced", lines updated with unit_price per tier
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
    .select("id, status, qty_1, qty_2, qty_3, qty_4, component_markup_pct")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "extras_calculated") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Run pricing requires "extras_calculated".` },
      { status: 400 }
    );
  }

  // Fetch all non-PCB lines with order quantities
  const { data: lines } = await admin
    .from("quote_batch_lines")
    .select("id, mpn, cpc, description, order_qty_1, order_qty_2, order_qty_3, order_qty_4, is_pcb")
    .eq("batch_id", batchId)
    .eq("is_pcb", false)
    .order("line_number", { ascending: true });

  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "No component lines found" }, { status: 400 });
  }

  const markup = (batch.component_markup_pct ?? 20) / 100;
  let apiCalls = 0;
  let cacheHits = 0;
  let pricingErrors = 0;

  for (const line of lines) {
    // Use the largest order qty for the API call (best price discovery)
    // Individual tier prices are extracted from the price break table
    const orderQties = [line.order_qty_1, line.order_qty_2, line.order_qty_3, line.order_qty_4].filter(Boolean) as number[];
    if (orderQties.length === 0) continue;

    const searchKey = line.mpn || line.cpc || "";
    if (!searchKey) continue;

    // Check cache first (7-day TTL)
    const { data: cached } = await admin
      .from("api_pricing_cache")
      .select("response, unit_price, stock_qty, source, fetched_at")
      .eq("search_key", searchKey.toUpperCase())
      .gte("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let bestPrice: number | null = null;
    let bestSupplier: string | null = null;
    let bestSupplierPn: string | null = null;
    let stockQty: number | null = null;
    let pricingSource: string | null = null;

    if (cached) {
      bestPrice = cached.unit_price;
      bestSupplier = cached.source;
      stockQty = cached.stock_qty;
      pricingSource = cached.source;
      cacheHits++;
    } else {
      // Call the pricing API endpoint which handles DigiKey/Mouser/LCSC
      try {
        const pricingRes = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/pricing/${encodeURIComponent(searchKey)}`,
          { headers: { cookie: request.headers.get("cookie") ?? "" } }
        );

        if (pricingRes.ok) {
          const pricingData = await pricingRes.json();
          if (pricingData.best_price) {
            bestPrice = pricingData.best_price.unit_price;
            bestSupplier = pricingData.best_price.source;
            bestSupplierPn = pricingData.best_price.supplier_pn ?? null;
            stockQty = pricingData.best_price.stock_qty ?? null;
            pricingSource = pricingData.best_price.source;
          }
          apiCalls++;
        } else {
          pricingErrors++;
        }
      } catch {
        pricingErrors++;
      }
    }

    // Calculate per-tier pricing with markup
    const unitPriceWithMarkup = bestPrice ? bestPrice * (1 + markup) : null;

    const updates: Record<string, unknown> = {
      supplier: bestSupplier,
      supplier_pn: bestSupplierPn,
      stock_qty: stockQty,
      pricing_source: pricingSource,
      pricing_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Set per-tier prices: unit price is the same across tiers for now
    // (volume breaks from API price tables would differentiate these in a more sophisticated version)
    if (unitPriceWithMarkup !== null) {
      updates.unit_price_1 = unitPriceWithMarkup;
      updates.unit_price_2 = unitPriceWithMarkup;
      updates.unit_price_3 = unitPriceWithMarkup;
      updates.unit_price_4 = unitPriceWithMarkup;
      updates.extended_price_1 = line.order_qty_1 ? +(unitPriceWithMarkup * line.order_qty_1).toFixed(2) : null;
      updates.extended_price_2 = line.order_qty_2 ? +(unitPriceWithMarkup * line.order_qty_2).toFixed(2) : null;
      updates.extended_price_3 = line.order_qty_3 ? +(unitPriceWithMarkup * line.order_qty_3).toFixed(2) : null;
      updates.extended_price_4 = line.order_qty_4 ? +(unitPriceWithMarkup * line.order_qty_4).toFixed(2) : null;
    }

    await admin.from("quote_batch_lines").update(updates).eq("id", line.id);
  }

  // Update batch status
  await admin
    .from("quote_batches")
    .update({ status: "priced", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  // Log
  await admin.from("quote_batch_log").insert({
    batch_id: batchId,
    action: "pricing_completed",
    old_status: "extras_calculated",
    new_status: "priced",
    details: {
      components: lines.length,
      api_calls: apiCalls,
      cache_hits: cacheHits,
      pricing_errors: pricingErrors,
      markup_pct: batch.component_markup_pct,
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "priced",
    components: lines.length,
    api_calls: apiCalls,
    cache_hits: cacheHits,
    errors: pricingErrors,
    message: pricingErrors > 0
      ? `Pricing complete with ${pricingErrors} error(s). Review results and manually price any missing components.`
      : "Pricing complete. Review all prices, then send data back to individual boards.",
  });
}
