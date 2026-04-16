import { getCredential, getPreferredCurrency } from "@/lib/supplier-credentials";

// Ported from lib/supplier-tests.ts fix by Piyush 2026-04-15 (Session 10 entry 1)
// DigiKey base URL is now derived from the credentials' `environment` field
// (or DIGIKEY_ENVIRONMENT env var) so the Sandbox flag actually takes effect
// on the runtime pricing path. The old hardcoded `https://api.digikey.com/`
// silently ignored sandbox creds and hit prod, which passed the Test button
// but failed real quote runs when sandbox was selected.
const DIGIKEY_PROD_BASE = "https://api.digikey.com";
const DIGIKEY_SANDBOX_BASE = "https://sandbox-api.digikey.com";

function digikeyBaseUrl(env: string | undefined): string {
  const isSandbox = (env ?? "").toLowerCase().startsWith("sand");
  return isSandbox ? DIGIKEY_SANDBOX_BASE : DIGIKEY_PROD_BASE;
}

interface DigikeyCreds {
  client_id: string;
  client_secret: string;
  environment?: "Production" | "Sandbox";
}

let cachedToken: { access_token: string; expires_at: number } | null = null;

// Module-level credentials cache. 60-second TTL — keeps hot-path pricing
// calls off the DB without making rotation feel stale (CEO rotation via UI
// takes effect within a minute).
let cachedCreds: { creds: DigikeyCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getDigikeyCredentials(): Promise<DigikeyCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) {
    return cachedCreds.creds;
  }
  // Try DB first
  try {
    const fromDb = await getCredential<DigikeyCreds>("digikey");
    if (fromDb?.client_id && fromDb?.client_secret) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch {
    // DB unavailable / SUPPLIER_CREDENTIALS_KEY missing — fall through
  }
  // Fall back to env vars (existing behavior)
  const client_id = process.env.DIGIKEY_CLIENT_ID;
  const client_secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!client_id || !client_secret) return null;
  const creds: DigikeyCreds = {
    client_id,
    client_secret,
    environment:
      (process.env.DIGIKEY_ENVIRONMENT as "Production" | "Sandbox") ??
      "Production",
  };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

async function getAccessToken(): Promise<string> {
  const creds = await getDigikeyCredentials();
  if (!creds)
    throw new Error("DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set");
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000)
    return cachedToken.access_token;

  // Ported from lib/supplier-tests.ts fix by Piyush 2026-04-15 (Session 10 entry 1)
  const tokenUrl = `${digikeyBaseUrl(creds.environment)}/v1/oauth2/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
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
  stock_qty: number;
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
  const creds = await getDigikeyCredentials();
  if (!creds) return null;
  const token = await getAccessToken();
  const currency = await getPreferredCurrency("digikey");
  // Ported from lib/supplier-tests.ts fix by Piyush 2026-04-15 (Session 10 entry 1)
  const searchUrl = `${digikeyBaseUrl(creds.environment)}/products/v4/search/keyword`;
  const res = await fetch(searchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": creds.client_id,
      "X-DIGIKEY-Locale-Site": "CA",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": currency,
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
  // DigiKey Product Information v4 response shape
  const data = (await res.json()) as {
    Products?: Array<{
      ManufacturerProductNumber: string;
      Description: { ProductDescription: string; DetailedDescription?: string };
      UnitPrice: number;
      QuantityAvailable: number;
      ProductVariations?: Array<{
        DigiKeyProductNumber: string;
        PackageType?: { Name: string };
      }>;
      Parameters?: Array<{
        ParameterId: number;
        ParameterText: string;
        ValueText: string;
      }>;
      Category?: { Name: string; ChildCategories?: Array<{ Name: string }> };
    }>;
  };
  const product = data.Products?.[0];
  if (!product) return null;

  // Extract component details from Parameters array (v4 uses ParameterText/ValueText)
  const params = product.Parameters ?? [];
  const getParam = (name: string) =>
    params.find((p) => p.ParameterText === name)?.ValueText;

  // Category: prefer the most-specific child category (e.g. "Chip Resistor - Surface Mount")
  const topCategory = product.Category?.Name;
  const childCategory = product.Category?.ChildCategories?.[0]?.Name;
  const category = childCategory ?? topCategory;

  // Mounting Type: DigiKey only populates this parameter on some categories
  // (e.g. connectors, ICs). For chip resistors / capacitors it is absent, so
  // infer from the category name when missing.
  let mountingType = getParam("Mounting Type");
  if (!mountingType) {
    const catLower = (childCategory ?? topCategory ?? "").toLowerCase();
    if (catLower.includes("surface mount") || catLower.includes("smd")) {
      mountingType = "Surface Mount";
    } else if (catLower.includes("through hole")) {
      mountingType = "Through Hole";
    }
  }

  const packageCase =
    getParam("Package / Case") ??
    getParam("Package/Case") ??
    getParam("Supplier Device Package");

  // Parse dimensions. DigiKey "Size / Dimension" format example:
  //   0.039" L x 0.020" W (1.00mm x 0.50mm)
  // Fall back to plain "1.0mm x 0.5mm" if no parenthetical.
  let lengthMm: number | undefined;
  let widthMm: number | undefined;
  let heightMm: number | undefined;
  const sizeStr =
    getParam("Size / Dimension") ?? getParam("Size/Dimension") ?? "";
  const parenMatch = sizeStr.match(/\(([\d.]+)\s*mm\s*[x×]\s*([\d.]+)\s*mm\)/i);
  const mmMatch =
    parenMatch ?? sizeStr.match(/([\d.]+)\s*mm\s*[x×]\s*([\d.]+)\s*mm/i);
  if (mmMatch) {
    lengthMm = parseFloat(mmMatch[1]);
    widthMm = parseFloat(mmMatch[2]);
  }
  const heightStr =
    getParam("Height - Seated (Max)") ?? getParam("Height") ?? "";
  // Height format: 0.016" (0.40mm)
  const hParen = heightStr.match(/\(([\d.]+)\s*mm\)/i);
  const hMatch = hParen ?? heightStr.match(/([\d.]+)\s*mm/i);
  if (hMatch) heightMm = parseFloat(hMatch[1]);

  // DigiKey PN lives on the first ProductVariation
  const digikeyPn = product.ProductVariations?.[0]?.DigiKeyProductNumber ?? "";

  return {
    mpn: product.ManufacturerProductNumber,
    description: product.Description.ProductDescription,
    unit_price: product.UnitPrice,
    currency,
    in_stock: product.QuantityAvailable > 0,
    stock_qty: product.QuantityAvailable ?? 0,
    digikey_pn: digikeyPn,
    mounting_type: mountingType,
    package_case: packageCase,
    category,
    length_mm: lengthMm,
    width_mm: widthMm,
    height_mm: heightMm,
  };
}
