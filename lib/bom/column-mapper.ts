import type { BomConfig, ColumnMapping, RawRow } from "./types";

// Single-value mapping keys (excludes the array-valued alt_* fields).
type SingleFieldKey = "qty" | "designator" | "cpc" | "description" | "mpn" | "manufacturer";

// Exact-match keywords (checked first)
const EXACT_KEYWORDS: Record<SingleFieldKey, string[]> = {
  qty: ["qty", "quantity", "qté", "quantity for 1 board", "quantity / board", "requested quantity 1", "count", "amount", "board qty", "qty per board", "number"],
  designator: ["designator", "designation", "ref des", "ref. des.", "reference designator", "refdes", "ref_des", "r des.", "position sur circuit", "part reference", "references", "index", "ref", "component reference", "component"],
  mpn: ["mpn", "manufacturer part number", "manufacturer_pn", "mfr#", "manufacturer part", "part number", "partnumber", "mfg p/n", "manufacturer p/n", "part_number", "manufacturer part number 1", "mfr part number", "mfr part no", "mfg part no", "mfg part number", "mfr p/n", "p/n", "pn", "part no", "part no.", "part#", "part #", "component part number"],
  manufacturer: ["manufacturer", "mfg name", "manufacturier", "mfr name", "manufacturer name", "manufacturer 1", "mfg", "mfr", "vendor", "brand", "supplier"],
  description: ["description", "desc", "part description", "name", "schematic value", "comment", "component name", "comp description", "spec", "specification"],
  cpc: ["cpc", "erp_pn", "isc p/n", "legend p/n", "fiso#", "customer part", "customer pn", "internal pn", "internal part"],
};

// Contains-match keywords (checked second — header CONTAINS this substring)
const CONTAINS_KEYWORDS: Record<SingleFieldKey, string[]> = {
  qty: ["quantit", "qty", "count", "amount"],
  designator: ["designat", "ref des", "refdes", "reference", "ref."],
  mpn: ["manufacturer p", "mfr p", "mfg p", "part number", "part#", "part #", "manufacturer_pn", "part no", "mfr no", "mfg no", "p/n"],
  manufacturer: ["manufactur", "mfr name", "mfg name", "vendor", "supplier"],
  description: ["descript", "comment", "spec"],
  cpc: ["cpc", "erp", "customer part", "internal p"],
};

export function resolveColumnMapping(
  config: BomConfig,
  headers: string[]
): ColumnMapping {
  let mapping: ColumnMapping;

  // Case 1: Fixed column order (no headers, e.g. Lanka — header_none=true)
  if (config.columns_fixed) {
    const m: Partial<ColumnMapping> = {};
    const validFields = ["qty", "designator", "cpc", "description", "mpn", "manufacturer"];
    config.columns_fixed.forEach((field, index) => {
      if (validFields.includes(field)) {
        (m as Record<string, number>)[field] = index;
      }
    });
    mapping = m as ColumnMapping;
  }
  // Case 2: Forced column names (ISC 2100-0142 — override detected headers with known names)
  else if (config.forced_columns) {
    mapping = autoDetectColumns(config.forced_columns);
  }
  // Case 3: Explicit column name mapping
  else if (config.columns && config.columns !== "auto_detect") {
    const m: Partial<ColumnMapping> = {};
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    for (const [field, headerName] of Object.entries(config.columns)) {
      const idx = normalizedHeaders.indexOf(headerName.toLowerCase().trim());
      if (idx !== -1) {
        (m as Record<string, number>)[field] = idx;
      }
    }
    mapping = m as ColumnMapping;
  }
  // Case 4: Auto-detect
  else {
    mapping = autoDetectColumns(headers);
  }

  // Bind alternate-MPN columns. Priority: explicit config.alt_mpn_columns >
  // auto-detect from header keywords. `alt_mpn_columns: []` disables detection.
  mapping.alt_mpns = resolveAltMpnColumns(config, headers, mapping);
  mapping.alt_manufacturers = resolveAltManufacturerColumns(
    config,
    headers,
    mapping,
    mapping.alt_mpns.length
  );

  return mapping;
}

