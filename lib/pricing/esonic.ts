import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// e-Sonic price & availability client.
// Endpoint: GET api.e-sonic.com/wapi/v3/cgpriceavailability/{MPN}/0/1/10/{UUID}
// Auth:     UUID API key baked into URL path. No auth headers.
// Currency: hardcoded USD — not returned by the endpoint (decision #10).
// Response: bare top-level array; every numeric field is stringified.
// ---------------------------------------------------------------------------

const ESONIC_BASE_URL = "https://api.e-sonic.com/wapi/v3/cgpriceavailability";
const REQUEST_TIMEOUT_MS = 15_000;
const ESONIC_CURRENCY = "USD";

interface EsonicCreds {
  api_key: string;
}

let cachedCreds: { creds: EsonicCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getEsonicCredentials(): Promise<EsonicCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<EsonicCreds>("esonic");
    if (fromDb?.api_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const api_key = process.env.ESONIC_API_KEY;
  if (!api_key) return null;
  const creds = { api_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

/** Safe Number() coercion that collapses NaN to null. */
function numOrNull(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function searchEsonicPrice(mpn: string): Promise<SupplierQuote[]> {
  const creds = await getEsonicCredentials();
  if (!creds) return [];

  // `/0/1/10/` pagination constants are opaque — keep fixed per spec.
  const url = `${ESONIC_BASE_URL}/${encodeURIComponent(mpn)}/0/1/10/${encodeURIComponent(creds.api_key)}`;

  let json: unknown = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  // Response is a bare top-level array.
  const entries = Array.isArray(json) ? json : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of entries) {
    const p = raw as Record<string, unknown>;

    // Sort price breaks ascending by pricebreak qty, then compute max_qty from next tier.
    const rawBreaks = Array.isArray(p.price_breaks) ? [...p.price_breaks] : [];
    rawBreaks.sort((a, b) => {
      const aq = Number((a as { pricebreak?: unknown })?.pricebreak);
      const bq = Number((b as { pricebreak?: unknown })?.pricebreak);
      return (Number.isFinite(aq) ? aq : 0) - (Number.isFinite(bq) ? bq : 0);
    });

    const priceBreaks: PriceBreak[] = [];
    for (let i = 0; i < rawBreaks.length; i++) {
      const b = rawBreaks[i] as { pricebreak?: unknown; pricelist?: unknown };
      const minQty = Number(b.pricebreak);
      const price = Number(b.pricelist);
      if (!Number.isFinite(minQty) || !Number.isFinite(price)) continue;
      const next = rawBreaks[i + 1] as { pricebreak?: unknown } | undefined;
      const nextQty = next ? Number(next.pricebreak) : NaN;
      priceBreaks.push({
        min_qty: minQty,
        max_qty: Number.isFinite(nextQty) ? nextQty - 1 : null,
        unit_price: price,
        currency: ESONIC_CURRENCY,
      });
    }

    const unitPrice = priceBreaks[0]?.unit_price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    // factoryLeadTime is in WEEKS — convert to days.
    const leadWeeks = numOrNull(p.factoryLeadTime);
    const leadTimeDays = leadWeeks !== null ? leadWeeks * 7 : null;

    quotes.push({
      source: "esonic",
      mpn: String(p.partNumber ?? mpn),
      manufacturer: typeof p.manufacturer === "string" ? p.manufacturer : null,
      supplier_part_number: null,
      unit_price: unitPrice,
      currency: ESONIC_CURRENCY,
      price_breaks: priceBreaks,
      stock_qty: numOrNull(p.quantityAvailable),
      moq: numOrNull(p.moq),
      order_multiple: numOrNull(p.multiple),
      lead_time_days: leadTimeDays,
      warehouse_code: null,
      ncnr: null,
      franchised: null,
      lifecycle_status: null,
      datasheet_url: null,
      product_url: typeof p.productUrl === "string" ? p.productUrl : null,
      description: typeof p.description === "string" ? (p.description as string) : null,
    });
  }

  return quotes;
}
