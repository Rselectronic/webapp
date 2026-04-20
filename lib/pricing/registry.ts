import type { SupplierQuote } from "./types";
import type { BuiltInSupplierName } from "@/lib/supplier-credentials";
import { searchPartPrice } from "./digikey";
import { searchMouserPrice } from "./mouser";
import { searchLcscQuotes } from "./lcsc";
import { searchTtiPrice } from "./tti";
import { searchNewarkPrice } from "./newark";
import { searchFuturePrice } from "./future";
import { searchTiPrice, looksLikeTiPart } from "./ti";
import { searchAvnetPrice } from "./avnet";
import { searchArrowPrice } from "./arrow";
import { searchTmePrice } from "./tme";
import { searchSamtecPrice, looksLikeSamtecPart } from "./samtec";
import { searchEsonicPrice } from "./esonic";

// ---------------------------------------------------------------------------
// Supplier registry — single place to look up a search function by supplier
// name. The Component Pricing Review API route iterates over the user-selected
// suppliers and dispatches through this registry.
//
// Some suppliers (TI, Samtec) are manufacturer-direct and only respond for
// parts they make — those have a `manufacturerFilter` that pre-checks the MPN
// + manufacturer before spending an API call.
// ---------------------------------------------------------------------------

export interface SupplierSearchContext {
  mpn: string;
  manufacturer?: string | null;
  /**
   * Quantity to pass to single-price suppliers (currently only Avnet) so the
   * returned unit price reflects the actual order volume. Break-table suppliers
   * ignore this — they always return the full ladder in one call.
   */
  quantity?: number;
}

export type SupplierSearchFn = (ctx: SupplierSearchContext) => Promise<SupplierQuote[]>;

/**
 * Convert a supplier's raw `{ quantity, unit_price }` break list (already
 * ascending) into the unified PriceBreak shape with `min_qty` / `max_qty`.
 * `max_qty` of each tier becomes `(next.quantity - 1)`; the last tier is
 * open-ended (null).
 */
function toUnifiedBreaks(
  raw: Array<{ quantity: number; unit_price: number; currency: string }>
) {
  const sorted = [...raw].sort((a, b) => a.quantity - b.quantity);
  return sorted.map((b, i) => ({
    min_qty: b.quantity,
    max_qty: i < sorted.length - 1 ? sorted[i + 1].quantity - 1 : null,
    unit_price: b.unit_price,
    currency: b.currency,
  }));
}

/**
 * DigiKey adapter — now exposes the full StandardPricing break table from
 * the product's first variation. If the variation doesn't publish breaks
 * (rare but possible for non-stocked parts), falls back to a single-entry
 * ladder anchored at the headline unit_price.
 */
async function searchDigikeyQuotes(
  ctx: SupplierSearchContext
): Promise<SupplierQuote[]> {
  const r = await searchPartPrice(ctx.mpn);
  if (!r || !Number.isFinite(r.unit_price) || r.unit_price <= 0) return [];
  const breaks = r.price_breaks.length > 0
    ? toUnifiedBreaks(r.price_breaks)
    : [{ min_qty: 1, max_qty: null, unit_price: r.unit_price, currency: r.currency }];
  return [{
    source: "digikey",
    mpn: r.mpn,
    manufacturer: null,        // not surfaced by the v4 keyword endpoint directly
    supplier_part_number: r.digikey_pn || null,
    unit_price: breaks[0].unit_price,
    currency: breaks[0].currency,
    price_breaks: breaks,
    stock_qty: r.stock_qty ?? null,
    moq: null,
    order_multiple: null,
    lead_time_days: null,
    warehouse_code: null,
    ncnr: null,
    franchised: true,           // DigiKey is always an authorized distributor
    lifecycle_status: null,
    datasheet_url: null,
    product_url: null,
  }];
}

/**
 * Mouser adapter — exposes the full PriceBreaks[] array so the review page
 * can resolve per-tier prices correctly. Same single-entry fallback as DigiKey
 * when a part doesn't publish a break ladder.
 */
async function searchMouserQuotes(
  ctx: SupplierSearchContext
): Promise<SupplierQuote[]> {
  const r = await searchMouserPrice(ctx.mpn);
  if (!r || !Number.isFinite(r.unit_price) || r.unit_price <= 0) return [];
  const breaks = r.price_breaks.length > 0
    ? toUnifiedBreaks(r.price_breaks)
    : [{ min_qty: 1, max_qty: null, unit_price: r.unit_price, currency: r.currency }];
  return [{
    source: "mouser",
    mpn: r.mpn,
    manufacturer: null,
    supplier_part_number: r.mouser_pn || null,
    unit_price: breaks[0].unit_price,
    currency: breaks[0].currency,
    price_breaks: breaks,
    stock_qty: r.stock_qty ?? null,
    moq: null,
    order_multiple: null,
    lead_time_days: null,
    warehouse_code: null,
    ncnr: null,
    franchised: true,
    lifecycle_status: null,
    datasheet_url: null,
    product_url: null,
  }];
}

export const SUPPLIER_REGISTRY: Record<BuiltInSupplierName, SupplierSearchFn> = {
  digikey: searchDigikeyQuotes,
  mouser:  searchMouserQuotes,
  lcsc:    (ctx) => searchLcscQuotes(ctx.mpn),
  tti:     (ctx) => searchTtiPrice(ctx.mpn),
  newark:  (ctx) => searchNewarkPrice(ctx.mpn),
  future:  (ctx) => searchFuturePrice(ctx.mpn),
  ti:      (ctx) => searchTiPrice(ctx.mpn, ctx.manufacturer),
  avnet:   (ctx) => searchAvnetPrice(ctx.mpn, ctx.quantity),
  arrow:   (ctx) => searchArrowPrice(ctx.mpn),
  tme:     (ctx) => searchTmePrice(ctx.mpn),
  samtec:  (ctx) => searchSamtecPrice(ctx.mpn, ctx.manufacturer),
  esonic:  (ctx) => searchEsonicPrice(ctx.mpn),
};

/**
 * Some suppliers (TI, Samtec) only carry their own parts. The review page
 * should hide their checkbox for rows they can't service to keep the UI clean
 * and avoid wasted API calls. This helper answers "could supplier X plausibly
 * have MPN Y?" before we even make the request.
 */
export function supplierCanServiceMpn(
  supplier: BuiltInSupplierName,
  mpn: string,
  manufacturer?: string | null
): boolean {
  if (supplier === "ti") return looksLikeTiPart(mpn, manufacturer);
  if (supplier === "samtec") return looksLikeSamtecPart(mpn, manufacturer);
  return true;
}

/** Safe wrapper: returns [] if the supplier name isn't known or the call throws. */
export async function runSupplierSearch(
  supplier: string,
  ctx: SupplierSearchContext
): Promise<SupplierQuote[]> {
  const fn = (SUPPLIER_REGISTRY as Record<string, SupplierSearchFn>)[supplier];
  if (!fn) return [];
  try {
    return await fn(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[pricing] supplier=${supplier} mpn=${ctx.mpn} threw: ${msg}`);
    return [];
  }
}
