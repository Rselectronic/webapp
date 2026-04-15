import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Known suppliers. Each has its own credential schema (different fields).
 * The metadata table below documents what fields each supplier expects.
 *
 * SupplierName is a string to allow custom (user-defined) distributors added
 * at runtime via /settings/api-config → stored in public.custom_suppliers.
 * Use BuiltInSupplierName / isBuiltInSupplier() when you need to restrict
 * to the 12 hardcoded distributors that have real test implementations.
 */
export type SupplierName = string;
export type BuiltInSupplierName =
  | "digikey"
  | "mouser"
  | "lcsc"
  | "future"
  | "avnet"
  | "arrow"
  | "tti"
  | "esonic"
  | "newark"
  | "samtec"
  | "ti"
  | "tme";

export const BUILT_IN_SUPPLIER_NAMES: ReadonlyArray<BuiltInSupplierName> = [
  "digikey",
  "mouser",
  "lcsc",
  "future",
  "avnet",
  "arrow",
  "tti",
  "esonic",
  "newark",
  "samtec",
  "ti",
  "tme",
];

export function isBuiltInSupplier(name: string): name is BuiltInSupplierName {
  return (BUILT_IN_SUPPLIER_NAMES as readonly string[]).includes(name);
}

export interface SupplierFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface SupplierMetadata {
  name: SupplierName;
  display_name: string;
  fields: SupplierFieldDef[];
  supported_currencies: string[];
  default_currency: string;
  docs_url: string;
  notes?: string;
}

