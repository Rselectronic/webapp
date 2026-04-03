import type { BomConfig, ColumnMapping, RawRow } from "./types";

const AUTO_DETECT_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  qty: [
    "qty", "quantity", "qté", "quantity for 1 board",
    "quantity / board", "requested quantity 1",
  ],
  designator: [
    "designator", "designation", "ref des", "ref. des.",
    "reference designator", "refdes", "r des.",
    "position sur circuit", "reference", "part reference", "index",
  ],
  mpn: [
    "mpn", "manufacturer part number", "manufacturer_pn", "mfr#",
    "manufacturer part", "part number", "mfg p/n",
  ],
  manufacturer: [
    "manufacturer", "mfg name", "manufacturier",
    "mfr name", "manufacturer name", "manufacturer 1",
  ],
  description: [
    "description", "desc", "part description", "value", "name",
  ],
  cpc: [
    "cpc", "erp_pn", "isc p/n", "legend p/n", "fiso#",
  ],
};

export function resolveColumnMapping(
  config: BomConfig,
  headers: string[]
): ColumnMapping {
  // Case 1: Fixed column order (no headers, e.g. Lanka)
  if (config.columns_fixed) {
    const mapping: Partial<ColumnMapping> = {};
    config.columns_fixed.forEach((field, index) => {
      if (field in AUTO_DETECT_KEYWORDS || field === "cpc" || field === "description") {
        (mapping as Record<string, number>)[field] = index;
      }
    });
    return mapping as ColumnMapping;
  }

  // Case 2: Explicit column name mapping
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

  // Case 3: Auto-detect
  return autoDetectColumns(headers);
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<ColumnMapping> = {};

  for (const [field, keywords] of Object.entries(AUTO_DETECT_KEYWORDS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (keywords.includes(normalizedHeaders[i])) {
        (mapping as Record<string, number>)[field] = i;
        break;
      }
    }
  }

  if (mapping.qty === undefined || mapping.mpn === undefined) {
    throw new Error(
      `Could not auto-detect required columns. Found: ${JSON.stringify(mapping)}. Headers: ${JSON.stringify(headers)}`
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
