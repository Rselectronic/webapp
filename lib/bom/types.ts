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
  action: "INCLUDED" | "PCB" | "AUTO-PCB" | "AUTO-PCB-FAIL" | "FIDUCIAL" | "DNI" | "MERGED" | "SECTION_HEADER" | "NOT_MOUNTED" | "EMPTY" | "HEADER";
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
    not_mounted_skipped: number;
    merged: number;
    section_headers_skipped: number;
    auto_pcb: boolean;
  };
}

/** Customer BOM configuration (stored in customers.bom_config JSONB) */
export interface BomConfig {
  header_row?: number | null;
  header_none?: boolean;            // Lanka: no header row at all, use columns_fixed order
  columns_fixed?: string[];          // Fixed column order when header_none=true
  columns?: Record<string, string> | "auto_detect";
  forced_columns?: string[];         // ISC 2100-0142: force column names in order (overrides detected headers)
  encoding?: string;                 // Default: utf-8. RTINGS: "utf-16"
  format?: string;                   // "xlsx" | "csv" | "xlsx_raw_xml"
  separator?: string;                // Default: comma. RTINGS: "\t"
  section_filter?: boolean;
  mount_filter_col?: string;
  mount_exclude_values?: string[];
  cpc_fallback?: string;
  no_qty?: boolean;                  // ISC 2100-0185-3: no quantity column, count designators instead
  use_raw_xml?: boolean;             // Infinition: Excel breaks SheetJS, parse raw XML
  gerber_search_path?: string;       // Where to look for Gerber files relative to BOM
  gerber_sibling_pattern?: string;   // Infinition: "PANEL - */Gerber & NC Drills/"
  notes?: string;
}
