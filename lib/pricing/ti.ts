import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Texas Instruments direct-pricing client.
// Token:    POST transact.ti.com/v1/oauth/accesstoken (client_credentials)
// Product:  GET  transact.ti.com/v2/store/products/{mpn}?currency=CAD
// Auth:     OAuth2 bearer token (module-cached, ~1h TTL).
// Scope:    TI-branded parts only. We pre-filter by MPN prefix so we don't
//           waste tokens hitting TI for non-TI MPNs (every call that misses
//           is a 404 — the API has no "search" mode).
// ---------------------------------------------------------------------------

const TI_TOKEN_URL = "https://transact.ti.com/v1/oauth/accesstoken";
const TI_PRODUCT_URL = "https://transact.ti.com/v2/store/products";
const REQUEST_TIMEOUT_MS = 15_000;

interface TiCreds {
  client_id: string;
  client_secret: string;
}

let cachedCreds: { creds: TiCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getTiCredentials(): Promise<TiCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<TiCreds>("ti");
    if (fromDb?.client_id && fromDb?.client_secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const client_id = process.env.TI_CLIENT_ID;
  const client_secret = process.env.TI_CLIENT_SECRET;
  if (!client_id || !client_secret) return null;
  const creds = { client_id, client_secret };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

async function getAccessToken(): Promise<string | null> {
  // Refresh when within 60s of expiry — avoids race on expiring tokens mid-request
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }
  const creds = await getTiCredentials();
  if (!creds) return null;

  try {
    const res = await fetch(TI_TOKEN_URL, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const ttl = typeof data.expires_in === "number" ? data.expires_in : 3599;
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + ttl * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

// TI's API only returns TI-branded parts, so we pre-filter MPNs before hitting
// the endpoint. Saves quota and avoids noisy 404s on every non-TI lookup.
const TI_MPN_PREFIXES = [
  "TPS", "TLV", "AFE", "LM", "LP", "CC", "CD", "INA", "OPA", "SN",
  "TPL", "LMK", "DAC", "ADC", "CSD", "DRV", "UCC", "REF", "BQ", "MSP", "ISO",
];

export function looksLikeTiPart(mpn: string, manufacturer?: string | null): boolean {
  const m = (manufacturer ?? "").toLowerCase();
  if (m.includes("texas instruments") || m === "ti") return true;
  const upper = mpn.toUpperCase();
  return TI_MPN_PREFIXES.some((p) => upper.startsWith(p));
}

export async function searchTiPrice(
  mpn: string,
  manufacturer?: string | null
): Promise<SupplierQuote[]> {
  // Skip API call entirely when the MPN doesn't look like a TI part
  if (!looksLikeTiPart(mpn, manufacturer)) return [];

  const token = await getAccessToken();
  if (!token) return [];

  // URL path IS the MPN — this is a direct lookup, not a keyword search.
  const url = `${TI_PRODUCT_URL}/${encodeURIComponent(mpn)}?currency=CAD&exclude-evms=true`;

  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    // 404 expected when MPN isn't a TI product — silent, no log noise
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  if (!json || typeof json !== "object") return [];

  const pricingArr = Array.isArray(json.pricing) ? (json.pricing as unknown[]) : [];
  const pricingEntry = pricingArr[0] as
    | { currency?: unknown; priceBreaks?: unknown[] }
    | undefined;
  if (!pricingEntry) return [];

  const currency = typeof pricingEntry.currency === "string" ? pricingEntry.currency : "CAD";
  const rawBreaks = Array.isArray(pricingEntry.priceBreaks) ? pricingEntry.priceBreaks : [];

  const priceBreaks: PriceBreak[] = [];
  for (let i = 0; i < rawBreaks.length; i++) {
    const b = rawBreaks[i] as { priceBreakQuantity?: unknown; price?: unknown };
    const minQty = Number(b.priceBreakQuantity);
    const price = Number(b.price);
    if (!Number.isFinite(minQty) || !Number.isFinite(price)) continue;
    // max_qty = (next break's qty - 1), or null for the last tier
    const next = rawBreaks[i + 1] as { priceBreakQuantity?: unknown } | undefined;
    const nextQty = next ? Number(next.priceBreakQuantity) : NaN;
    priceBreaks.push({
      min_qty: minQty,
      max_qty: Number.isFinite(nextQty) ? nextQty - 1 : null,
      unit_price: price,
      currency,
    });
  }

  const unitPrice = priceBreaks[0]?.unit_price ?? 0;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];

  const stock = Number(json.quantity);
  const moq = Number(json.minimumOrderQuantity);
  const orderMultiple = Number(json.standardPackQuantity);
  const tiPartNumber = typeof json.tiPartNumber === "string" ? json.tiPartNumber : null;
  const lifecycle = typeof json.lifeCycle === "string" ? json.lifeCycle : null;
  const buyUrl = typeof json.buyNowUrl === "string" ? json.buyNowUrl : null;

  return [
    {
      source: "ti",
      mpn: tiPartNumber ?? mpn,
      manufacturer: "Texas Instruments",
      supplier_part_number: tiPartNumber,
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: Number.isFinite(stock) ? stock : null,
      moq: Number.isFinite(moq) ? moq : null,
      order_multiple: Number.isFinite(orderMultiple) ? orderMultiple : null,
      lead_time_days: null, // TI doesn't publish lead time on this endpoint
      warehouse_code: null,
      ncnr: null, // not in payload
      franchised: true, // TI is manufacturer-direct — always authorized
      lifecycle_status: lifecycle,
      datasheet_url: null, // not returned by the store/products endpoint
      product_url: buyUrl,
    },
  ];
}
