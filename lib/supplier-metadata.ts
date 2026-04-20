// Pure-data supplier metadata: types + constants describing the 12 built-in
// distributors (display name, credential field schemas, supported currencies,
// docs URLs). No runtime dependencies — safe to import from both client and
// server components.
//
// The server-side credential store (encrypt/decrypt, getCredential,
// listCredentialStatus) lives in `./supplier-credentials.ts` and re-exports
// everything below so existing imports stay valid.

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
