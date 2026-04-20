import { createHmac } from "crypto";
import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// TME (Transfer Multipart Elektronik) pricing client.
// Endpoint: POST api.tme.eu/Products/GetPricesAndStocks.json
// Auth:     OAuth1-style HMAC-SHA1 signature over the form-encoded body.
// Note:     Single-MPN calls only for now (SymbolList[0]); batch support is
//           deferred (API accepts SymbolList[1..N] in one request).
// Note:     Lead time not exposed here — decision #9 says don't make a 2nd call.
// ---------------------------------------------------------------------------

const TME_ENDPOINT = "https://api.tme.eu/Products/GetPricesAndStocks.json";
const REQUEST_TIMEOUT_MS = 15_000;

interface TmeCreds {
  token: string;
  secret: string;
}

let cachedCreds: { creds: TmeCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getTmeCredentials(): Promise<TmeCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<TmeCreds>("tme");
    if (fromDb?.token && fromDb?.secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // fall through to env
  }
  const token = process.env.TME_TOKEN;
  const secret = process.env.TME_SECRET;
  if (!token || !secret) return null;
  const creds = { token, secret };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

/** RFC3986 percent-encode: encodeURIComponent plus !'()* escapes. TME requires this exact form. */
function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Build OAuth1-style HMAC-SHA1 signature over sorted, encoded params. */
function buildSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  secret: string,
): string {
  // Sort by encoded key, then encoded value
  const encoded = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const paramString = encoded.map(([k, v]) => `${k}=${v}`).join("&");
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  return createHmac("sha1", secret).update(baseString).digest("base64");
}

export async function searchTmePrice(mpn: string): Promise<SupplierQuote[]> {
  const creds = await getTmeCredentials();
  if (!creds) return [];

  // Params to include in the signature — everything except ApiSignature itself.
  const params: Record<string, string> = {
    "SymbolList[0]": mpn,
    Language: "EN",
    Token: creds.token,
    Country: "CA",
  };

  const signature = buildSignature("POST", TME_ENDPOINT, params, creds.secret);

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, v);
  body.append("ApiSignature", signature);

  let json:
    | {
        Status?: string;
        Data?: {
          Currency?: string;
          ProductList?: unknown[];
        };
      }
    | null = null;
  try {
    const res = await fetch(TME_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  if (!json || json.Status !== "OK") return [];

  const currency =
    typeof json.Data?.Currency === "string" ? json.Data.Currency : "USD";
  const productList = Array.isArray(json.Data?.ProductList) ? json.Data.ProductList : [];
  const quotes: SupplierQuote[] = [];

  for (const raw of productList) {
    const p = raw as Record<string, unknown>;
    const rawBreaks = Array.isArray(p.PriceList) ? p.PriceList : [];

    // Sort by Amount ascending so max_qty = next tier - 1 works correctly.
    const sortedBreaks = rawBreaks
      .map((b) => b as { Amount?: unknown; PriceValue?: unknown })
      .filter((b) => Number.isFinite(Number(b.Amount)) && Number.isFinite(Number(b.PriceValue)))
      .sort((a, b) => Number(a.Amount) - Number(b.Amount));

    const priceBreaks: PriceBreak[] = [];
    for (let i = 0; i < sortedBreaks.length; i++) {
      const b = sortedBreaks[i];
      const minQty = Number(b.Amount);
      const price = Number(b.PriceValue);
      const next = sortedBreaks[i + 1];
      const nextQty = next ? Number(next.Amount) : NaN;
      priceBreaks.push({
        min_qty: minQty,
        max_qty: Number.isFinite(nextQty) ? nextQty - 1 : null,
        unit_price: price,
        currency,
      });
    }

    const unitPrice = priceBreaks[0]?.unit_price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    const stock = Number(p.Amount);
    const symbol = typeof p.Symbol === "string" ? p.Symbol : mpn;

    quotes.push({
      source: "tme",
      mpn: symbol,
      manufacturer: null, // not in this lite endpoint — don't synthesize
      supplier_part_number: null, // TME doesn't expose a distinct distributor PN here
      unit_price: unitPrice,
      currency,
      price_breaks: priceBreaks,
      stock_qty: Number.isFinite(stock) ? stock : null,
      moq: null,
      order_multiple: null,
      lead_time_days: null, // decision #9: no second call
      warehouse_code: null,
      ncnr: null,
      franchised: null,
      lifecycle_status: null,
      datasheet_url: null,
      product_url: null,
    });
  }

  return quotes;
}
