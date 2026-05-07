import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Future Electronics lookup client.
// Endpoint: GET api.futureelectronics.com/api/v1/pim-future/lookup
// Auth:     static license key in `x-orbweaver-licensekey` header.
// Currency: native CAD when available (exposed via currency.currency_code).
// Note:     lookup_type=exact (decision #7) so partial MPNs don't misfire.
// ---------------------------------------------------------------------------

const FUTURE_LOOKUP_URL = "https://api.futureelectronics.com/api/v1/pim-future/lookup";
const REQUEST_TIMEOUT_MS = 15_000;

interface FutureCreds {
  license_key: string;
}

let cachedCreds: { creds: FutureCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getFutureCredentials(): Promise<FutureCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<FutureCreds>("future");
    if (fromDb?.license_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through
  }
  const license_key = process.env.FUTURE_LICENSE_KEY;
  if (!license_key) return null;
  const creds = { license_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

/** Future returns part_attributes as [{name, value}] pairs — flatten to a dict. */
function flattenAttrs(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const a = item as { name?: unknown; value?: unknown };
    if (typeof a?.name === "string") out[a.name] = a.value;
  }
  return out;
}

/** Lead time in Future's payload: `factory_leadtime` + `factory_leadtime_units`. Normalize to days. */
function parseLeadTime(raw: unknown, units: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const u = typeof units === "string" ? units.trim().toLowerCase() : "";
  if (u.startsWith("week")) return n * 7;
  if (u.startsWith("day")) return n;
  if (u.startsWith("month")) return n * 30;
  return null;
}

export async function searchFuturePrice(mpn: string): Promise<SupplierQuote[]> {
  const creds = await getFutureCredentials();
  if (!creds) return [];

  const params = new URLSearchParams({
    part_number: mpn,
    lookup_type: "exact",
  });
  const url = `${FUTURE_LOOKUP_URL}?${params.toString()}`;

  let json: { offers?: unknown[] } | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json,text/javascript",
        "Content-Type": "application/json",
        "x-orbweaver-licensekey": creds.license_key,
      },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const offers = Array.isArray(json?.offers) ? json.offers : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of offers) {
    const offer = raw as Record<string, unknown>;
    const partId = offer.part_id as { seller_part_number?: unknown; mpn?: unknown; web_url?: unknown } | undefined;
    const attrs = flattenAttrs(offer.part_attributes);
    const quantities = offer.quantities as Record<string, unknown> | undefined;
    const currencyInfo = offer.currency as { currency_code?: unknown } | undefined;
    const currency = typeof currencyInfo?.currency_code === "string"
      ? currencyInfo.currency_code
      : "CAD";

    const rawBreaks = Array.isArray(offer.pricing) ? offer.pricing : [];
    const priceBreaks: PriceBreak[] = [];
    for (const b of rawBreaks) {
      const br = b as { quantity_from?: unknown; quantity_to?: unknown; unit_price?: unknown };
      const fromQ = Number(br.quantity_from);
      const toQ = Number(br.quantity_to);
      const price = Number(br.unit_price);
      if (!Number.isFinite(fromQ) || !Number.isFinite(price)) continue;
      priceBreaks.push({
        min_qty: fromQ,
        max_qty: Number.isFinite(toQ) ? toQ : null,
        unit_price: price,
        currency,
      });
    }

    const unitPrice = priceBreaks[0]?.unit_price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    const stock = quantities ? Number(quantities.quantity_available) : NaN;
    const moq = quantities ? Number(quantities.quantity_minimum) : NaN;
    const orderMultiple = quantities ? Number(quantities.order_mult_qty) : NaN;
    // Primary: `quantities.factory_leadtime` + `factory_leadtime_units`.
    // Fallbacks: `attrs.leadTimeWeeks` (number, weeks) and `attrs.leadTime`
    // (string like "12 Weeks" / "60 Days"). 0 → null (in stock, not a lead time).
    let leadTimeDays = parseLeadTime(
      quantities?.factory_leadtime,
      quantities?.factory_leadtime_units
    );
    if (leadTimeDays === null || leadTimeDays <= 0) {
      const wks = Number(attrs.leadTimeWeeks);
      if (Number.isFinite(wks) && wks > 0) {
        leadTimeDays = Math.round(wks * 7);
      } else if (typeof attrs.leadTime === "string") {
        const str = attrs.leadTime;
        const m = str.match(/([\d.]+)/);
        const n = m ? parseFloat(m[1]) : NaN;
        if (Number.isFinite(n) && n > 0) {
          const lower = str.toLowerCase();
          if (lower.includes("week")) leadTimeDays = Math.round(n * 7);
          else if (lower.includes("month")) leadTimeDays = Math.round(n * 30);
          else if (lower.includes("day")) leadTimeDays = Math.round(n);
        }
      }
    }
    if (leadTimeDays !== null && leadTimeDays <= 0) leadTimeDays = null;

    const manufacturer = typeof attrs.manufacturerName === "string" ? attrs.manufacturerName : null;
    const lifecycle = typeof attrs.productLifeCycle === "string" ? attrs.productLifeCycle : null;

    quotes.push({
      source: "future",
      mpn: String(partId?.mpn ?? mpn),
      manufacturer,
      supplier_part_number: partId?.seller_part_number ? String(partId.seller_part_number) : null,
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: Number.isFinite(stock) ? stock : null,
      moq: Number.isFinite(moq) ? moq : null,
      order_multiple: Number.isFinite(orderMultiple) ? orderMultiple : null,
      lead_time_days: leadTimeDays,
      warehouse_code: null,
      ncnr: attrs.ncnrFlag === "Y" ? true : attrs.ncnrFlag === "N" ? false : null,
      franchised: null, // Future is always an authorized distributor — no explicit flag in payload
      lifecycle_status: lifecycle,
      datasheet_url: firstDatasheetUrl(offer.documents),
      product_url: partId?.web_url ? String(partId.web_url) : null,
      description:
        typeof attrs.productDescription === "string"
          ? (attrs.productDescription as string)
          : typeof attrs.description === "string"
            ? (attrs.description as string)
            : null,
    });
  }

  return quotes;
}

function firstDatasheetUrl(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    const d = item as { type?: unknown; url?: unknown };
    if (d?.type === "Datasheet" && typeof d.url === "string") return d.url;
  }
  return null;
}
