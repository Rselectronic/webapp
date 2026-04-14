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
 * Count individual designators from a comma/space-separated string.
 * Used when no_qty=true (ISC 2100-0185-3: no quantity column, count designators).
 *
 * "C1, C2, C3" → 3
 * "R1 R2 R3 R4" → 4
 * "U1" → 1
 */
function countDesignators(designatorStr: string): number {
  if (!designatorStr) return 1;
  // Split on comma, semicolon, or whitespace
  const parts = designatorStr.split(/[,;\s]+/).filter(Boolean);
  return parts.length || 1;
}

/**
 * Parse a BOM according to the 9 CP IP generation rules:
 *
 * 1. Fiducial Exclusion — skip designators matching ^FID\d+$
 * 2. PCB at Top — pin PCB row (designator matches ^PCB[A-Z0-9\-]*$)
 * 3. DNI Exclusion — skip rows with qty=0 & blank MPN, or DNI/DNP/DNL keywords
 * 4. No Title Row — output starts with data directly
 * 5. Log Sheet — every row's fate is tracked (PCB, AUTO-PCB, FIDUCIAL, DNI, N.M., INCLUDED, MERGED, HEADER, EMPTY)
 * 6. Designator-Only PCB Detection — never match PCB by description
 * 7. MPN Merge — same MPN → combine quantities, merge designators (natural sort)
 * 8. Auto-PCB from Gerber — in web context, generates synthetic PCB row from filename if no PCB row found
 * 9. Sort — quantity DESC, then first designator ASC (natural sort); PCB pinned top
 */
export function parseBom(
  rows: RawRow[],
  mapping: ColumnMapping,
  headers: string[],
  config: BomConfig,
  /** Optional: BOM filename, used for Auto-PCB fallback (Rule 8) when no PCB row found */
  bomFileName?: string,
  /** Optional: GMP number, used as final Auto-PCB fallback when filename extraction fails */
  gmpInfo?: { gmp_number: string; board_name?: string | null }
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
    not_mounted_skipped: 0,
    merged: 0,
    section_headers_skipped: 0,
    auto_pcb: false,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const designator = getField(row, mapping, "designator", headers);
    const qtyStr = getField(row, mapping, "qty", headers);
    const mpn = getField(row, mapping, "mpn", headers);
    const description = getField(row, mapping, "description", headers);
    const manufacturer = getField(row, mapping, "manufacturer", headers);
    const cpc = getField(row, mapping, "cpc", headers);

    // Quantity: either from the qty column, or count designators if no_qty mode
    let qty: number;
    if (config.no_qty) {
      qty = countDesignators(designator);
    } else {
      qty = parseInt(qtyStr, 10) || 0;
    }

    // Skip empty rows — all text fields blank (regardless of qty).
    // Catches summary/total rows that have a qty (e.g. 620) but no designator/MPN/description.
    if (!designator && !mpn && !description && !manufacturer && !cpc) {
      log.push({ raw_row_index: i, action: "EMPTY", detail: qty > 0 ? `qty-only row (${qty})` : undefined });
      continue;
    }

    // Section Header Filter — designator has spaces but no digits
    // Always apply this check (not just when section_filter is explicitly true)
    if (
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
        stats.not_mounted_skipped++;
        continue;
      }
    }

    // Rule 1: Fiducial Exclusion — first designator matches FID + digits
    const firstDesignator = designator.split(/[,;\s]/)[0]?.trim() ?? "";
    if (/^FID\d+$/i.test(firstDesignator)) {
      log.push({ raw_row_index: i, action: "FIDUCIAL" });
      stats.fiducials_skipped++;
      continue;
    }

    // Rule 2 & 6: PCB Detection (designator ONLY — never by description)
    if (/^PCB[A-Z0-9\-]*$/i.test(firstDesignator)) {
      pcbRow = {
        line_number: 0,
        quantity: qty || 1,
        reference_designator: designator,
        cpc: cpc || null,
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
    const isQtyZeroBlankMpn = !config.no_qty && qty === 0 && !mpn;
    if (
      isQtyZeroBlankMpn ||
      dniPatterns.test(description) ||
      dniPatterns.test(designator)
    ) {
      log.push({ raw_row_index: i, action: "DNI" });
      stats.dni_skipped++;
      continue;
    }

    // CPC: preserve what was in the source BOM. If the customer's BOM has no CPC
    // column, or the cell is empty / "N/A", store null — do NOT fall back to MPN.
    // Piyush needs to see when a CPC is genuinely missing vs. present.
    const cpcNormalized = cpc && cpc.toUpperCase() !== "N/A" && cpc.toUpperCase() !== "NA"
      ? cpc
      : null;

    included.push({
      line_number: lineCounter++,
      quantity: qty,
      reference_designator: designator,
      cpc: cpcNormalized,
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

  // Rule 8: Auto-PCB — if no PCB row found in BOM, create one from available info
  if (!pcbRow) {
    // Try filename first
    let pcbName: string | null = bomFileName ? extractPcbNameFromFile(bomFileName) : null;
    let pcbSource: string | null = pcbName ? `filename: ${bomFileName}` : null;

    // Fallback to GMP info if filename extraction failed
    if (!pcbName && gmpInfo) {
      pcbName = gmpInfo.board_name || gmpInfo.gmp_number;
      pcbSource = `GMP: ${pcbName}`;
    }

    if (pcbName) {
      pcbRow = {
        line_number: 0,
        quantity: 1,
        reference_designator: "PCB1",
        cpc: null,
        description: pcbName,
        mpn: pcbName,
        manufacturer: "",
        is_pcb: true,
        is_dni: false,
      };
      stats.auto_pcb = true;
      log.push({ raw_row_index: -1, action: "AUTO-PCB", detail: `Derived from ${pcbSource}` });
    } else {
      // Final fallback: create a generic PCB row so there is always a PCB line
      pcbRow = {
        line_number: 0,
        quantity: 1,
        reference_designator: "PCB1",
        cpc: null,
        description: "Printed Circuit Board",
        mpn: "",
        manufacturer: "",
        is_pcb: true,
        is_dni: false,
      };
      stats.auto_pcb = true;
      log.push({ raw_row_index: -1, action: "AUTO-PCB", detail: "Generic PCB row — no filename or GMP info available" });
    }
  }

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

/**
 * Extract a PCB name from a BOM filename.
 * Strips common prefixes (BOM_, CP_IP_, Gerber_PCB_), file extensions, and date suffixes.
 *
 * "BOM_TL265-5040-000-T_RevB.xlsx" → "TL265-5040-000-T"
 * "CP_IP_2100-0074-2-P.xlsx" → "2100-0074-2-P"
 */
function extractPcbNameFromFile(filename: string): string | null {
  let name = filename
    .replace(/\.(xlsx|xls|csv|zip)$/i, "")    // strip extension
    .replace(/^(BOM[_\s-]*|CP[_\s-]*IP[_\s-]*)/i, "")  // strip BOM_ or CP_IP_ prefix
    .replace(/[_\s-]*(Rev[A-Z0-9]*|v\d+)$/i, "")  // strip revision suffix
    .replace(/[_\s-]*\d{6,8}$/i, "")  // strip date suffix (YYYYMMDD or YYMMDD)
    .trim();

  return name.length >= 3 ? name : null;
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
