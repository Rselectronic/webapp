import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Avnet pricing client.
// Token:    POST apigw.avnet.com/external/getToken/oauth2/v2.0/token (OAuth2 CC)
// Lookup:   POST apigw.avnet.com/external/customer/price/v1/
// Auth:     Bearer access token + Ocp-Apim-Subscription-Key (Azure APIM key —
//           distinct from the OAuth client secret).
// Pricing:  Avnet returns a single `price` per item at the requested quantity,
//           not a full price-break ladder. We synthesize a one-entry ladder per
//           row. Response is typically multi-row (multiple supplier offers per
//           MPN), so we emit one SupplierQuote per item.
// ---------------------------------------------------------------------------

const AVNET_TOKEN_URL =
  "https://apigw.avnet.com/external/getToken/oauth2/v2.0/token";
const AVNET_PRICE_URL =
  "https://apigw.avnet.com/external/customer/price/v1/";
// Avnet's audience URN — hardcoded, same for every caller (not per-customer).
const AVNET_SCOPE =
  "api://9ee39226-6a78-4bc4-8ed2-bcc547eac437/.default";
const REQUEST_TIMEOUT_MS = 15_000;

interface AvnetCreds {
  client_id: string;
  client_secret: string;
  subscription_key: string;
}

let cachedCreds: { creds: AvnetCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAvnetCredentials(): Promise<AvnetCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<AvnetCreds>("avnet");
    if (fromDb?.client_id && fromDb?.client_secret && fromDb?.subscription_key) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const client_id = process.env.AVNET_CLIENT_ID;
  const client_secret = process.env.AVNET_CLIENT_SECRET;
  const subscription_key = process.env.AVNET_SUBSCRIPTION_KEY;
  if (!client_id || !client_secret || !subscription_key) return null;
  const creds = { client_id, client_secret, subscription_key };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

async function getAccessToken(creds: AvnetCreds): Promise<string | null> {
  // Refresh when within 60s of expiry (same policy as DigiKey client).
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }
  try {
    const res = await fetch(AVNET_TOKEN_URL, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        scope: AVNET_SCOPE,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3599;
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + expiresInSec * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

export async function searchAvnetPrice(
  mpn: string,
  quantity: number = 1
): Promise<SupplierQuote[]> {
  const creds = await getAvnetCredentials();
  if (!creds) return [];
  const token = await getAccessToken(creds);
  if (!token) return [];

  // Avnet returns ONE price tied to the requested quantity — no price-break
  // table. Caller passes the tier's order qty so the returned unit price is
  // accurate for that volume. Callers needing multi-tier pricing fire this
  // once per tier and merge the results.
  const body = {
    items: [
      {
        itemId: 1,
        searchType: "REQUEST_PART",
        searchTerm: mpn,
        quantity: Math.max(1, Math.floor(quantity)),
      },
    ],
  };

  let json: { items?: unknown[] } | null = null;
  try {
    const res = await fetch(AVNET_PRICE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Ocp-Apim-Subscription-Key": creds.subscription_key,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const items = Array.isArray(json?.items) ? json.items : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of items) {
    const it = raw as Record<string, unknown>;

    const price = typeof it.price === "number" ? it.price : Number(it.price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const currency = typeof it.currency === "string" ? it.currency : "USD";
    const minQty =
      typeof it.minimumQuantity === "number"
        ? it.minimumQuantity
        : Number(it.minimumQuantity);
    const moq = Number.isFinite(minQty) ? minQty : null;
    const mult =
      typeof it.multipleQuantity === "number"
        ? it.multipleQuantity
        : Number(it.multipleQuantity);
    const orderMultiple = Number.isFinite(mult) ? mult : null;

    // Avnet returns a single price per call — synthesize a one-entry ladder
    // anchored at the REQUESTED quantity. When callers fetch for multiple
    // tiers they merge these single-entry ladders into one combined
    // price_breaks array; the per-tier lookup keys on the exact qty.
    const priceBreaks: PriceBreak[] = [
      {
        min_qty: Math.max(1, Math.floor(quantity)),
        max_qty: null,
        unit_price: price,
        currency,
      },
    ];

    // Lead time: Avnet primarily returns `factoryLeadTimeWks` (string, weeks).
    // Some responses use `leadTime` / `leadTimeWeeks` / `leadTimeDays` instead
    // depending on part type. Accept any of them; multiply weeks by 7.
    // Return null (not 0) when the part is in stock with no quoted lead time —
    // 0 days isn't really a lead time.
    const toNum = (v: unknown): number => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        // Accept "12", "12 Weeks", "12 Week", "60 Days"
        const m = v.match(/([\d.]+)/);
        return m ? parseFloat(m[1]) : NaN;
      }
      return NaN;
    };
    const leadWksRaw = it.factoryLeadTimeWks ?? it.leadTimeWeeks;
    const leadDaysRaw = it.leadTimeDays;
    const leadTimeStr = it.leadTime;
    let leadTimeDays: number | null = null;
    const wks = toNum(leadWksRaw);
    const days = toNum(leadDaysRaw);
    if (Number.isFinite(wks) && wks > 0) {
      leadTimeDays = Math.round(wks * 7);
    } else if (Number.isFinite(days) && days > 0) {
      leadTimeDays = Math.round(days);
    } else if (typeof leadTimeStr === "string") {
      const n = toNum(leadTimeStr);
      if (Number.isFinite(n) && n > 0) {
        const lower = leadTimeStr.toLowerCase();
        if (lower.includes("week")) leadTimeDays = Math.round(n * 7);
        else if (lower.includes("month")) leadTimeDays = Math.round(n * 30);
        else leadTimeDays = Math.round(n); // assume days
      }
    }

    const stockRaw = it.inStock;
    const stockQty =
      typeof stockRaw === "number"
        ? stockRaw
        : stockRaw == null
          ? null
          : Number.isFinite(Number(stockRaw))
            ? Number(stockRaw)
            : null;

    const ncnrFlag = it.ncnrFlag;
    const ncnr = ncnrFlag === "Y" ? true : ncnrFlag === "N" ? false : null;

    // Lifecycle isn't guaranteed in the spec — infer from obsolete/EOL flags
    // when present, default to ACTIVE otherwise.
    const obsoleteFlag = it.obsoleteFlag;
    const endOfLife = it.endOfLife;
    const lifecycle =
      obsoleteFlag === "Y" || endOfLife === "Y" ? "OBSOLETE" : "ACTIVE";

    // Manufacturer: Avnet returns `quotedManufacturerName` on matched offers,
    // but some responses only carry `manufacturer` / `manufacturerName` /
    // `mfrName`. Fall back through all known field names so we don't lose the
    // brand on rows where the primary field is absent.
    const mfrCandidates = [
      it.quotedManufacturerName,
      it.manufacturer,
      it.manufacturerName,
      it.mfrName,
      it.manufacturerCode,
      it.mfrCode,
    ];
    let manufacturer: string | null = null;
    for (const c of mfrCandidates) {
      if (typeof c === "string" && c.trim().length > 0) {
        manufacturer = c.trim();
        break;
      }
    }
    const erpPn =
      typeof it.erpPartNumber === "string" ? it.erpPartNumber : null;
    const reqMpn =
      typeof it.requestedMfgPartNumber === "string"
        ? it.requestedMfgPartNumber
        : null;

    quotes.push({
      source: "avnet",
      mpn: reqMpn ?? mpn,
      manufacturer,
      supplier_part_number: erpPn,
      unit_price: price,
      currency,
      price_breaks: priceBreaks,
      stock_qty: stockQty,
      moq,
      order_multiple: orderMultiple,
      lead_time_days: leadTimeDays,
      warehouse_code: null,
      ncnr,
      franchised: true, // Avnet is always an authorized distributor
      lifecycle_status: lifecycle,
      datasheet_url: null, // not in price response
      product_url: null,   // not in price response
      description: null,   // Avnet's price endpoint doesn't include a part description
    });
  }

  return quotes;
}
