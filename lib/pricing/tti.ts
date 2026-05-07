import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// TTI keyword-search client.
// Endpoint: GET api.tti.com/service/api/v1/search/keyword?searchTerms=MPN
// Auth:     `apiKey` header. Single-key, no token refresh.
// ---------------------------------------------------------------------------

const TTI_SEARCH_URL = "https://api.tti.com/service/api/v1/search/keyword";
const REQUEST_TIMEOUT_MS = 15_000;

interface TtiCreds {
  api_key: string;
}

let cachedCreds: { creds: TtiCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getTtiCredentials(): Promise<TtiCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<TtiCreds>("tti");
    if (fromDb?.api_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const api_key = process.env.TTI_API_KEY;
  if (!api_key) return null;
  const creds = { api_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

/** TTI's lead time is a string like "25 Weeks" or "Stock". Parse to days. */
function parseLeadTime(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  // "Stock" / "In Stock" means the part is available now — not a real lead
  // time. Return null so downstream consumers treat it as "unknown" rather
  // than "0 days shipping".
  if (t === "stock" || t === "in stock") return null;
  // Accept "12 Weeks", "12 Week", "60 Days", "60 days", or bare "60" (days).
  const m = t.match(/(\d+)\s*(day|days|week|weeks|month|months)?/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (!unit || unit.startsWith("day")) return n;
  if (unit.startsWith("week")) return n * 7;
  if (unit.startsWith("month")) return n * 30;
  return null;
}

export async function searchTtiPrice(mpn: string): Promise<SupplierQuote[]> {
  const creds = await getTtiCredentials();
  if (!creds) return [];

  const url = `${TTI_SEARCH_URL}?searchTerms=${encodeURIComponent(mpn)}`;
  let json: { parts?: unknown[]; currencyCode?: string } | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        apiKey: creds.api_key,
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const parts = Array.isArray(json?.parts) ? json.parts : [];
  const currency = typeof json?.currencyCode === "string" ? json.currencyCode : "USD";
  const quotes: SupplierQuote[] = [];

  for (const raw of parts) {
    const p = raw as Record<string, unknown>;
    const priceBreaks: PriceBreak[] = [];
    const pricing = p.pricing as { quantityPriceBreaks?: unknown[] } | undefined;
    const rawBreaks = Array.isArray(pricing?.quantityPriceBreaks) ? pricing.quantityPriceBreaks : [];
    for (let i = 0; i < rawBreaks.length; i++) {
      const b = rawBreaks[i] as { quantity?: unknown; price?: unknown };
      const minQty = typeof b.quantity === "number" ? b.quantity : Number(b.quantity);
      const price = typeof b.price === "number" ? b.price : Number(b.price);
      if (!Number.isFinite(minQty) || !Number.isFinite(price)) continue;
      // max_qty = (next break's qty - 1), or null for the last tier
      const next = rawBreaks[i + 1] as { quantity?: unknown } | undefined;
      const nextQty = next ? Number(next.quantity) : NaN;
      priceBreaks.push({
        min_qty: minQty,
        max_qty: Number.isFinite(nextQty) ? nextQty - 1 : null,
        unit_price: price,
        currency,
      });
    }

    const unitPrice = priceBreaks[0]?.unit_price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    quotes.push({
      source: "tti",
      mpn: String(p.manufacturerPartNumber ?? mpn),
      manufacturer: (p.manufacturer as string | null) ?? null,
      supplier_part_number: (p.ttiPartNumber as string | null) ?? null,
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: typeof p.availableToSell === "number" ? p.availableToSell : null,
      moq: typeof p.salesMinimum === "number" ? p.salesMinimum : null,
      order_multiple: typeof p.salesMultiple === "number" ? p.salesMultiple : null,
      lead_time_days: parseLeadTime(p.leadTime),
      warehouse_code: null,
      ncnr: p.partNCNR === "Y",
      franchised: null, // TTI doesn't flag franchise status explicitly — TTI is always authorized
      lifecycle_status: null,
      datasheet_url: (p.datasheetURL as string | null) ?? null,
      product_url: (p.buyUrl as string | null) ?? null,
      description: typeof p.description === "string" ? (p.description as string) : null,
    });
  }

  return quotes;
}
