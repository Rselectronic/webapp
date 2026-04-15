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

export interface MouserPartResult {
  mpn: string;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  mouser_pn: string;
  stock_qty: number;
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
          Description: string;
          MouserPartNumber: string;
          Availability: string;
          PriceBreaks?: Array<{
            Quantity: number;
            Price: string;
            Currency: string;
          }>;
        }>;
      };
    };

    const part = data.SearchResults?.Parts?.[0];
    if (!part) return null;

    // Extract best unit price from price breaks
    const priceBreak = part.PriceBreaks?.[0];
    const priceStr = priceBreak?.Price?.replace(/[^0-9.]/g, "") ?? "0";
    const unitPrice = parseFloat(priceStr) || 0;

    // Parse stock quantity from availability string (e.g., "1,234 In Stock")
    const stockMatch = part.Availability?.match(/[\d,]+/);
    const stockQty = stockMatch
      ? parseInt(stockMatch[0].replace(/,/g, ""), 10)
      : 0;

    return {
      mpn: part.ManufacturerPartNumber,
      description: part.Description,
      unit_price: unitPrice,
      currency: priceBreak?.Currency ?? preferredCurrency,
      in_stock: stockQty > 0,
      mouser_pn: part.MouserPartNumber,
      stock_qty: stockQty,
    };
  } catch {
    return null;
  }
}
