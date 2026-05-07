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
  /**
   * DigiKey customer/account id. When present, sent as the
   * `X-DIGIKEY-Customer-Id` header — this is what unlocks `MyPricing`
   * (contract rates) in the productdetails response. Without it DigiKey
   * returns only `StandardPricing`, even for authenticated accounts.
   */
  customer_id?: string;
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
    customer_id: process.env.DIGIKEY_CUSTOMER_ID,
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
    signal: AbortSignal.timeout(10_000), // 10s for auth
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

export interface DigiKeyPriceBreak {
  quantity: number;
  unit_price: number;
  currency: string;
}

export interface DigiKeyPartResult {
  mpn: string;
  manufacturer: string | null;
  description: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  stock_qty: number;
  digikey_pn: string;
  /**
   * Manufacturer lead time, normalized to days (DigiKey publishes weeks on
   * the root product; multiply by 7). null when the product is in stock or
   * the field is absent from the response.
   */
  lead_time_days: number | null;
  /** Full volume-break ladder from ProductVariations[0].StandardPricing. */
  price_breaks: DigiKeyPriceBreak[];
  /**
   * DigiKey ProductStatus.Status — "Active", "Obsolete", "Discontinued",
   * "Last Time Buy", "NRND", etc. Passed straight through; the panel
   * highlights anything outside of "Active"/"Production".
   */
  lifecycle_status: string | null;
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
  // Use the productdetails endpoint (exact-MPN lookup) instead of keyword
  // search. productdetails returns account-specific `MyPricing` alongside
  // `StandardPricing`; the keyword endpoint strips MyPricing on most accounts,
  // which is why contract prices never surfaced in the pricing review panel.
  const searchUrl = `${digikeyBaseUrl(creds.environment)}/products/v4/search/${encodeURIComponent(mpn)}/productdetails`;
  // 10s per API call. DigiKey's productdetails endpoint routinely takes
  // 2–4s on first hit for an MPN (upstream cache miss), and 5–7s when the
  // part has many variants. The previous 2s ceiling was forcing false
  // timeouts even when the API would have responded a fraction of a second
  // later — every retry wasted an API-call quota slot against the 1000/day
  // cap. Keeps parity with the auth-call timeout above.
  const abort = AbortSignal.timeout(10_000);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-DIGIKEY-Client-Id": creds.client_id,
    "X-DIGIKEY-Locale-Site": "CA",
    "X-DIGIKEY-Locale-Language": "en",
    "X-DIGIKEY-Locale-Currency": currency,
  };
  // Contract-pricing gate: DigiKey only returns `MyPricing` when the request
  // is scoped to a specific customer account. Without this header you get
  // StandardPricing even with valid OAuth + a populated account.
  if (creds.customer_id) {
    headers["X-DIGIKEY-Customer-Id"] = creds.customer_id;
  }
  const res = await fetch(searchUrl, {
    method: "GET",
    signal: abort,
    headers,
  });
  if (!res.ok) return null;
  // DigiKey Product Information v4 productdetails response shape —
  // singular `Product` object at the root (keyword endpoint used `Products[]`).
  const data = (await res.json()) as {
    Product?: {
      ManufacturerProductNumber: string;
      Manufacturer?: { Name?: string; Id?: number };
      Description: { ProductDescription: string; DetailedDescription?: string };
      UnitPrice: number;
      QuantityAvailable: number;
      // DigiKey publishes manufacturer lead time in weeks on the product root.
      // Sometimes returned as a number, occasionally as a numeric string ("12")
      // or — when the product is fully stocked — absent entirely.
      ManufacturerLeadWeeks?: number | string | null;
      ProductVariations?: Array<{
        DigiKeyProductNumber: string;
        PackageType?: { Name: string };
        StandardPricing?: Array<{
          BreakQuantity: number;
          UnitPrice: number;
          TotalPrice: number;
        }>;
        // Account-specific contract pricing. When present, overrides
        // StandardPricing for this variation. Same shape as StandardPricing.
        MyPricing?: Array<{
          BreakQuantity: number;
          UnitPrice: number;
          TotalPrice: number;
        }>;
      }>;
      Parameters?: Array<{
        ParameterId: number;
        ParameterText: string;
        ValueText: string;
      }>;
      Category?: { Name: string; ChildCategories?: Array<{ Name: string }> };
      // DigiKey publishes the part lifecycle as a typed object on V4
      // productdetails — `{ Id: number, Status: string }`. Older accounts /
      // sandbox sometimes return it as a bare string, so handle both shapes.
      ProductStatus?: { Id?: number; Status?: string } | string;
    };
  };
  const product = data.Product;
  if (!product) return null;

  const lifecycle_status =
    typeof product.ProductStatus === "string"
      ? product.ProductStatus.trim() || null
      : typeof product.ProductStatus?.Status === "string"
        ? product.ProductStatus.Status.trim() || null
        : null;

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

  // DigiKey returns one ProductVariation per packaging (Cut Tape, Digi-Reel,
  // Tape & Reel, etc.). Tape & Reel often sits at index 0 but its pricing only
  // starts at 5000 pcs — so picking ProductVariations[0] caused order qtys
  // like 320 to resolve to the 5000-break price. Instead, pick the variation
  // with the smallest minimum BreakQuantity (typically Cut Tape, which has
  // the full qty-1 → qty-1000 ladder), and merge in any lower unit prices
  // from other variations so high-volume tiers still resolve to the best
  // price across all packagings.
  const variations = product.ProductVariations ?? [];

  // One-shot diagnostic: log whether MyPricing came back on any variation.
  // Watch the server logs on the next pricing fetch — if this is `false`, the
  // productdetails endpoint is not returning MyPricing for this OAuth app,
  // and nothing we do in the merge logic can surface contract prices.
  const hasMyPricing = variations.some((v) => (v.MyPricing ?? []).length > 0);
  console.info(
    `[digikey] mpn=${mpn} variations=${variations.length} customerIdSent=${!!creds.customer_id} hasMyPricing=${hasMyPricing}`
  );

  // For each variation, prefer account-specific MyPricing over StandardPricing.
  // MyPricing reflects contract / negotiated rates tied to the DigiKey account
  // the API credentials belong to; when absent or empty, fall back to public
  // StandardPricing so parts without a contract still resolve.
  const pricingFor = (v: (typeof variations)[number]) => {
    const my = v.MyPricing ?? [];
    return my.length > 0 ? my : v.StandardPricing ?? [];
  };

  const minBreakQty = (v: (typeof variations)[number]) => {
    const qtys = pricingFor(v)
      .map((pb) => pb.BreakQuantity)
      .filter((q) => Number.isFinite(q) && q > 0);
    return qtys.length ? Math.min(...qtys) : Number.POSITIVE_INFINITY;
  };
  const primary =
    [...variations].sort((a, b) => minBreakQty(a) - minBreakQty(b))[0] ??
    variations[0];
  const digikeyPn = primary?.DigiKeyProductNumber ?? "";

  // Merge price breaks across all variations, keeping the lowest unit_price
  // per BreakQuantity so bigger-reel discounts still apply at higher tiers.
  const breakByQty = new Map<number, number>();
  for (const v of variations) {
    for (const pb of pricingFor(v)) {
      if (!Number.isFinite(pb.BreakQuantity) || pb.BreakQuantity <= 0) continue;
      if (!Number.isFinite(pb.UnitPrice) || pb.UnitPrice <= 0) continue;
      const existing = breakByQty.get(pb.BreakQuantity);
      if (existing == null || pb.UnitPrice < existing) {
        breakByQty.set(pb.BreakQuantity, pb.UnitPrice);
      }
    }
  }
  const priceBreaks: DigiKeyPriceBreak[] = Array.from(breakByQty.entries())
    .map(([quantity, unit_price]) => ({ quantity, unit_price, currency }))
    .sort((a, b) => a.quantity - b.quantity);

  // Normalize ManufacturerLeadWeeks → days. Handles number, numeric string,
  // and the "in stock" case where the field is absent or 0.
  const rawLeadWeeks = product.ManufacturerLeadWeeks;
  const leadWeeksNum =
    typeof rawLeadWeeks === "number"
      ? rawLeadWeeks
      : typeof rawLeadWeeks === "string"
        ? Number.parseFloat(rawLeadWeeks)
        : NaN;
  const lead_time_days =
    Number.isFinite(leadWeeksNum) && leadWeeksNum > 0
      ? Math.round(leadWeeksNum * 7)
      : null;

  return {
    mpn: product.ManufacturerProductNumber,
    manufacturer:
      typeof product.Manufacturer?.Name === "string" && product.Manufacturer.Name.trim().length > 0
        ? product.Manufacturer.Name
        : null,
    description:
      product.Description.DetailedDescription ??
      product.Description.ProductDescription,
    unit_price: priceBreaks[0]?.unit_price ?? product.UnitPrice,
    lead_time_days,
    currency,
    in_stock: product.QuantityAvailable > 0,
    stock_qty: product.QuantityAvailable ?? 0,
    digikey_pn: digikeyPn,
    price_breaks: priceBreaks,
    lifecycle_status,
    mounting_type: mountingType,
    package_case: packageCase,
    category,
    length_mm: lengthMm,
    width_mm: widthMm,
    height_mm: heightMm,
  };
}