/**
 * Match a normalized (lowercased, trimmed) header against structured tests.
 * Deliberately checks fields independently (mfr vs part-number) so the caller
 * can route to the right list without pattern order mattering.
 */
function isPartNumberHeader(h: string): boolean {
  return (
    /\bmpn\b/.test(h) ||
    /\bp\/n\b/.test(h) ||
    /\bpn\b/.test(h) ||
    /\bpart\s*(number|no\.?|#)?\b/.test(h) ||
    /\bpart\s*number\b/.test(h)
  );
}

function isManufacturerHeader(h: string): boolean {
  return (
    /\bmanufacturer\b/.test(h) ||
    /\bmfr\b/.test(h) ||
    /\bmfg\b/.test(h) ||
    /\bvendor\b/.test(h) ||
    /\bsupplier\b/.test(h)
  );
}

/**
 * A header looks like an "alternate" marker if it starts with or contains
 * alt/alternate/second/third/.../sub/nth-source, OR it's a duplicate primary
 * field suffixed with a digit >1 (e.g. "Manufacturer Part Number 2",
 * "MFR Name 3"). The digit-suffix heuristic is what catches customers who
 * don't use the word "alternate" at all.
 */
function hasAltMarker(h: string): boolean {
  return (
    /\balt(ernate)?\b/.test(h) ||
    /\b(second|2nd|third|3rd|fourth|4th|fifth|5th)\s*(source|mpn|pn|part|mfr|mfg|manufacturer)?\b/.test(h) ||
    /\bsub\s*(mpn|pn|part|mfr|mfg|manufacturer)\b/.test(h) ||
    /\s[2-9]\s*$/.test(h) // trailing " 2" .. " 9"
  );
}

/**
 * Public entry point for auto-detecting alternate MPN / manufacturer columns
 * given headers + a primary mapping. Used by the parse route when the user
 * has supplied their own 6-field mapping via the UI Column Mapper — we still
 * want the alt columns to be picked up automatically.
 */
export function attachAlternateColumns(
  config: BomConfig,
  headers: string[],
  mapping: ColumnMapping
): ColumnMapping {
  mapping.alt_mpns = resolveAltMpnColumns(config, headers, mapping);
  mapping.alt_manufacturers = resolveAltManufacturerColumns(
    config,
    headers,
    mapping,
    mapping.alt_mpns.length
  );
  return mapping;
}

function resolveAltMpnColumns(
  config: BomConfig,
  headers: string[],
  primary: ColumnMapping
): Array<string | number> {
  // Explicit override wins. Empty array intentionally disables auto-detect.
  if (Array.isArray(config.alt_mpn_columns)) {
    const normalized = headers.map((h) => h.toLowerCase().trim());
    return config.alt_mpn_columns
      .map((col) => {
        const idx = normalized.indexOf(col.toLowerCase().trim());
        return idx === -1 ? null : idx;
      })
      .filter((v): v is number => v !== null);
  }

  // Auto-detect — skip the index already used for the primary MPN.
  // A header qualifies as an alt-MPN column when it names a part number
  // AND carries an "alternate" marker (explicit word or trailing digit).
  const primaryMpnIdx = typeof primary.mpn === "number" ? primary.mpn : -1;
  const indices: number[] = [];
  headers.forEach((h, i) => {
    if (i === primaryMpnIdx) return;
    const norm = h.toLowerCase().trim();
    if (!norm) return;
    if (isPartNumberHeader(norm) && !isManufacturerHeader(norm) && hasAltMarker(norm)) {
      indices.push(i);
    }
  });
  return indices;
}

function resolveAltManufacturerColumns(
  config: BomConfig,
  headers: string[],
  primary: ColumnMapping,
  altMpnCount: number
): Array<string | number> {
  if (altMpnCount === 0) return [];

  if (Array.isArray(config.alt_manufacturer_columns)) {
    const normalized = headers.map((h) => h.toLowerCase().trim());
    return config.alt_manufacturer_columns
      .map((col) => {
        const idx = normalized.indexOf(col.toLowerCase().trim());
        return idx === -1 ? null : idx;
      })
      .filter((v): v is number => v !== null);
  }

  const primaryMfrIdx =
    typeof primary.manufacturer === "number" ? primary.manufacturer : -1;
  const indices: number[] = [];
  headers.forEach((h, i) => {
    if (i === primaryMfrIdx) return;
    const norm = h.toLowerCase().trim();
    if (!norm) return;
    if (isManufacturerHeader(norm) && !isPartNumberHeader(norm) && hasAltMarker(norm)) {
      indices.push(i);
    }
  });
  return indices;
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<ColumnMapping> = {};

  // Pass 1: Exact match
  for (const [field, keywords] of Object.entries(EXACT_KEYWORDS)) {
    if ((mapping as Record<string, number>)[field] !== undefined) continue;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (keywords.includes(normalizedHeaders[i])) {
        (mapping as Record<string, number>)[field] = i;
        break;
      }
    }
  }

  // Pass 2: Contains match (for columns like "Manufacturer p/n", "Reference designator(s)")
  for (const [field, substrings] of Object.entries(CONTAINS_KEYWORDS)) {
    if ((mapping as Record<string, number>)[field] !== undefined) continue;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      // Skip columns already mapped to another field
      const alreadyUsed = Object.values(mapping).includes(i);
      if (alreadyUsed) continue;
      if (substrings.some((sub) => normalizedHeaders[i].includes(sub))) {
        (mapping as Record<string, number>)[field] = i;
        break;
      }
    }
  }

  // Fallback: if no description column found, use "value" as a low-priority fallback.
  // "value" columns (e.g. "100nF", "4.7k") are not true descriptions, but when there
  // is no actual "Description" column they are the closest substitute.
  if (mapping.description === undefined) {
    const usedIndices = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const h = normalizedHeaders[i];
      if (h === "value" || h === "val") {
        (mapping as Record<string, number>).description = i;
        break;
      }
    }
  }

  // Fallback: if no MPN column found, try to guess from remaining unmapped columns
  if (mapping.mpn === undefined) {
    const usedIndices = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
    // Look for any column with "part" or "number" in the name that isn't already mapped
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const h = normalizedHeaders[i];
      if (h.includes("part") || h.includes("number") || h.includes("p/n") || h.includes("pn") || h.includes("component") || h.includes("item")) {
        (mapping as Record<string, number>).mpn = i;
        break;
      }
    }
  }

  // Last resort: if still no MPN, assign the first unmapped text-looking column
  if (mapping.mpn === undefined) {
    const usedIndices = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const h = normalizedHeaders[i];
      // Skip obvious non-MPN columns
      if (h.includes("qty") || h.includes("quantit") || h.includes("price") || h.includes("cost") || h.includes("total") || h.includes("note")) continue;
      if (h.length > 0) {
        (mapping as Record<string, number>).mpn = i;
        break;
      }
    }
  }

  // If still no qty and no designator, try to find a numeric-looking column
  if (mapping.qty === undefined && mapping.designator === undefined) {
    const usedIndices = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedIndices.has(i)) continue;
      const h = normalizedHeaders[i];
      if (h.includes("qty") || h.includes("count") || h.includes("amount") || h.includes("#") || h === "no" || h === "no.") {
        (mapping as Record<string, number>).qty = i;
        break;
      }
    }
  }

  // Final validation — be lenient. Only fail if we truly have nothing usable.
  if (mapping.mpn === undefined && mapping.description === undefined) {
    const headerPreview = headers.slice(0, 20).join(", ");
    throw new Error(
      `Could not detect any usable columns (need at least mpn or description). Headers: [${headerPreview}]`
    );
  }

  return mapping as ColumnMapping;
}

export function getField(
  row: RawRow,
  mapping: ColumnMapping,
  field: SingleFieldKey,
  _headers: string[]
): string {
  const colRef = mapping[field];
  if (colRef === undefined) return "";

  let value: string | number | null | undefined;
  if (typeof colRef === "number") {
    const keys = Object.keys(row);
    value = row[keys[colRef]];
  } else {
    value = row[colRef];
  }

  return value != null ? String(value).trim() : "";
}
