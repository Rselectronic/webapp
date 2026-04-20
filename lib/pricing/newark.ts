import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Newark / Element14 keyword-search client (Canada store).
// Endpoint: GET api.element14.com/catalog/products?...
// Auth:     API key in the query string (callinfo.apiKey — lowercase "c" on
//           purpose; the rest of the params use callInfo with capital I; this
//           is an Element14 API quirk, not a typo).
// Currency: implicit from storeInfo.id. We pin canada.newark.com → CAD.
// ---------------------------------------------------------------------------

const NEWARK_SEARCH_URL = "https://api.element14.com/catalog/products";
const NEWARK_STORE_ID = "canada.newark.com";
const REQUEST_TIMEOUT_MS = 15_000;
/** Default to 10 products per MPN so we see stock variants (per design decision #8). */
const RESULTS_PER_MPN = 10;

interface NewarkCreds {
  api_key: string;
  /** Optional override — e.g. "www.newark.com" for US, "uk.farnell.com" for UK. */
  store_id?: string;
}

let cachedCreds: { creds: NewarkCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getNewarkCredentials(): Promise<NewarkCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<NewarkCreds>("newark");
    if (fromDb?.api_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through
  }
  const api_key = process.env.NEWARK_API_KEY;
  if (!api_key) return null;
  const creds = { api_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

/** Currency inferred from the store — canada.newark.com is CAD. */
function currencyForStore(storeId: string): string {
  if (storeId.startsWith("canada.")) return "CAD";
  if (storeId.startsWith("uk.") || storeId.startsWith("www.farnell") || storeId.startsWith("farnell")) return "GBP";
  if (storeId.includes("eu.") || storeId.includes(".eu")) return "EUR";
  return "USD";
}

export async function searchNewarkPrice(mpn: string): Promise<SupplierQuote[]> {
  const creds = await getNewarkCredentials();
  if (!creds) return [];

  const storeId = creds.store_id ?? NEWARK_STORE_ID;
  const currency = currencyForStore(storeId);

  // Element14 expects the literal string "manuPartNum:<MPN>" as the term
  // (colon + URL-encoded space). We build via URLSearchParams but the "term"
  // still needs the colon format.
  const params = new URLSearchParams({
    versionNumber: "1.4",
    term: `manuPartNum:${mpn}`,
    "storeInfo.id": storeId,
    "resultsSettings.offset": "0",
    "resultsSettings.numberOfResults": String(RESULTS_PER_MPN),
    "resultsSettings.responseGroup": "large",
    "callInfo.omitXmlSchema": "false",
    "callInfo.responseDataFormat": "json",
    "callinfo.apiKey": creds.api_key,   // NB: lowercase callinfo — E14 quirk
  });

  const url = `${NEWARK_SEARCH_URL}?${params.toString()}`;
  let json: { manufacturerPartNumberSearchReturn?: { products?: unknown[] } } | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const products = Array.isArray(json?.manufacturerPartNumberSearchReturn?.products)
    ? json.manufacturerPartNumberSearchReturn.products
    : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of products) {
    const p = raw as Record<string, unknown>;
    const rawBreaks = Array.isArray(p.prices) ? p.prices : [];
    const priceBreaks: PriceBreak[] = [];
    for (const b of rawBreaks) {
      const br = b as { from?: unknown; to?: unknown; cost?: unknown };
      const fromQ = Number(br.from);
      const toQ = Number(br.to);
      const price = Number(br.cost);
      if (!Number.isFinite(fromQ) || !Number.isFinite(price)) continue;
      priceBreaks.push({
        min_qty: fromQ,
        // Newark uses 999_999_999 as the open-ended upper bound
        max_qty: Number.isFinite(toQ) && toQ < 999_999_999 ? toQ : null,
        unit_price: price,
        currency,
      });
    }

    const unitPrice = priceBreaks[0]?.unit_price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    const stock = p.stock as { level?: unknown; leastLeadTime?: unknown } | undefined;
    const level = stock ? Number(stock.level) : Number(p.inv);
    const leadTimeDays = stock && Number.isFinite(Number(stock.leastLeadTime))
      ? Number(stock.leastLeadTime)
      : null;

    // NB: Element14 field name has a typo — "translatedMinimumOrderQuality"
    // really means "Quantity". Don't "fix" it, match their schema.
    const moqRaw = Number((p as { translatedMinimumOrderQuality?: unknown }).translatedMinimumOrderQuality);
    const orderMultipleRaw = Number((p as { orderMultiples?: unknown }).orderMultiples);

    quotes.push({
      source: "newark",
      mpn: String(p.translatedManufacturerPartNumber ?? mpn),
      manufacturer: (p.brandName as string | null) ?? (p.vendorName as string | null) ?? null,
      supplier_part_number: (p.sku as string | null) ?? null,
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: Number.isFinite(level) ? level : null,
      moq: Number.isFinite(moqRaw) ? moqRaw : null,
      order_multiple: Number.isFinite(orderMultipleRaw) ? orderMultipleRaw : null,
      lead_time_days: leadTimeDays,
      warehouse_code: null,
      ncnr: null,
      franchised: null,
      lifecycle_status: (p.productStatus as string | null) ?? null,
      datasheet_url: getFirstDatasheet(p.datasheets),
      product_url: (p.productURL as string | null) ?? null,
    });
  }

  return quotes;
}

function getFirstDatasheet(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0] as { url?: unknown };
  return typeof first?.url === "string" ? first.url : null;
}
