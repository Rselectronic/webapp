import type { BomConfig, ColumnMapping, RawRow } from "./types";

// Exact-match keywords (checked first)
const EXACT_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  qty: ["qty", "quantity", "qté", "quantity for 1 board", "quantity / board", "requested quantity 1", "count", "amount", "board qty", "qty per board", "number"],
  designator: ["designator", "designation", "ref des", "ref. des.", "reference designator", "refdes", "ref_des", "r des.", "position sur circuit", "part reference", "references", "index", "ref", "component reference", "component"],
  mpn: ["mpn", "manufacturer part number", "manufacturer_pn", "mfr#", "manufacturer part", "part number", "partnumber", "mfg p/n", "manufacturer p/n", "part_number", "manufacturer part number 1", "mfr part number", "mfr part no", "mfg part no", "mfg part number", "mfr p/n", "p/n", "pn", "part no", "part no.", "part#", "part #", "component part number"],
  manufacturer: ["manufacturer", "mfg name", "manufacturier", "mfr name", "manufacturer name", "manufacturer 1", "mfg", "mfr", "vendor", "brand", "supplier"],
  description: ["description", "desc", "part description", "name", "schematic value", "comment", "component name", "comp description", "spec", "specification"],
  cpc: ["cpc", "erp_pn", "isc p/n", "legend p/n", "fiso#", "customer part", "customer pn", "internal pn", "internal part"],
};

// Contains-match keywords (checked second — header CONTAINS this substring)
const CONTAINS_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
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
