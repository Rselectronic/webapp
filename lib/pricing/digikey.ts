const DIGIKEY_TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";
const DIGIKEY_SEARCH_URL =
  "https://api.digikey.com/products/v4/search/keyword";

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DIGIKEY_CLIENT_ID;
  const clientSecret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set");
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000)
    return cachedToken.access_token;

  const res = await fetch(DIGIKEY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok)
    throw new Error(`DigiKey token error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.access_token;
}

export interface DigiKeyPartResult {
  mpn: string;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  digikey_pn: string;
}

export async function searchPartPrice(
  mpn: string
): Promise<DigiKeyPartResult | null> {
  const token = await getAccessToken();
  const clientId = process.env.DIGIKEY_CLIENT_ID!;
  const res = await fetch(DIGIKEY_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Locale-Site": "CA",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "CAD",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Keywords: mpn,
      Limit: 1,
      Offset: 0,
      FilterOptionsRequest: {},
      SortOptions: { Field: "None", SortOrder: "Ascending" },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    Products?: Array<{
      ManufacturerPartNumber: string;
      Description: { ProductDescription: string };
      UnitPrice: number;
      QuantityAvailable: number;
      DigiKeyPartNumber: string;
    }>;
  };
  const product = data.Products?.[0];
  if (!product) return null;
  return {
    mpn: product.ManufacturerPartNumber,
    description: product.Description.ProductDescription,
    unit_price: product.UnitPrice,
    currency: "CAD",
    in_stock: product.QuantityAvailable > 0,
    digikey_pn: product.DigiKeyPartNumber,
  };
}
