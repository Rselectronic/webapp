"use client";

// ----------------------------------------------------------------------------
// AddressFields
//
// Country-aware address inputs for customer billing/shipping addresses.
//   - Country: dropdown (Canada / United States / Other)
//   - Province (CA) / State (US): dropdown of canonical 2-letter codes
//   - Region (Other): free-text (no list — international addresses vary)
//   - Postal code label adapts to the country (Postal code vs ZIP code)
//
// Stores:
//   country_code: 'CA' | 'US' | 'OTHER'
//   country:      display string ("Canada" / "United States" / free text)
//   province:     2-letter code for CA/US, free text for OTHER
// ----------------------------------------------------------------------------

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COUNTRY_LABELS,
  CA_PROVINCES,
  US_STATES,
  postalLabelFor,
  regionLabelFor,
  type CountryCode,
} from "@/lib/address/regions";

export interface AddressFieldsValue {
  country_code: CountryCode;
  country: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
}

interface AddressFieldsProps {
  value: AddressFieldsValue;
  onChange: (next: AddressFieldsValue) => void;
  /** Compact mode used inside the create dialog where vertical room is tight. */
  size?: "sm" | "md";
}

export function AddressFields({ value, onChange, size = "md" }: AddressFieldsProps) {
  const inputClass = size === "sm" ? "h-8 text-sm" : "h-9 text-sm";

  function update<K extends keyof AddressFieldsValue>(
    key: K,
    val: AddressFieldsValue[K]
  ) {
    onChange({ ...value, [key]: val });
  }

  function handleCountryChange(next: CountryCode) {
    // Reset province whenever country changes — a CA province isn't a valid
    // US state and vice versa. Keep street/city/postal so a typo-fix on
    // country doesn't wipe the rest.
    onChange({
      ...value,
      country_code: next,
      country: next === "OTHER" ? value.country : COUNTRY_LABELS[next],
      province: "",
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={value.street}
        onChange={(e) => update("street", e.target.value)}
        placeholder="Street address"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={value.city}
          onChange={(e) => update("city", e.target.value)}
          placeholder="City"
          className={inputClass}
        />

        {/* Country */}
        <Select
          value={value.country_code}
          onValueChange={(v) =>
            v && handleCountryChange(v as CountryCode)
          }
        >
          <SelectTrigger className={`${inputClass} w-full`}>
            <SelectValue>
              {(v: string) =>
                v === "CA"
                  ? "Canada"
                  : v === "US"
                    ? "United States"
                    : v === "OTHER"
                      ? "Other"
                      : ""
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CA">Canada</SelectItem>
            <SelectItem value="US">United States</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Province / State / Region */}
        {value.country_code === "CA" ? (
          <Select
            value={value.province || "__none__"}
            onValueChange={(v) =>
              update("province", v == null || v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger className={`${inputClass} w-full`} aria-label="Province">
              <SelectValue>
                {(v: string) => {
                  if (!v || v === "__none__") return `${regionLabelFor("CA")}…`;
                  const p = CA_PROVINCES.find((p) => p.code === v);
                  return p ? `${p.code} — ${p.name}` : v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{regionLabelFor("CA")}…</SelectItem>
              {CA_PROVINCES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : value.country_code === "US" ? (
          <Select
            value={value.province || "__none__"}
            onValueChange={(v) =>
              update("province", v == null || v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger className={`${inputClass} w-full`} aria-label="State">
              <SelectValue>
                {(v: string) => {
                  if (!v || v === "__none__") return `${regionLabelFor("US")}…`;
                  const s = US_STATES.find((s) => s.code === v);
                  return s ? `${s.code} — ${s.name}` : v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{regionLabelFor("US")}…</SelectItem>
              {US_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={value.province}
            onChange={(e) => update("province", e.target.value)}
            placeholder="Region / State"
            className={inputClass}
          />
        )}

        <Input
          value={value.postal_code}
          onChange={(e) => update("postal_code", e.target.value)}
          placeholder={postalLabelFor(value.country_code)}
          className={inputClass}
        />
      </div>

      {/* Free-text country shown only when "Other" — ISO codes alone aren't
          enough for international addresses. */}
      {value.country_code === "OTHER" ? (
        <Input
          value={value.country}
          onChange={(e) => update("country", e.target.value)}
          placeholder="Country name (e.g. Germany)"
          className={inputClass}
        />
      ) : null}
    </div>
  );
}
