import type { BomConfig, ColumnMapping, RawRow } from "./types";

// Exact-match keywords (checked first)
const EXACT_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  qty: ["qty", "quantity", "qté", "quantity for 1 board", "quantity / board", "requested quantity 1"],
  designator: ["designator", "designation", "ref des", "ref. des.", "reference designator", "refdes", "ref_des", "r des.", "position sur circuit", "part reference", "references", "index"],
  mpn: ["mpn", "manufacturer part number", "manufacturer_pn", "mfr#", "manufacturer part", "part number", "partnumber", "mfg p/n", "manufacturer p/n", "part_number", "manufacturer part number 1"],
  manufacturer: ["manufacturer", "mfg name", "manufacturier", "mfr name", "manufacturer name", "manufacturer 1"],
  description: ["description", "desc", "part description", "value", "name", "schematic value"],
  cpc: ["cpc", "erp_pn", "isc p/n", "legend p/n", "fiso#"],
};

// Contains-match keywords (checked second — header CONTAINS this substring)
const CONTAINS_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  qty: ["quantit", "qty"],
  designator: ["designat", "ref des", "refdes", "reference"],
  mpn: ["manufacturer p", "mfr p", "mfg p", "part number", "part#", "part #", "manufacturer_pn"],
  manufacturer: ["manufactur", "mfr name", "mfg name"],
  description: ["descript", "value"],
  cpc: ["cpc", "erp", "customer part"],
};

export function resolveColumnMapping(
  config: BomConfig,
  headers: string[]
): ColumnMapping {
  // Case 1: Fixed column order (no headers, e.g. Lanka — header_none=true)
  if (config.columns_fixed) {
    const mapping: Partial<ColumnMapping> = {};
    const validFields = ["qty", "designator", "cpc", "description", "mpn", "manufacturer"];
    config.columns_fixed.forEach((field, index) => {
      if (validFields.includes(field)) {
        (mapping as Record<string, number>)[field] = index;
      }
    });
    return mapping as ColumnMapping;
  }

  // Case 2: Forced column names (ISC 2100-0142 — override detected headers with known names)
  if (config.forced_columns) {
    return autoDetectColumns(config.forced_columns);
  }

  // Case 3: Explicit column name mapping
  if (config.columns && config.columns !== "auto_detect") {
    const mapping: Partial<ColumnMapping> = {};
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    for (const [field, headerName] of Object.entries(config.columns)) {
      const idx = normalizedHeaders.indexOf(headerName.toLowerCase().trim());
      if (idx !== -1) {
        (mapping as Record<string, number>)[field] = idx;
      }
    }
    return mapping as ColumnMapping;
  }

  // Case 4: Auto-detect
  return autoDetectColumns(headers);
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

  // qty + mpn required for standard BOMs; designator + mpn for no_qty BOMs
  if (mapping.mpn === undefined) {
    const headerPreview = headers.slice(0, 20).join(", ");
    throw new Error(
      `Could not auto-detect required columns (need at least mpn). Found: ${JSON.stringify(mapping)}. Headers (first 20): [${headerPreview}]`
    );
  }
  if (mapping.qty === undefined && mapping.designator === undefined) {
    const headerPreview = headers.slice(0, 20).join(", ");
    throw new Error(
      `Could not auto-detect required columns (need qty or designator). Found: ${JSON.stringify(mapping)}. Headers (first 20): [${headerPreview}]`
    );
  }

  return mapping as ColumnMapping;
}

export function getField(
  row: RawRow,
  mapping: ColumnMapping,
  field: keyof ColumnMapping,
  headers: string[]
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
