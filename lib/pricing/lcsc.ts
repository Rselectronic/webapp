import { createHash } from "crypto";
import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// LCSC wmsc2agent search client.
// Fixed 2026-04-20: the previous client sent `sign=<hash>` and expected
// `result.tipProductDetailUrlVO`, which was an older API version. The working
// endpoint per Piyush's Postman:
//   GET https://ips.lcsc.com/rest/wmsc2agent/search/product
//        ?keyword=<mpn>&key=<K>&nonce=<N>&timestamp=<T>&signature=<S>
// where signature = SHA1-hex of `key=K&nonce=N&secret=S&timestamp=T`
// (params alphabetized by key, NOT the same ordering as OAuth1).
// Response shape: { result: { product_list: [...] } }
// ---------------------------------------------------------------------------

const LCSC_SEARCH_URL = "https://ips.lcsc.com/rest/wmsc2agent/search/product";
const REQUEST_TIMEOUT_MS = 15_000;

interface LcscCreds {
  api_key: string;
  api_secret: string;
}

let cachedCreds: { creds: LcscCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getLcscCredentials(): Promise<LcscCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<LcscCreds>("lcsc");
    if (fromDb?.api_key && fromDb?.api_secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through
  }
  const api_key = process.env.LCSC_API_KEY;
  const api_secret = process.env.LCSC_API_SECRET;
  if (!api_key || !api_secret) return null;
  const creds = { api_key, api_secret };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

function generateNonce(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function sha1Hex(data: string): string {
  return createHash("sha1").update(data).digest("hex");
}

/**
 * Fetch LCSC product data for an MPN. Returns the raw product object from the
 * response, or null on any error. Used by both the legacy `searchLCSCPrice`
 * (flat-shape) export and the new `searchLcscQuotes` (SupplierQuote[]) export.
 */
async function fetchLcscProduct(
  mpn: string
): Promise<Record<string, unknown> | null> {
  const creds = await getLcscCredentials();
  if (!creds) return null;

  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Params alphabetized in the signing payload: key, nonce, secret, timestamp.
  const signPayload = `key=${creds.api_key}&nonce=${nonce}&secret=${creds.api_secret}&timestamp=${timestamp}`;
  const signature = sha1Hex(signPayload);

  const params = new URLSearchParams({
    keyword: mpn,
    key: creds.api_key,
    nonce,
    timestamp,
    signature,
  });

  try {
    const res = await fetch(`${LCSC_SEARCH_URL}?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      console.warn(`[lcsc] HTTP ${res.status} for mpn=${mpn}`);
      return null;
    }
    const data = (await res.json()) as {
      success?: boolean;
      code?: number;
      result?: { product_list?: unknown[] };
    };
    if (data.code !== 200 || !data.success) return null;
    const products = Array.isArray(data.result?.product_list) ? data.result.product_list : [];
    return (products[0] as Record<string, unknown>) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[lcsc] network error for mpn=${mpn} — ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy flat-shape export — preserved so the existing quote preview route
// (lib/api/quotes/preview) keeps working without a refactor.
// ---------------------------------------------------------------------------

export interface LCSCPartResult {
  mpn: string;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  lcsc_pn: string;
  stock_qty: number;
}

export async function searchLCSCPrice(mpn: string): Promise<LCSCPartResult | null> {
  const product = await fetchLcscProduct(mpn);
  if (!product) return null;

  const prices = Array.isArray(product.prices) ? (product.prices as Array<Record<string, unknown>>) : [];
  const first = prices[0];
  const unitPrice = first && typeof first.price === "number" ? first.price : 0;
  if (unitPrice <= 0) return null;

  return {
    mpn: String(product.mpn ?? ""),
    description: String(product.title ?? product.description ?? ""),
    unit_price: unitPrice,
    currency: typeof first?.currency === "string" ? first.currency : "USD",
    in_stock: typeof product.quantity === "number" && product.quantity > 0,
    lcsc_pn: String(product.number ?? ""),
    stock_qty: typeof product.quantity === "number" ? product.quantity : 0,
  };
}

// ---------------------------------------------------------------------------
// New unified SupplierQuote[] export — used by the Component Pricing Review page.
// ---------------------------------------------------------------------------

export async function searchLcscQuotes(mpn: string): Promise<SupplierQuote[]> {
  const product = await fetchLcscProduct(mpn);
  if (!product) return [];

  const prices = Array.isArray(product.prices) ? (product.prices as Array<Record<string, unknown>>) : [];
  const priceBreaks: PriceBreak[] = [];
  for (const p of prices) {
    const minQty = Number(p.min_qty);
    const maxQtyRaw = Number(p.max_qty);
    const unitPrice = Number(p.price);
    const currency = typeof p.currency === "string" ? p.currency : "USD";
    if (!Number.isFinite(minQty) || !Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    priceBreaks.push({
      min_qty: minQty,
      // LCSC uses 9999999 as open-ended; treat anything >= 9,999,999 as null.
      max_qty: Number.isFinite(maxQtyRaw) && maxQtyRaw < 9_999_999 ? maxQtyRaw : null,
      unit_price: unitPrice,
      currency,
    });
  }

  if (priceBreaks.length === 0) return [];

  const manufacturer = (product.manufacturer as { name?: unknown } | undefined)?.name;
  const datasheet = (product.datasheet as { pdf?: unknown } | undefined)?.pdf;

  return [{
    source: "lcsc",
    mpn: String(product.mpn ?? mpn),
    manufacturer: typeof manufacturer === "string" ? manufacturer : null,
    supplier_part_number: typeof product.number === "string" ? product.number : null,
    unit_price: priceBreaks[0].unit_price,
    currency: priceBreaks[0].currency,
    price_breaks: priceBreaks,
    stock_qty: typeof product.quantity === "number" ? product.quantity : null,
    moq: typeof product.moq === "number" ? product.moq : null,
    order_multiple: typeof product.order_multiple === "number" ? product.order_multiple : null,
    lead_time_days: null,   // LCSC doesn't publish lead time on this endpoint
    warehouse_code: null,
    ncnr: null,
    franchised: null,
    lifecycle_status: null,
    datasheet_url: typeof datasheet === "string" ? datasheet : null,
    product_url: null,
  }];
}