export const SUPPLIER_METADATA: Record<BuiltInSupplierName, SupplierMetadata> = {
  digikey: {
    name: "digikey",
    display_name: "DigiKey",
    fields: [
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      { key: "environment", label: "Environment", type: "select", required: true, options: ["Production", "Sandbox"] },
    ],
    supported_currencies: ["USD", "CAD", "EUR", "GBP", "JPY", "AUD", "CHF", "CNY", "DKK", "HKD", "INR", "KRW", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TWD", "ZAR"],
    default_currency: "CAD",
    docs_url: "https://developer.digikey.com",
    notes: "OAuth 2.0 client credentials flow. Currency is set via X-DIGIKEY-Locale-Currency header per request.",
  },
  mouser: {
    name: "mouser",
    display_name: "Mouser",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    supported_currencies: ["USD", "CAD", "EUR", "GBP", "JPY", "AUD", "CHF", "CNY", "DKK", "HKD", "INR", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TWD", "ZAR", "BRL", "CZK", "HUF", "ILS", "MYR", "PHP", "THB"],
    default_currency: "CAD",
    docs_url: "https://www.mouser.com/api-hub/",
    notes: "API key in query string. Currency configured per-search via SearchOptions.",
  },
  lcsc: {
    name: "lcsc",
    display_name: "LCSC",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "api_secret", label: "API Secret", type: "password", required: true },
    ],
    supported_currencies: ["USD", "CNY", "EUR", "GBP", "JPY", "AUD"],
    default_currency: "USD",
    docs_url: "https://www.lcsc.com/api-doc",
    notes: "SHA1 signature auth — currently blocked vendor-side per HANDOFF.md.",
  },
  future: {
    name: "future",
    display_name: "Future Electronics",
    fields: [
      { key: "license_key", label: "License Key", type: "password", required: true },
    ],
    supported_currencies: ["USD", "CAD", "EUR"],
    default_currency: "CAD",
    docs_url: "https://www.futureelectronics.com",
  },
  avnet: {
    name: "avnet",
    display_name: "Avnet",
    fields: [
      { key: "subscription_key", label: "Subscription Key", type: "password", required: true },
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
    supported_currencies: ["USD", "EUR", "GBP", "CAD"],
    default_currency: "CAD",
    docs_url: "https://developer.avnet.com",
  },
  arrow: {
    name: "arrow",
    display_name: "Arrow Electronics",
    fields: [
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
    supported_currencies: ["USD", "EUR", "GBP", "CAD"],
    default_currency: "CAD",
    docs_url: "https://developers.arrow.com",
  },
  tti: {
    name: "tti",
    display_name: "TTI",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    supported_currencies: ["USD", "EUR", "GBP"],
    default_currency: "USD",
    docs_url: "https://www.tti.com/content/ttiinc/en/apps/api.html",
  },
  esonic: {
    name: "esonic",
    display_name: "e-Sonic",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    supported_currencies: ["USD"],
    default_currency: "USD",
    docs_url: "https://www.e-sonic.com",
  },
  newark: {
    name: "newark",
    display_name: "Newark / Element14",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    supported_currencies: ["USD", "GBP", "EUR", "CAD"],
    default_currency: "CAD",
    docs_url: "https://partner.element14.com",
  },
  samtec: {
    name: "samtec",
    display_name: "Samtec",
    fields: [
      { key: "bearer_token", label: "Bearer Token", type: "password", required: true },
    ],
    supported_currencies: ["USD"],
    default_currency: "USD",
    docs_url: "https://samtec.com/services",
    notes: "Manufacturer, not distributor. Pricing is direct from Samtec.",
  },
  ti: {
    name: "ti",
    display_name: "Texas Instruments",
    fields: [
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
    ],
    supported_currencies: ["USD"],
    default_currency: "USD",
    docs_url: "https://www.ti.com/api/",
    notes: "Manufacturer direct pricing.",
  },
  tme: {
    name: "tme",
    display_name: "TME",
    fields: [
      { key: "token", label: "App Token", type: "password", required: true },
      { key: "secret", label: "App Secret", type: "password", required: true },
    ],
    supported_currencies: ["USD", "EUR", "GBP", "PLN", "CZK", "HUF", "RON", "BGN"],
    default_currency: "USD",
    docs_url: "https://developers.tme.eu",
    notes: "Polish distributor — strong on European stock.",
  },
};

const ALGORITHM = "aes-256-gcm";

function getMasterKey(): Buffer {
  const keyB64 = process.env.SUPPLIER_CREDENTIALS_KEY;
  if (!keyB64) {
    throw new Error(
      "SUPPLIER_CREDENTIALS_KEY env var is not set — credentials cannot be encrypted/decrypted. Add it to .env.local and Vercel."
    );
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SUPPLIER_CREDENTIALS_KEY must be 32 bytes base64-encoded, got ${key.length} bytes`
    );
  }
  return key;
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: enc.toString("base64"),
  };
  return JSON.stringify(payload);
}

function decrypt(packed: string): string {
  const key = getMasterKey();
  const payload = JSON.parse(packed) as EncryptedPayload;
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Mask a credential value for display: show first 4 + last 4 chars, mask middle.
 * Short values get fully masked.
 */
function maskValue(v: string): string {
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.min(v.length - 8, 16)) + v.slice(-4);
}

function buildPreview(
  fields: SupplierFieldDef[],
  data: Record<string, string>
): Record<string, string> {
  const preview: Record<string, string> = {};
  for (const f of fields) {
    const val = data[f.key];
    if (!val) continue;
    preview[f.key] = f.type === "password" ? maskValue(val) : val;
  }
  return preview;
}

export interface CredentialStatus {
  supplier: SupplierName;
  display_name: string;
  configured: boolean;
  preferred_currency: string | null;
  default_currency: string;
  supported_currencies: string[];
  preview: Record<string, string>;
  updated_at: string | null;
  fields: SupplierFieldDef[];
  docs_url: string;
  notes?: string;
  is_custom: boolean;
}

/**
 * Look up metadata for a supplier — built-in first, falling back to the
 * custom_suppliers DB table. Returns null if the supplier doesn't exist
 * in either source.
 */
export async function getSupplierMetadata(
  name: SupplierName
): Promise<SupplierMetadata | null> {
  if (isBuiltInSupplier(name)) {
    return SUPPLIER_METADATA[name];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("custom_suppliers")
    .select(
      "name, display_name, fields, supported_currencies, default_currency, docs_url, notes"
    )
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return {
    name: data.name as string,
    display_name: data.display_name as string,
    fields: data.fields as SupplierFieldDef[],
    supported_currencies: data.supported_currencies as string[],
    default_currency: data.default_currency as string,
    docs_url: (data.docs_url as string | null) ?? "",
    notes: (data.notes as string | null) ?? undefined,
  };
}

/**
 * Decrypt and return the raw credentials for a supplier. Caller MUST be a
 * trusted server context (admin client / API route handler). Never expose
 * to the browser.
 */
export async function getCredential<T = Record<string, string>>(
  supplier: SupplierName
): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supplier_credentials")
    .select("ciphertext, configured")
    .eq("supplier", supplier)
    .maybeSingle();
  if (error || !data || !data.configured) return null;
  try {
    const json = decrypt(data.ciphertext);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Get a single supplier's preferred currency (or its default if not set).
 */
export async function getPreferredCurrency(supplier: SupplierName): Promise<string> {
  const meta = await getSupplierMetadata(supplier);
  const admin = createAdminClient();
  const { data } = await admin
    .from("supplier_credentials")
    .select("preferred_currency")
    .eq("supplier", supplier)
    .maybeSingle();
  return data?.preferred_currency ?? meta?.default_currency ?? "CAD";
}

/**
 * Encrypt and upsert credentials for a supplier. Updates updated_at and
 * the preview JSON for UI display.
 */
export async function setCredential(
  supplier: SupplierName,
  data: Record<string, string>,
  options: {
    preferred_currency?: string;
    updated_by?: string;
  } = {}
): Promise<void> {
  const meta = await getSupplierMetadata(supplier);
  if (!meta) throw new Error(`Unknown supplier: ${supplier}`);

  for (const f of meta.fields) {
    if (f.required && !data[f.key]) {
      throw new Error(`Missing required field for ${supplier}: ${f.key}`);
    }
  }

  const ciphertext = encrypt(JSON.stringify(data));
  const preview = buildPreview(meta.fields, data);

  const admin = createAdminClient();
  const { error } = await admin
    .from("supplier_credentials")
    .upsert(
      {
        supplier,
        ciphertext,
        preview,
        configured: true,
        preferred_currency: options.preferred_currency ?? meta.default_currency,
        updated_at: new Date().toISOString(),
        updated_by: options.updated_by ?? null,
      },
      { onConflict: "supplier" }
    );
  if (error) throw new Error(`Failed to save credential: ${error.message}`);
}

/**
 * Soft-delete: marks configured=false and clears the ciphertext. Row stays
 * for audit but credentials are gone.
 */
export async function deleteCredential(supplier: SupplierName): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("supplier_credentials")
    .update({
      ciphertext: encrypt(""),
      configured: false,
      preview: {},
      updated_at: new Date().toISOString(),
    })
    .eq("supplier", supplier);
  if (error) throw new Error(`Failed to delete credential: ${error.message}`);
}

/**
 * Update only the preferred currency without touching credentials.
 */
export async function setPreferredCurrency(
  supplier: SupplierName,
  currency: string
): Promise<void> {
  const meta = await getSupplierMetadata(supplier);
  if (!meta) throw new Error(`Unknown supplier: ${supplier}`);
  if (!meta.supported_currencies.includes(currency)) {
    throw new Error(`${supplier} does not support currency ${currency}`);
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("supplier_credentials")
    .update({ preferred_currency: currency, updated_at: new Date().toISOString() })
    .eq("supplier", supplier);
  if (error) throw new Error(`Failed to update currency: ${error.message}`);
}

interface SupplierCredentialRow {
  supplier: string;
  configured: boolean;
  preferred_currency: string | null;
  preview: Record<string, string> | null;
  updated_at: string | null;
}

interface CustomSupplierRow {
  name: string;
  display_name: string;
  fields: SupplierFieldDef[];
  supported_currencies: string[];
  default_currency: string;
  docs_url: string | null;
  notes: string | null;
}

/**
 * List all suppliers (configured + not configured) with their metadata,
 * status, and masked preview. Used by the settings UI.
 *
 * Returns an entry for every built-in supplier PLUS every row in
 * custom_suppliers. Built-ins first (in BUILT_IN_SUPPLIER_NAMES order),
 * then customs.
 */
export async function listCredentialStatus(): Promise<CredentialStatus[]> {
  const admin = createAdminClient();

  const [credsResult, customResult] = await Promise.all([
    admin
      .from("supplier_credentials")
      .select("supplier, configured, preferred_currency, preview, updated_at"),
    admin
      .from("custom_suppliers")
      .select(
        "name, display_name, fields, supported_currencies, default_currency, docs_url, notes"
      ),
  ]);

  const credsByName = new Map<string, SupplierCredentialRow>(
    ((credsResult.data ?? []) as SupplierCredentialRow[]).map((r) => [r.supplier, r])
  );

  const builtIns: CredentialStatus[] = BUILT_IN_SUPPLIER_NAMES.map((name) => {
    const meta = SUPPLIER_METADATA[name];
    const row = credsByName.get(name);
    return {
      supplier: name,
      display_name: meta.display_name,
      configured: row?.configured ?? false,
      preferred_currency: row?.preferred_currency ?? null,
      default_currency: meta.default_currency,
      supported_currencies: meta.supported_currencies,
      preview: (row?.preview as Record<string, string>) ?? {},
      updated_at: row?.updated_at ?? null,
      fields: meta.fields,
      docs_url: meta.docs_url,
      notes: meta.notes,
      is_custom: false,
    };
  });

  const customs: CredentialStatus[] = ((customResult.data ?? []) as CustomSupplierRow[]).map(
    (c) => {
      const row = credsByName.get(c.name);
      return {
        supplier: c.name,
        display_name: c.display_name,
        configured: row?.configured ?? false,
        preferred_currency: row?.preferred_currency ?? null,
        default_currency: c.default_currency,
        supported_currencies: c.supported_currencies,
        preview: (row?.preview as Record<string, string>) ?? {},
        updated_at: row?.updated_at ?? null,
        fields: c.fields,
        docs_url: c.docs_url ?? "",
        notes: c.notes ?? undefined,
        is_custom: true,
      };
    }
  );

  return [...builtIns, ...customs];
}

export interface AddCustomSupplierInput {
  name: string;
  display_name: string;
  fields: SupplierFieldDef[];
  supported_currencies: string[];
  default_currency: string;
  docs_url?: string;
  notes?: string;
}

/**
 * Add a new custom distributor. Validates that the name doesn't collide
 * with a built-in supplier and matches the lowercase-alnum naming rule.
 */
export async function addCustomSupplier(
  input: AddCustomSupplierInput,
  createdBy: string
): Promise<void> {
  if (!/^[a-z][a-z0-9_-]*$/.test(input.name)) {
    throw new Error(
      "Name must be lowercase letters, numbers, hyphens, or underscores, starting with a letter."
    );
  }
  if (isBuiltInSupplier(input.name)) {
    throw new Error(
      `'${input.name}' is reserved for the built-in ${
        SUPPLIER_METADATA[input.name as BuiltInSupplierName].display_name
      } supplier.`
    );
  }
  if (!input.display_name || input.display_name.trim().length === 0) {
    throw new Error("display_name is required.");
  }
  if (!input.fields || input.fields.length === 0) {
    throw new Error("At least one credential field is required.");
  }
  if (!input.supported_currencies || input.supported_currencies.length === 0) {
    throw new Error("At least one supported currency is required.");
  }
  if (!input.supported_currencies.includes(input.default_currency)) {
    throw new Error("Default currency must be in the supported currencies list.");
  }
  for (const f of input.fields) {
    if (!f.key || !f.label || !f.type) {
      throw new Error("Every field must have a key, label, and type.");
    }
    if (!/^[a-z][a-z0-9_]*$/.test(f.key)) {
      throw new Error(
        `Field key '${f.key}' must be lowercase alphanumeric with underscores.`
      );
    }
    if (!["text", "password", "select"].includes(f.type)) {
      throw new Error(`Field type must be 'text', 'password', or 'select'.`);
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("custom_suppliers").insert({
    name: input.name,
    display_name: input.display_name,
    fields: input.fields,
    supported_currencies: input.supported_currencies,
    default_currency: input.default_currency,
    docs_url: input.docs_url ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error(`A distributor named '${input.name}' already exists.`);
    }
    throw new Error(`Failed to add custom supplier: ${error.message}`);
  }
}

/**
 * Delete a custom supplier definition AND its stored credentials.
 * Built-in suppliers cannot be deleted.
 */
export async function deleteCustomSupplier(name: string): Promise<void> {
  if (isBuiltInSupplier(name)) {
    throw new Error(`Cannot delete built-in supplier '${name}'.`);
  }
  const admin = createAdminClient();
  await admin.from("supplier_credentials").delete().eq("supplier", name);
  const { error } = await admin.from("custom_suppliers").delete().eq("name", name);
  if (error) {
    throw new Error(`Failed to delete custom supplier: ${error.message}`);
  }
}
