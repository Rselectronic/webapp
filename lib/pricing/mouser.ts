import { getCredential, getPreferredCurrency } from "@/lib/supplier-credentials";

const MOUSER_SEARCH_URL =
  "https://api.mouser.com/api/v1/search/keyword";

interface MouserCreds {
  api_key: string;
}

// Module-level credentials cache with 60-second TTL — see digikey.ts for
// rationale. Keeps hot-path pricing calls off the DB while allowing rotation
// via the UI to take effect within a minute.
let cachedCreds: { creds: MouserCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getMouserCredentials(): Promise<MouserCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) {
    return cachedCreds.creds;
  }
  try {
    const fromDb = await getCredential<MouserCreds>("mouser");
    if (fromDb?.api_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // DB unavailable / SUPPLIER_CREDENTIALS_KEY missing — fall through
  }
  const api_key = process.env.MOUSER_API_KEY;
  if (!api_key) return null;
  const creds: MouserCreds = { api_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

export interface MouserPriceBreak {
  quantity: number;
  unit_price: number;
  currency: string;
}

export interface MouserPartResult {
  mpn: string;
  manufacturer: string | null;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  mouser_pn: string;
  stock_qty: number;
  /**
   * Manufacturer lead time, normalized to days. Mouser publishes `LeadTime`
   * as a free-form string like "12 Weeks" or "60 Days". null when absent or
   * when the part is in stock (no real lead time to surface).
   */
  lead_time_days: number | null;
  /** Full volume-break ladder when the API returns one; empty otherwise. */
  price_breaks: MouserPriceBreak[];
  /**
   * Mouser `LifecycleStatus` — strings like "Active", "End of Life",
   * "Not Recommended for New Designs", "Obsolete". null when absent.
   */
  lifecycle_status: string | null;
}

/**
 * Parse Mouser's `LeadTime` string into days. Accepts forms like
 * "12 Weeks", "12 Week", "60 Days", "60 days", plain "60" (assume days),
 * or a plain integer. Returns null for unrecognized / zero / missing values
 * since "0 days" isn't a real lead time (the part is in stock).
 */
function parseMouserLeadTime(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  }
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(day|week|month)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (!unit || unit === "day") return Math.round(n);
  if (unit === "week") return Math.round(n * 7);
  if (unit === "month") return Math.round(n * 30);
  return null;
}

export async function searchMouserPrice(
  mpn: string
): Promise<MouserPartResult | null> {
  const creds = await getMouserCredentials();
  if (!creds) return null;
  const apiKey = creds.api_key;
  const preferredCurrency = await getPreferredCurrency("mouser");

  try {
    const res = await fetch(`${MOUSER_SEARCH_URL}?apiKey=${apiKey}`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000), // 15s per API call
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        SearchByKeywordRequest: {
          keyword: mpn,
          records: 1,
          startingRecord: 0,
          searchOptions: "",
          searchWithYourSignUpLanguage: "",
        },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      SearchResults?: {
        Parts?: Array<{
          ManufacturerPartNumber: string;
          Manufacturer?: string;
          Description: string;
          MouserPartNumber: string;
          Availability: string;
          LeadTime?: string;
          PriceBreaks?: Array<{
            Quantity: number;
            Price: string;
            Currency: string;
          }>;
          LifecycleStatus?: string;
        }>;
      };
    };

    const part = data.SearchResults?.Parts?.[0];
    if (!part) return null;

    // Extract the FULL price-break ladder (not just the first entry) so
    // volume pricing propagates correctly into the review page's per-tier
    // columns. Mouser stringifies the price ("0.144" or "$0.144") — strip
    // anything that isn't a digit or decimal.
    const breaks: MouserPriceBreak[] = [];
    for (const pb of part.PriceBreaks ?? []) {
      const priceStr = pb.Price?.replace(/[^0-9.]/g, "") ?? "0";
      const price = parseFloat(priceStr);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!Number.isFinite(pb.Quantity) || pb.Quantity <= 0) continue;
      breaks.push({
        quantity: pb.Quantity,
        unit_price: price,
        currency: pb.Currency ?? preferredCurrency,
      });
    }
    breaks.sort((a, b) => a.quantity - b.quantity);

    const headline = breaks[0];
    if (!headline) return null;

    // Parse stock quantity from availability string (e.g., "1,234 In Stock")
    const stockMatch = part.Availability?.match(/[\d,]+/);
    const stockQty = stockMatch
      ? parseInt(stockMatch[0].replace(/,/g, ""), 10)
      : 0;

    const manufacturer =
      typeof part.Manufacturer === "string" && part.Manufacturer.trim().length > 0
        ? part.Manufacturer.trim()
        : null;

    return {
      mpn: part.ManufacturerPartNumber,
      manufacturer,
      description: part.Description,
      unit_price: headline.unit_price,
      currency: headline.currency,
      in_stock: stockQty > 0,
      mouser_pn: part.MouserPartNumber,
      stock_qty: stockQty,
      lead_time_days: parseMouserLeadTime(part.LeadTime),
      price_breaks: breaks,
      lifecycle_status:
        typeof part.LifecycleStatus === "string" && part.LifecycleStatus.trim().length > 0
          ? part.LifecycleStatus.trim()
          : null,
    };
  } catch {
    return null;
  }
}
