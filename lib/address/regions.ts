/**
 * Country / province / state metadata for address forms.
 *
 * RS bills customers in two countries today:
 *   - Canada (most customers, GST/QST/HST mix)
 *   - United States (USD invoicing, no Canadian sales tax)
 *
 * Anywhere else is "Other" — operator types country/region as free text and
 * we treat the customer as INTERNATIONAL for tax purposes.
 *
 * Country codes are ISO 3166-1 alpha-2 ('CA', 'US', 'OTHER'). Province /
 * state codes are the canonical 2-letter postal abbreviations.
 */

import type { TaxRegion } from "@/lib/tax/regions";
import { deriveTaxRegion } from "@/lib/tax/regions";

export type CountryCode = "CA" | "US" | "OTHER";

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  CA: "Canada",
  US: "United States",
  OTHER: "Other",
};

// Canadian provinces and territories.
export const CA_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

// US states + DC.
export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

/**
 * Best-effort coercion of a free-text country string to a country code.
 * Used to backfill legacy address records ('Canada', 'United States', etc.)
 * to the new ISO-code shape.
 */
export function normalizeCountry(s: string | null | undefined): CountryCode {
  if (!s) return "CA"; // existing data is overwhelmingly Canadian; safest default
  const v = s.trim().toUpperCase();
  if (v === "CA" || v === "CAN" || v === "CANADA") return "CA";
  if (
    v === "US" ||
    v === "USA" ||
    v === "U.S." ||
    v === "U.S.A." ||
    v === "UNITED STATES" ||
    v === "UNITED STATES OF AMERICA"
  ) {
    return "US";
  }
  return "OTHER";
}

/**
 * Postal-code label for a country. We don't validate format because customer
 * addresses come from sales people typing them by hand; loose label is enough.
 */
export function postalLabelFor(country: CountryCode): string {
  if (country === "US") return "ZIP code";
  return "Postal code";
}

/**
 * Province/state label for a country.
 */
export function regionLabelFor(country: CountryCode): string {
  if (country === "US") return "State";
  if (country === "CA") return "Province";
  return "Region";
}

/**
 * Derive the tax_region for an address. Always reduces to one of the five
 * TaxRegion values. International (US + ROW) → 'INTERNATIONAL'. Canadian →
 * QC / CA_OTHER / HST_ON / HST_15 based on province.
 */
export function taxRegionForAddress(addr: {
  country_code?: CountryCode | string | null;
  country?: string | null;
  province?: string | null;
  state?: string | null;
}): TaxRegion {
  const code = (
    addr.country_code ?? normalizeCountry(addr.country)
  ) as CountryCode;
  if (code === "US" || code === "OTHER") return "INTERNATIONAL";
  // CA — defer to the existing province-based derivation.
  return deriveTaxRegion({
    country: "CA",
    province: addr.province ?? addr.state ?? null,
  });
}

/**
 * Derive the currency for an address. If the address carries an explicit
 * `currency` override (set by the operator on the customer record), use
 * that. Otherwise fall back to the country default: US → USD, everywhere
 * else → CAD. Quote and invoice creation reads through this so an override
 * on the customer's billing address propagates to documents automatically.
 */
export function currencyForAddress(addr: {
  country_code?: CountryCode | string | null;
  country?: string | null;
  currency?: "CAD" | "USD" | string | null;
}): "CAD" | "USD" {
  if (addr.currency === "CAD" || addr.currency === "USD") return addr.currency;
  const code = (
    addr.country_code ?? normalizeCountry(addr.country)
  ) as CountryCode;
  return code === "US" ? "USD" : "CAD";
}
