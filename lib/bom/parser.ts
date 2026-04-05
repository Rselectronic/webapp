import type {
  RawRow,
  ColumnMapping,
  ParsedLine,
  ParseLogEntry,
  ParseResult,
  BomConfig,
} from "./types";
import { getField } from "./column-mapper";

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Parse a BOM according to the 9 CP IP generation rules:
 *
 * 1. Fiducial Exclusion — skip designators matching ^FID\d+$
 * 2. PCB at Top — pin PCB row (designator matches ^PCB[A-Z0-9\-]*$)
 * 3. DNI Exclusion — skip rows with qty=0 & blank MPN, or DNI/DNP/DNL keywords
 * 4. No Title Row — output starts with data directly
 * 5. Log Sheet — every row's fate is tracked
 * 6. Designator-Only PCB Detection — never match PCB by description
 * 7. MPN Merge — same MPN → combine quantities, merge designators (natural sort)
 * 8. Auto-PCB from Gerber — deferred (web upload context)
 * 9. Sort — quantity DESC, then first designator ASC (natural sort); PCB pinned top
 */
export function parseBom(
  rows: RawRow[],
  mapping: ColumnMapping,
  headers: string[],
  config: BomConfig
): ParseResult {
  const log: ParseLogEntry[] = [];
  const included: ParsedLine[] = [];
  let pcbRow: ParsedLine | null = null;
  let lineCounter = 1;

  const stats = {
    total_raw_rows: rows.length,
    included: 0,
    fiducials_skipped: 0,
    dni_skipped: 0,
    merged: 0,
    section_headers_skipped: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const designator = getField(row, mapping, "designator", headers);
    const qtyStr = getField(row, mapping, "qty", headers);
    const mpn = getField(row, mapping, "mpn", headers);
    const description = getField(row, mapping, "description", headers);
    const manufacturer = getField(row, mapping, "manufacturer", headers);
    let cpc = getField(row, mapping, "cpc", headers);
    const qty = parseInt(qtyStr, 10) || 0;

    // Skip empty rows
    if (!designator && !mpn && !description && qty === 0) {
      log.push({ raw_row_index: i, action: "EMPTY" });
      continue;
    }

    // Section Header Filter — designator has spaces but no digits
    if (
      config.section_filter &&
      designator &&
      designator.includes(" ") &&
      !/\d/.test(designator)
    ) {
      log.push({
        raw_row_index: i,
        action: "SECTION_HEADER",
        detail: designator,
      });
      stats.section_headers_skipped++;
      continue;
    }

    // N.M. (Not Mounted) Filter — check config or auto-detect "Mounted" column
    const mountCol = config.mount_filter_col ??
      headers.find((h) => h.toLowerCase().trim() === "mounted");
    const mountExclude = config.mount_exclude_values ?? ["N.M.", "NOT MOUNTED", "NOT PLACE", "NOT PLACED", "DNM"];
    if (mountCol) {
      const mountVal = String(row[mountCol] ?? "").trim().toUpperCase();
      if (mountVal && mountExclude.some((v) => mountVal === v.toUpperCase())) {
        log.push({ raw_row_index: i, action: "NOT_MOUNTED", detail: mountVal });
        continue;
      }
    }

    // Rule 1: Fiducial Exclusion
    if (/^FID\d+$/i.test(designator)) {
      log.push({ raw_row_index: i, action: "FIDUCIAL" });
      stats.fiducials_skipped++;
      continue;
    }

    // Rule 2 & 6: PCB Detection (designator ONLY — never by description)
    if (/^PCB[A-Z0-9\-]*$/i.test(designator)) {
      pcbRow = {
        line_number: 0,
        quantity: qty || 1,
        reference_designator: designator,
        cpc: cpc || mpn,
        description: description || "Printed Circuit Board",
        mpn,
        manufacturer,
        is_pcb: true,
        is_dni: false,
      };
      log.push({ raw_row_index: i, action: "PCB" });
      continue;
    }

    // Rule 3: DNI Exclusion
    const dniPatterns =
      /\b(DNI|DNP|DNL|DO NOT INSTALL|DO NOT PLACE|DO NOT POPULATE)\b/i;
    if (
      (qty === 0 && !mpn) ||
      dniPatterns.test(description) ||
      dniPatterns.test(designator)
    ) {
      log.push({ raw_row_index: i, action: "DNI" });
      stats.dni_skipped++;
      continue;
    }

    // CPC Fallback — use MPN when CPC is empty
    if (!cpc) cpc = mpn;

    included.push({
      line_number: lineCounter++,
      quantity: qty,
      reference_designator: designator,
      cpc,
      description,
      mpn,
      manufacturer,
      is_pcb: false,
      is_dni: false,
    });
    log.push({ raw_row_index: i, action: "INCLUDED" });
    stats.included++;
  }

  // Rule 7: MPN Merge — same MPN → combine rows
  const merged = mergeSameMpn(included, log, stats);

  // Rule 9: Sort — quantity DESC, then first designator ASC (natural sort)
  merged.sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return naturalSort(a.reference_designator, b.reference_designator);
  });

  // Re-number lines after merge + sort
  merged.forEach((line, idx) => {
    line.line_number = idx + 1;
  });

  return { lines: merged, log, pcb_row: pcbRow, stats };
}

/** Merge rows sharing the same MPN: sum quantities, combine designators. */
function mergeSameMpn(
  lines: ParsedLine[],
  log: ParseLogEntry[],
  stats: { merged: number }
): ParsedLine[] {
  const mpnMap = new Map<string, ParsedLine>();
  const result: ParsedLine[] = [];

  for (const line of lines) {
    if (!line.mpn) {
      result.push(line);
      continue;
    }

    const key = line.mpn.toUpperCase();
    const existing = mpnMap.get(key);

    if (existing) {
      existing.quantity += line.quantity;
      const allDesignators = [
        ...existing.reference_designator.split(/,\s*/),
        ...line.reference_designator.split(/,\s*/),
      ]
        .filter(Boolean)
        .sort(naturalSort);
      existing.reference_designator = allDesignators.join(", ");
      stats.merged++;
      log.push({
        raw_row_index: -1,
        action: "MERGED",
        merged_into: existing.line_number,
        detail: `MPN ${line.mpn}`,
      });
    } else {
      mpnMap.set(key, line);
      result.push(line);
    }
  }

  return result;
}
