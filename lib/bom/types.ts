/** A raw row extracted from an Excel/CSV file before normalization */
export interface RawRow {
  [key: string]: string | number | null | undefined;
}

/** Column mapping derived from customer's bom_config */
export interface ColumnMapping {
  qty: string | number;
  designator: string | number;
  cpc?: string | number;
  description?: string | number;
  mpn: string | number;
  manufacturer?: string | number;
}

/** A BOM line after parsing and normalization (before M-Code classification) */
export interface ParsedLine {
  line_number: number;
  quantity: number;
  reference_designator: string;
  cpc: string;
  description: string;
  mpn: string;
  manufacturer: string;
  is_pcb: boolean;
  is_dni: boolean;
}

/** Log entry tracking what happened to each raw row */
export interface ParseLogEntry {
  raw_row_index: number;
  action: "INCLUDED" | "PCB" | "FIDUCIAL" | "DNI" | "MERGED" | "SECTION_HEADER" | "NOT_MOUNTED" | "EMPTY";
  merged_into?: number;
  detail?: string;
}

/** Result of parsing a BOM file */
export interface ParseResult {
  lines: ParsedLine[];
  log: ParseLogEntry[];
  pcb_row: ParsedLine | null;
  stats: {
    total_raw_rows: number;
    included: number;
    fiducials_skipped: number;
    dni_skipped: number;
    merged: number;
    section_headers_skipped: number;
  };
}

/** Customer BOM configuration (stored in customers.bom_config JSONB) */
export interface BomConfig {
  header_row?: number | null;
  columns_fixed?: string[];
  columns?: Record<string, string> | "auto_detect";
  encoding?: string;
  format?: string;
  separator?: string;
  section_filter?: boolean;
  mount_filter_col?: string;
  mount_exclude_values?: string[];
  cpc_fallback?: string;
  notes?: string;
}
