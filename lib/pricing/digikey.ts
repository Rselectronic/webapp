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
  // Component details extracted from Parameters
  mounting_type?: string;
  package_case?: string;
  category?: string;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
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
      Parameters?: Array<{
        ParameterId: number;
        Parameter: string;
        Value: string;
      }>;
      Category?: { Name: string };
    }>;
  };
  const product = data.Products?.[0];
  if (!product) return null;

  // Extract component details from Parameters array
  const params = product.Parameters ?? [];
  const getParam = (name: string) => params.find((p) => p.Parameter === name)?.Value;

  const mountingType = getParam("Mounting Type");
  const packageCase = getParam("Package / Case") ?? getParam("Package/Case");
  const category = product.Category?.Name;

  // Try to parse dimensions from "Size / Dimension" parameter
  // Format varies: "0.039" L x 0.020" W (1.00mm x 0.50mm)" or "1.0mm x 0.5mm"
  let lengthMm: number | undefined;
  let widthMm: number | undefined;
  let heightMm: number | undefined;
  const sizeStr = getParam("Size / Dimension") ?? getParam("Size/Dimension") ?? "";
  const mmMatch = sizeStr.match(/([\d.]+)\s*mm\s*[x×]\s*([\d.]+)\s*mm/i);
  if (mmMatch) {
    lengthMm = parseFloat(mmMatch[1]);
    widthMm = parseFloat(mmMatch[2]);
  }
  const heightStr = getParam("Height") ?? getParam("Height - Seated (Max)") ?? "";
  const hMatch = heightStr.match(/([\d.]+)\s*mm/i);
  if (hMatch) heightMm = parseFloat(hMatch[1]);

  return {
    mpn: product.ManufacturerPartNumber,
    description: product.Description.ProductDescription,
    unit_price: product.UnitPrice,
    currency: "CAD",
    in_stock: product.QuantityAvailable > 0,
    digikey_pn: product.DigiKeyPartNumber,
    mounting_type: mountingType,
    package_case: packageCase,
    category,
    length_mm: lengthMm,
    width_mm: widthMm,
    height_mm: heightMm,
  };
}
