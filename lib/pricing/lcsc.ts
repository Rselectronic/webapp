import { createHash } from "crypto";
import { getCredential } from "@/lib/supplier-credentials";

const LCSC_SEARCH_URL =
  "https://ips.lcsc.com/rest/wmsc2agent/search/product";

interface LcscCreds {
  api_key: string;
  api_secret: string;
}

// Module-level credentials cache with 60-second TTL — see digikey.ts for
// rationale. Matches the pattern used by the other pricing clients.
let cachedCreds: { creds: LcscCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getLcscCredentials(): Promise<LcscCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) {
    return cachedCreds.creds;
  }
  try {
    const fromDb = await getCredential<LcscCreds>("lcsc");
    if (fromDb?.api_key && fromDb?.api_secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // DB unavailable / SUPPLIER_CREDENTIALS_KEY missing — fall through
  }
  const api_key = process.env.LCSC_API_KEY;
  const api_secret = process.env.LCSC_API_SECRET;
  if (!api_key || !api_secret) return null;
  const creds: LcscCreds = { api_key, api_secret };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

export interface LCSCPartResult {
  mpn: string;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  lcsc_pn: string;
  stock_qty: number;
}

function generateNonce(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function sha1(data: string): string {
  return createHash("sha1").update(data).digest("hex");
}

export async function searchLCSCPrice(
  mpn: string
): Promise<LCSCPartResult | null> {
  const creds = await getLcscCredentials();
  if (!creds) return null;
  const key = creds.api_key;
  const secret = creds.api_secret;

  try {
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Generate signature: SHA1 of key + nonce + secret + timestamp
    const signPayload = `key=${key}&nonce=${nonce}&secret=${secret}&timestamp=${timestamp}`;
    const signature = sha1(signPayload);

    // Build request params
    const params = new URLSearchParams({
      keyword: mpn,
      key,
      nonce,
      timestamp,
      sign: signature,
    });

    const res = await fetch(`${LCSC_SEARCH_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      code: number;
      result?: {
        tipProductDetailUrlVO?: Array<{
          productModel: string;
          productDescEn: string;
          productCode: string;
          stockNumber: number;
          productPriceList?: Array<{
            ladder: number;
            usdPrice: number;
            productPrice: number;
            currencySymbol: string;
          }>;
        }>;
      };
    };

    if (data.code !== 200) return null;

    const product = data.result?.tipProductDetailUrlVO?.[0];
    if (!product) return null;

    // Get unit price from first price tier
    const priceTier = product.productPriceList?.[0];
    const unitPrice = priceTier?.productPrice ?? priceTier?.usdPrice ?? 0;

    return {
      mpn: product.productModel,
      description: product.productDescEn,
      unit_price: unitPrice,
      currency: priceTier?.currencySymbol ?? "USD",
      in_stock: product.stockNumber > 0,
      lcsc_pn: product.productCode,
      stock_qty: product.stockNumber,
    };
  } catch {
    return null;
  }
}
