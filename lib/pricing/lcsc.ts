import { createHash } from "crypto";

const LCSC_SEARCH_URL =
  "https://ips.lcsc.com/rest/wmsc2agent/search/product";

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
  const key = process.env.LCSC_API_KEY;
  const secret = process.env.LCSC_API_SECRET;
  if (!key || !secret) return null;

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
