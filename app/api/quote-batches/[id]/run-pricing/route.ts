import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";
import { lookupHistoricalPricesBulk, lookupComponentSupplierPNsBulk, cacheHistoricalPrice } from "@/lib/pricing/historical";

/**
 * POST /api/quote-batches/[id]/run-pricing
 *
 * Step 9 of the 11-button sequence: "Get Stock & Price"
 *
 * Calls DigiKey/Mouser/LCSC APIs DIRECTLY for each component at ORDER quantity.
 * This is an intentional, human-authorized API spend — the user must verify
 * the order quantities before this runs.
 *
 * Stock-aware supplier selection (matches Excel SOP Phase G2):
 *   - Prefer cheapest supplier WITH stock (stock_qty > 0 or unknown/null)
 *   - If all suppliers have confirmed zero stock → pick cheapest, flag out_of_stock
 *   - If no supplier returns a result → flag not_found for manual resolution
 *   - Preserve DigiKey part number when both fail (for Piyush's manual lookup)
 *
 * For each component:
 *   1. Check api_pricing_cache (7-day TTL)
 *   2. If not cached → query DigiKey + Mouser + LCSC in parallel
 *   3. Pick the best price using stock-aware logic
 *   4. Cache the results for 7 days
 *   5. Apply component markup and calculate per-tier extended prices
 *
 * Input: Batch must be in status "extras_calculated"
 * Output: Batch moves to "priced", lines updated with unit_price per tier
 */

type StockStatus = "in_stock" | "out_of_stock" | "unknown" | "not_found";

interface SupplierHit {
  source: string;
  unit_price: number;
  supplier_pn: string;
  stock_qty: number | null;
  mpn: string;
  currency: string;
}

/**
 * Stock-aware best-price selection.
 * Backward compatible: null stock_qty (old cache entries) treated as unknown = don't penalize.
 */
