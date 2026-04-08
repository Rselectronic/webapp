import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";

/**
 * POST /api/quote-batches/[id]/run-pricing
 *
 * Step 9 of the 11-button sequence: "Get Stock & Price"
 *
 * Calls DigiKey/Mouser/LCSC APIs DIRECTLY for each component at ORDER quantity.
 * This is an intentional, human-authorized API spend — the user must verify
 * the order quantities before this runs.
 *
 * For each component:
 *   1. Check api_pricing_cache (7-day TTL)
 *   2. If not cached → query DigiKey + Mouser + LCSC in parallel
 *   3. Pick the best (cheapest) price
 *   4. Cache the results for 7 days
 *   5. Apply component markup and calculate per-tier extended prices
 *
 * Input: Batch must be in status "extras_calculated"
 * Output: Batch moves to "priced", lines updated with unit_price per tier
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
  let notFound = 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const line of lines) {
    const orderQties = [line.order_qty_1, line.order_qty_2, line.order_qty_3, line.order_qty_4].filter(Boolean) as number[];
    if (orderQties.length === 0) continue;

    const searchKey = (line.mpn || line.cpc || "").trim();
    if (!searchKey) continue;

    // --- Step 1: Check cache (7-day TTL) ---
    const { data: cachedResults } = await admin
      .from("api_pricing_cache")
      .select("unit_price, stock_qty, source, fetched_at")
      .eq("search_key", searchKey.toUpperCase())
      .gte("expires_at", new Date().toISOString())
      .order("unit_price", { ascending: true })
      .limit(3);

    let bestPrice: number | null = null;
    let bestSupplier: string | null = null;
    let bestSupplierPn: string | null = null;
    let stockQty: number | null = null;
    let pricingSource: string | null = null;

    if (cachedResults && cachedResults.length > 0) {
      // Use cached best price
      const best = cachedResults[0];
      bestPrice = best.unit_price;
      bestSupplier = best.source;
      stockQty = best.stock_qty;
      pricingSource = best.source;
      cacheHits++;
    } else {
      // --- Step 2: Query all 3 suppliers in parallel ---
      const [digikey, mouser, lcsc] = await Promise.allSettled([
        searchPartPrice(searchKey),
        searchMouserPrice(searchKey),
        searchLCSCPrice(searchKey),
      ]);
      apiCalls++;

      interface SupplierHit {
        source: string;
        unit_price: number;
        supplier_pn: string;
        stock_qty: number | null;
        mpn: string;
        currency: string;
      }
      const hits: SupplierHit[] = [];

      // Process DigiKey
      if (digikey.status === "fulfilled" && digikey.value) {
        const r = digikey.value;
        hits.push({
          source: "digikey",
          unit_price: r.unit_price,
          supplier_pn: r.digikey_pn,
          stock_qty: null,
          mpn: r.mpn,
          currency: r.currency,
        });
        // Cache it
        await admin.from("api_pricing_cache").upsert(
          {
            source: "digikey",
            mpn: r.mpn,
            search_key: searchKey.toUpperCase(),
            response: r as unknown as Record<string, unknown>,
            unit_price: r.unit_price,
            stock_qty: null,
            currency: r.currency,
            expires_at: expiresAt,
          },
          { onConflict: "source,search_key" }
        );
      }

      // Process Mouser
      if (mouser.status === "fulfilled" && mouser.value) {
        const r = mouser.value;
        hits.push({
          source: "mouser",
          unit_price: r.unit_price,
          supplier_pn: r.mouser_pn,
          stock_qty: r.stock_qty,
          mpn: r.mpn,
          currency: r.currency,
        });
        await admin.from("api_pricing_cache").upsert(
          {
            source: "mouser",
            mpn: r.mpn,
            search_key: searchKey.toUpperCase(),
            response: r as unknown as Record<string, unknown>,
            unit_price: r.unit_price,
            stock_qty: r.stock_qty,
            currency: r.currency,
            expires_at: expiresAt,
          },
          { onConflict: "source,search_key" }
        );
      }

      // Process LCSC
      if (lcsc.status === "fulfilled" && lcsc.value) {
        const r = lcsc.value;
        hits.push({
          source: "lcsc",
          unit_price: r.unit_price,
          supplier_pn: r.lcsc_pn,
          stock_qty: r.stock_qty,
          mpn: r.mpn,
          currency: r.currency,
        });
        await admin.from("api_pricing_cache").upsert(
          {
            source: "lcsc",
            mpn: r.mpn,
            search_key: searchKey.toUpperCase(),
            response: r as unknown as Record<string, unknown>,
            unit_price: r.unit_price,
            stock_qty: r.stock_qty,
            currency: r.currency,
            expires_at: expiresAt,
          },
          { onConflict: "source,search_key" }
        );
      }

      if (hits.length > 0) {
        // Pick cheapest
        const best = hits.reduce((a, b) => a.unit_price <= b.unit_price ? a : b);
        bestPrice = best.unit_price;
        bestSupplier = best.source;
        bestSupplierPn = best.supplier_pn;
        stockQty = best.stock_qty;
        pricingSource = best.source;
      } else {
        notFound++;
        pricingErrors++;
      }
    }

    // --- Step 3: Calculate per-tier pricing with markup ---
    const unitPriceWithMarkup = bestPrice ? bestPrice * (1 + markup) : null;

    const updates: Record<string, unknown> = {
      supplier: bestSupplier,
      supplier_pn: bestSupplierPn,
      stock_qty: stockQty,
      pricing_source: pricingSource,
      pricing_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (unitPriceWithMarkup !== null) {
      updates.unit_price_1 = +unitPriceWithMarkup.toFixed(4);
      updates.unit_price_2 = +unitPriceWithMarkup.toFixed(4);
      updates.unit_price_3 = +unitPriceWithMarkup.toFixed(4);
      updates.unit_price_4 = +unitPriceWithMarkup.toFixed(4);
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
      not_found: notFound,
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
    not_found: notFound,
    errors: pricingErrors,
    message: pricingErrors > 0
      ? `Pricing complete. ${lines.length - pricingErrors} priced, ${notFound} not found at any supplier. Review and manually price missing components.`
      : `Pricing complete — all ${lines.length} components priced from DigiKey/Mouser/LCSC.`,
  });
}
