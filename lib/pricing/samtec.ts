import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Samtec direct (manufacturer) pricing client.
// Endpoint: GET api.samtec.com/catalog/v3/{PART_NUMBER}
// Auth:     static long-lived JWT in `Authorization: Bearer` header.
// Note:     Samtec only sells Samtec parts — gate every call with looksLikeSamtecPart().
//           404 is the common case when an unrelated MPN slips through.
// ---------------------------------------------------------------------------

const SAMTEC_CATALOG_URL = "https://api.samtec.com/catalog/v3";
const REQUEST_TIMEOUT_MS = 15_000;

interface SamtecCreds {
  bearer_token: string;
}

let cachedCreds: { creds: SamtecCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getSamtecCredentials(): Promise<SamtecCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<SamtecCreds>("samtec");
    if (fromDb?.bearer_token) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const bearer_token = process.env.SAMTEC_BEARER_TOKEN;
  if (!bearer_token) return null;
  const creds = { bearer_token };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

// Known Samtec series prefixes — used to avoid firing off API calls for non-Samtec MPNs.
// List from connector/socket/header families Samtec publishes. Not exhaustive, but
// good enough as a cheap pre-filter; manufacturer string match is the primary signal.
const SAMTEC_MPN_PREFIXES = [
  "ESW", "EJH", "SSM", "SSQ", "SSW", "TFM", "HW", "BCS", "SS", "EDT",
  "DW", "TBH", "SLW", "IPS", "LSS", "SLM", "TSM", "TLP", "FTE", "FTS",
  "ZSS", "HLE", "HLS", "BSE", "BSS", "ERM", "ERF", "TSW", "MTSW", "IPL",
];

export function looksLikeSamtecPart(mpn: string, manufacturer?: string | null): boolean {
  const m = (manufacturer ?? "").toLowerCase();
  if (m.includes("samtec")) return true;
  const upper = mpn.toUpperCase();
  return SAMTEC_MPN_PREFIXES.some((p) => upper.startsWith(p + "-") || upper.startsWith(p));
}

/** Pick the best datasheet URL — prefer "Datasheet", fall back to "Print". */
function firstDatasheetUrl(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  let printUrl: string | null = null;
  for (const item of raw) {
    const d = item as { description?: unknown; path?: unknown };
    const desc = typeof d?.description === "string" ? d.description.toLowerCase() : "";
    const path = typeof d?.path === "string" ? d.path : null;
    if (!path) continue;
    if (desc === "datasheet") return path;
    if (desc === "print" && !printUrl) printUrl = path;
  }
  return printUrl;
}

export async function searchSamtecPrice(
  mpn: string,
  manufacturer?: string | null,
): Promise<SupplierQuote[]> {
  // Only call for Samtec parts — the API 404s on everything else.
  if (!looksLikeSamtecPart(mpn, manufacturer)) return [];

  const creds = await getSamtecCredentials();
  if (!creds) return [];

  const url = `${SAMTEC_CATALOG_URL}/${encodeURIComponent(mpn)}?includeRelatedParts=false&includeAdditionalDocuments=false`;

  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${creds.bearer_token}`,
        "client-app-name": "swagger-ui",
      },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  if (!json || typeof json !== "object") return [];

  const currency = typeof json.currency === "string" ? json.currency : "USD";

  // Prefer negotiated contract pricing when present; fall back to list price.
  const bookBreaks = Array.isArray(json.customerBookPrice) ? json.customerBookPrice : [];
  const listBreaks = Array.isArray(json.price) ? json.price : [];
  const rawBreaks = bookBreaks.length > 0 ? bookBreaks : listBreaks;

  const priceBreaks: PriceBreak[] = [];
  for (const b of rawBreaks) {
    const br = b as { minimumQuantity?: unknown; maximumQuantity?: unknown; price?: unknown };
    const minQty = Number(br.minimumQuantity);
    const maxQty = Number(br.maximumQuantity);
    const price = Number(br.price);
    if (!Number.isFinite(minQty) || !Number.isFinite(price)) continue;
    priceBreaks.push({
      min_qty: minQty,
      max_qty: Number.isFinite(maxQty) ? maxQty : null,
      unit_price: price,
      currency,
    });
  }

  const unitPrice = priceBreaks[0]?.unit_price ?? 0;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];

  const stock = Number(json.stockQuantity);
  const moq = Number(json.minimumOrderQuantity);
  const leadDays = Number(json.standardLeadDays);

  const supplierPart = typeof json.part === "string" ? json.part : null;
  const productUrl = typeof json.buyNowUrl === "string" ? json.buyNowUrl : null;
  const lifecycle = typeof json.lifecycleStatus === "string" ? json.lifecycleStatus : null;
  const ncnr = typeof json.nonCancellableNonReturnable === "boolean"
    ? json.nonCancellableNonReturnable
    : null;

  const quote: SupplierQuote = {
    source: "samtec",
    mpn: supplierPart ?? mpn,
    manufacturer: "Samtec", // hardcoded — we only reach here for Samtec parts
    supplier_part_number: supplierPart,
    unit_price: unitPrice,
    currency,
    price_breaks: priceBreaks,
    stock_qty: Number.isFinite(stock) ? stock : null,
    moq: Number.isFinite(moq) ? moq : null,
    order_multiple: null,
    lead_time_days: Number.isFinite(leadDays) ? leadDays : null,
    warehouse_code: null,
    ncnr,
    franchised: true, // manufacturer-direct is always authorized
    lifecycle_status: lifecycle,
    datasheet_url: firstDatasheetUrl(json.additionalDocuments),
    product_url: productUrl,
  };

  return [quote];
}