function selectBestHit(hits: SupplierHit[]): { best: SupplierHit; stock_status: StockStatus } | null {
  if (hits.length === 0) return null;

  // Separate into "has stock or unknown" vs "confirmed zero stock"
  const withStockOrUnknown = hits.filter(
    (h) => h.stock_qty === null || h.stock_qty === undefined || h.stock_qty > 0
  );

  if (withStockOrUnknown.length > 0) {
    const best = withStockOrUnknown.reduce((a, b) =>
      a.unit_price <= b.unit_price ? a : b
    );
    const stock_status: StockStatus =
      best.stock_qty === null || best.stock_qty === undefined
        ? "unknown"
        : best.stock_qty > 0
          ? "in_stock"
          : "out_of_stock";
    return { best, stock_status };
  }

  // All confirmed zero stock — pick cheapest anyway but flag it
  const best = hits.reduce((a, b) =>
    a.unit_price <= b.unit_price ? a : b
  );
  return { best, stock_status: "out_of_stock" };
}

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

  const markup = (batch.component_markup_pct ?? 25) / 100;
  let apiCalls = 0;
  let cacheHits = 0;
  let pricingErrors = 0;
  let notFound = 0;
  let historicalHits = 0;
  let inStockCount = 0;
  let outOfStockCount = 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pre-fetch historical prices and component supplier PNs in bulk.
  // Historical price lookup is mpn-keyed (procurement_lines.mpn). Components
  // lookup is cpc-keyed (see lib/pricing/historical.ts) so we pass {mpn, cpc}
  // pairs and let the bulk helper do the join.
  const allMpns = lines.map((l: { mpn: string }) => l.mpn).filter(Boolean);
  const mpnCpcPairs = lines
    .filter((l: { mpn?: string | null }) => Boolean(l.mpn))
    .map((l: { mpn: string; cpc?: string | null }) => ({ mpn: l.mpn, cpc: l.cpc ?? null }));
  const [historicalMap, supplierPNsMap] = await Promise.all([
    lookupHistoricalPricesBulk(admin, allMpns),
    lookupComponentSupplierPNsBulk(admin, mpnCpcPairs),
  ]);

  for (const line of lines) {
    const orderQties = [line.order_qty_1, line.order_qty_2, line.order_qty_3, line.order_qty_4].filter(Boolean) as number[];
    if (orderQties.length === 0) continue;

    const searchKey = (line.mpn || line.cpc || "").trim();
    if (!searchKey) continue;

    // --- Step 1: Check cache (7-day TTL) ---
    const { data: cachedResults } = await admin
      .from("api_pricing_cache")
      .select("unit_price, stock_qty, source, fetched_at, response")
      .eq("search_key", searchKey.toUpperCase())
      .gte("expires_at", new Date().toISOString())
      .limit(3);

    let bestPrice: number | null = null;
    let bestSupplier: string | null = null;
    let bestSupplierPn: string | null = null;
    let stockQty: number | null = null;
    let stockStatus: StockStatus = "unknown";
    let pricingSource: string | null = null;
    let digikeyPn: string | null = null;

    if (cachedResults && cachedResults.length > 0) {
      // Build hits from cache for stock-aware selection
      const cachedHits: SupplierHit[] = cachedResults.map((c) => ({
        source: c.source,
        unit_price: c.unit_price,
        supplier_pn: "",
        stock_qty: c.stock_qty,
        mpn: searchKey,
        currency: "CAD",
      }));

      const selected = selectBestHit(cachedHits);
      if (selected) {
        bestPrice = selected.best.unit_price;
        bestSupplier = selected.best.source;
        stockQty = selected.best.stock_qty;
        stockStatus = selected.stock_status;
        pricingSource = selected.best.source;
      }

      // Try to extract DigiKey PN from cached DigiKey response
      const dkCache = cachedResults.find((c) => c.source === "digikey");
      if (dkCache?.response) {
        const resp = dkCache.response as Record<string, unknown>;
        digikeyPn = (resp.digikey_pn as string) ?? null;
      }

      cacheHits++;
    } else {
      // --- Step 2: Query all 3 suppliers in parallel ---
      // Use supplier-specific PNs from components table if available
      const pns = supplierPNsMap.get(searchKey.toUpperCase()) || { digikey_pn: null, mouser_pn: null, lcsc_pn: null };
      const [digikey, mouser, lcsc] = await Promise.allSettled([
        searchPartPrice(pns.digikey_pn || searchKey),
        searchMouserPrice(pns.mouser_pn || searchKey),
        searchLCSCPrice(pns.lcsc_pn || searchKey),
      ]);
      apiCalls++;

      const hits: SupplierHit[] = [];

      // Process DigiKey
      if (digikey.status === "fulfilled" && digikey.value) {
        const r = digikey.value;
        digikeyPn = r.digikey_pn;
        hits.push({
          source: "digikey",
          unit_price: r.unit_price,
          supplier_pn: r.digikey_pn,
          stock_qty: r.stock_qty,
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
            stock_qty: r.stock_qty,
            currency: r.currency,
            expires_at: expiresAt,
          },
          { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
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
          { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
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
          { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
        );
      }

      if (hits.length > 0) {
        const selected = selectBestHit(hits);
        if (selected) {
          bestPrice = selected.best.unit_price;
          bestSupplier = selected.best.source;
          bestSupplierPn = selected.best.supplier_pn;
          stockQty = selected.best.stock_qty;
          stockStatus = selected.stock_status;
          pricingSource = selected.best.source;
        }
      } else {
        // No API results — try historical procurement data
        const histResult = historicalMap.get(searchKey.toUpperCase());
        const hist = histResult?.latest;
        if (hist) {
          bestPrice = hist.unit_price;
          pricingSource = "procurement_history";
          historicalHits++;
          await cacheHistoricalPrice(admin, line.mpn, searchKey, hist);
        } else {
          notFound++;
          pricingErrors++;
        }
        stockStatus = "not_found";
      }
    }

    // Track stock status counts
    if (stockStatus === "in_stock") inStockCount++;
    else if (stockStatus === "out_of_stock") outOfStockCount++;

    // --- Step 3: Calculate per-tier pricing with markup ---
    const unitPriceWithMarkup = bestPrice ? bestPrice * (1 + markup) : null;

    const updates: Record<string, unknown> = {
      supplier: bestSupplier,
      supplier_pn: bestSupplierPn || digikeyPn,
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
      historical_hits: historicalHits,
      pricing_errors: pricingErrors,
      in_stock_count: inStockCount,
      out_of_stock_count: outOfStockCount,
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
    historical_hits: historicalHits,
    in_stock_count: inStockCount,
    out_of_stock_count: outOfStockCount,
    errors: pricingErrors,
    message: buildSummaryMessage(lines.length, pricingErrors, notFound, outOfStockCount, historicalHits),
  });
}

function buildSummaryMessage(
  total: number,
  errors: number,
  notFound: number,
  outOfStock: number,
  historicalHits: number = 0
): string {
  const priced = total - errors;
  const parts: string[] = [`${priced}/${total} components priced`];

  if (historicalHits > 0) {
    parts.push(`${historicalHits} from procurement history`);
  }
  if (outOfStock > 0) {
    parts.push(`${outOfStock} out of stock (priced at best available)`);
  }
  if (notFound > 0) {
    parts.push(`${notFound} not found at any supplier — needs manual pricing`);
  }
  if (errors === 0 && outOfStock === 0 && historicalHits === 0) {
    parts[0] = `All ${total} components priced with stock confirmed`;
  }

  return parts.join(". ") + ".";
}
