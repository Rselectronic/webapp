import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Arrow Electronics price & availability client.
// Token:    POST my.arrow.com/api/security/oauth/token (client_credentials)
// Endpoint: GET  my.arrow.com/api/priceandavail/parts?search=<MPN>
// Multi-row: one pricingResponse entry per warehouse — emit one SupplierQuote
// per row so the review page can pick. Numeric fields come back as strings.
// ---------------------------------------------------------------------------

const ARROW_TOKEN_URL = "https://my.arrow.com/api/security/oauth/token";
const ARROW_SEARCH_URL = "https://my.arrow.com/api/priceandavail/parts";
const REQUEST_TIMEOUT_MS = 15_000;

interface ArrowCreds {
  client_id: string;
  client_secret: string;
}

let cachedCreds: { creds: ArrowCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getArrowCredentials(): Promise<ArrowCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<ArrowCreds>("arrow");
    if (fromDb?.client_id && fromDb?.client_secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const client_id = process.env.ARROW_CLIENT_ID;
  const client_secret = process.env.ARROW_CLIENT_SECRET;
  if (!client_id || !client_secret) return null;
  const creds = { client_id, client_secret };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

async function getAccessToken(): Promise<string | null> {
  const creds = await getArrowCredentials();
  if (!creds) return null;
  // Refresh when within 60s of expiry
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const basic = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64");
  try {
    const res = await fetch(ARROW_TOKEN_URL, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Arrow docs require client_id as both a header AND in the Basic auth
        client_id: creds.client_id,
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3599;
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + expiresIn * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/** Parse Arrow's stringified numeric fields. Returns null for non-finite. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface ArrowUrlEntry {
  type?: unknown;
  value?: unknown;
}

function findUrl(urlData: unknown, type: string): string | null {
  if (!Array.isArray(urlData)) return null;
  for (const item of urlData) {
    const u = item as ArrowUrlEntry;
    if (u?.type === type && typeof u.value === "string") return u.value;
  }
  return null;
}

export async function searchArrowPrice(mpn: string): Promise<SupplierQuote[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({
    search: mpn,
    pageSize: "25",
    pageNumber: "1",
    version: "3",
    limit: "10",
    quantity: "1",
  });
  const url = `${ARROW_SEARCH_URL}?${params.toString()}`;

  let json: { pricingResponse?: unknown[] } | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const rows = Array.isArray(json?.pricingResponse) ? json.pricingResponse : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const currency = typeof r.currency === "string" ? r.currency : "USD";

    const priceBreaks: PriceBreak[] = [];
    const tiers = Array.isArray(r.pricingTier) ? r.pricingTier : [];
    for (const t of tiers) {
      const tier = t as { minQuantity?: unknown; maxQuantity?: unknown; resalePrice?: unknown };
      const minQ = toNum(tier.minQuantity);
      const maxQ = toNum(tier.maxQuantity);
      const price = toNum(tier.resalePrice);
      if (minQ === null || price === null || !(price > 0)) continue;
      // Arrow uses 999_999_999 as a sentinel for open-ended upper bound
      const maxQty = maxQ !== null && maxQ < 999_999_999 ? maxQ : null;
      priceBreaks.push({
        min_qty: minQ,
        max_qty: maxQty,
        unit_price: price,
        currency,
      });
    }

    // unit_price on the quote = first tier (matches minOrderQuantity); fall back to
    // the row-level resalePrice if no tiers came through.
    const firstTierPrice = priceBreaks[0]?.unit_price;
    const rowPrice = toNum(r.resalePrice);
    const unitPrice = firstTierPrice ?? rowPrice;
    if (unitPrice === null || !(unitPrice > 0)) continue;

    const leadTime = r.leadTime as { supplierLeadTime?: unknown; arrowLeadTime?: unknown } | undefined;
    const supplierLt = toNum(leadTime?.supplierLeadTime);
    const arrowLt = toNum(leadTime?.arrowLeadTime);
    const leadTimeDays = supplierLt ?? arrowLt;

    quotes.push({
      source: "arrow",
      mpn: typeof r.partNumber === "string" ? r.partNumber : mpn,
      manufacturer: typeof r.manufacturer === "string" ? r.manufacturer : null,
      supplier_part_number: typeof r.documentId === "string" ? r.documentId : null,
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: toNum(r.fohQuantity),
      moq: typeof r.minOrderQuantity === "number" ? r.minOrderQuantity : toNum(r.minOrderQuantity),
      order_multiple:
        typeof r.multOrderQuantity === "number" ? r.multOrderQuantity : toNum(r.multOrderQuantity),
      lead_time_days: leadTimeDays,
      warehouse_code: typeof r.warehouseCode === "string" ? r.warehouseCode : null,
      ncnr: typeof r.nonCancelableNonReturnable === "boolean" ? r.nonCancelableNonReturnable : null,
      franchised: r.franchised === "franchised",
      lifecycle_status: typeof r.lifeCycleStatus === "string" ? r.lifeCycleStatus : null,
      datasheet_url: findUrl(r.urlData, "Datasheet"),
      product_url: findUrl(r.urlData, "Part Details"),
    });
  }

  return quotes;
}
