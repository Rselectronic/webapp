import type {
  RawRow,
  ColumnMapping,
  ParsedLine,
  ParsedAlternate,
  ParseLogEntry,
  ParseResult,
  BomConfig,
} from "./types";
import { getField } from "./column-mapper";

/** Read a cell by its column ref (header name or index) the same way
 *  getField() does, but for columns not in ColumnMapping's fixed keys. */
function readCell(row: RawRow, colRef: string | number): string {
  let value: string | number | null | undefined;
  if (typeof colRef === "number") {
    const keys = Object.keys(row);
    value = row[keys[colRef]];
  } else {
    value = row[colRef];
  }
  return value != null ? String(value).trim() : "";
}

/**
 * Treat common "no value" placeholders the same as an empty cell.
 *
 * Customer BOMs often have an alternate-MPN column where rows that have no
 * approved alternate are filled with N/A / TBD / - / "none" instead of
 * being left blank. Pulling those through as real alternates pollutes the
 * parts library and breaks downstream pricing. This list is intentionally
 * conservative — only values that are unambiguously "not a part number"
 * with no realistic chance of being a legitimate MPN.
 */
function isPlaceholderValue(s: string): boolean {
  const v = s.trim().toUpperCase();
  if (v === "") return true;
  // Strip common decoration so "N/A", "N.A.", "n.a", "(N/A)" all collapse
  // to the same canonical token.
  const stripped = v.replace(/[.\s()/\\\-_]/g, "");
  return (
    stripped === "" ||
    stripped === "NA" ||
    stripped === "NONE" ||
    stripped === "NIL" ||
    stripped === "NULL" ||
    stripped === "TBD" ||
    stripped === "TBA" ||
    stripped === "TBC" ||
    stripped === "DNS" ||
    stripped === "X" ||
    stripped === "?"
  );
}

/** Extract customer-supplied alternates for a single row, paired with their
 *  manufacturer when the BOM has an aligned alt-mfr column. Dedupes against
 *  the primary MPN and against each other; drops empties and common
 *  placeholder values (N/A, TBD, dashes, etc.). */
function extractAlternates(
  row: RawRow,
  mapping: ColumnMapping,
  primaryMpn: string,
  primaryManufacturer: string
): ParsedAlternate[] {
  const altMpnRefs = mapping.alt_mpns ?? [];
  const altMfrRefs = mapping.alt_manufacturers ?? [];
  if (altMpnRefs.length === 0) return [];

  const seen = new Set<string>();
  if (primaryMpn) seen.add(primaryMpn.toUpperCase());

  const out: ParsedAlternate[] = [];
  for (let i = 0; i < altMpnRefs.length; i++) {
    const mpn = readCell(row, altMpnRefs[i]);
    // Skip empty cells AND placeholders so "N/A", "TBD", "-" etc. don't
    // leak in as real alternate part numbers.
    if (!mpn || isPlaceholderValue(mpn)) continue;
    const key = mpn.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Same placeholder check on the alt manufacturer column — if it's
    // "N/A", fall back to the primary manufacturer rather than storing
    // the placeholder as the manufacturer name.
    const rawMfr = i < altMfrRefs.length ? readCell(row, altMfrRefs[i]) : "";
    const mfr = !rawMfr || isPlaceholderValue(rawMfr) ? "" : rawMfr;
    out.push({
      mpn,
      manufacturer: mfr || primaryManufacturer,
    });
  }
  return out;
}

export function naturalSort(a: string, b: string): number {
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
  _bomFileName?: string,
  /** Optional: GMP number, used as final Auto-PCB fallback when filename extraction fails */
  _gmpInfo?: { gmp_number: string; board_name?: string | null }
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

    // Quantity: either from the qty column, or count designators if no_qty mode.
    //
    // Some customers (Lanka especially) use the Quantity cell on wire/jumper
    // rows to store a length string like "0.75in" or "1.75in" instead of an
    // integer count. parseInt would silently yield 0 for "0.75in" and drop
    // the part. Rules:
    //   • blank cell or literal "0" → qty=0 (DNI candidate, behaviour unchanged)
    //   • pure integer ("5") → qty=that integer
    //   • anything else (length spec, "TBD", "ea", "1 of 2"...) → qty defaults
    //     to 1 AND we capture the raw cell on `qtyCellNote` so production can
    //     see the original spec (e.g. wire length) on the BOM detail page.
    let qty: number;
    let qtyCellNote: string | null = null;
    if (config.no_qty) {
      qty = countDesignators(designator);
    } else {
      const trimmed = (qtyStr ?? "").trim();
      if (!trimmed) {
        qty = 0;
      } else if (/^\d+$/.test(trimmed)) {
        qty = parseInt(trimmed, 10);
      } else {
        const parsed = parseInt(trimmed, 10);
        qty = !isNaN(parsed) && parsed > 0 ? parsed : 1;
        qtyCellNote = trimmed;
      }
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

    // Rule 2 & 6: PCB Detection (designator ONLY — never by description).
    // Standard match is the `^PCB[A-Z0-9\-]*$` pattern. Customers who use a
    // board-specific designator (e.g. Lanka uses "FIBRE") can add it to
    // their bom_config.pcb_designators list — case-insensitive exact match
    // on the first designator token.
    const isCustomPcbDesignator =
      Array.isArray(config.pcb_designators) &&
      config.pcb_designators.some(
        (d) => d.trim().toLowerCase() === firstDesignator.toLowerCase()
      );
    if (/^PCB[A-Z0-9\-]*$/i.test(firstDesignator) || isCustomPcbDesignator) {
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

    // CPC: show whatever the source BOM has in the CPC column.
    // Only null out empty strings and "N/A" markers.
    // If the customer's file has MPN in the CPC column (e.g. Lanka), show it —
    // that IS their CPC. Don't try to be smart about deduplication.
    const cpcTrimmed = cpc?.trim() ?? "";
    const cpcUpper = cpcTrimmed.toUpperCase();
    const cpcNormalized =
      cpcTrimmed && cpcUpper !== "N/A" && cpcUpper !== "NA"
        ? cpcTrimmed
        : null;

    const alternates = extractAlternates(row, mapping, mpn, manufacturer);

    // Preserve the original qty cell text on rows where it wasn't a plain
    // integer — Lanka wire/jumper rows put the build length here (e.g.
    // "0.75in") and production needs to see it.
    const descriptionOut = qtyCellNote
      ? [description, `[qty: ${qtyCellNote}]`].filter(Boolean).join(" ")
      : description;

    included.push({
      line_number: lineCounter++,
      quantity: qty,
      reference_designator: designator,
      cpc: cpcNormalized,
      description: descriptionOut,
      mpn,
      manufacturer,
      is_pcb: false,
      is_dni: false,
      alternates: alternates.length > 0 ? alternates : undefined,
    });
    log.push({ raw_row_index: i, action: "INCLUDED" });
    stats.included++;
  }

  // Rule 7: MPN Merge — same MPN → combine rows
  const merged = mergeSameMpn(included, log, stats);

  // Rule 8: Auto-PCB — DISABLED.
  // If the BOM has a real PCB row (detected by designator ^PCB[A-Z0-9\-]*$),
  // it's kept. If there's no PCB row, we do NOT fabricate one.
  // The GMP record itself represents the board — no ghost row needed.
  if (!pcbRow) {
    log.push({
      raw_row_index: -1,
      action: "AUTO-PCB-FAIL",
      detail: "BOM has no PCB row. Auto-creation disabled per Anas.",
    });
  }

  // mergeSameMpn logged `merged_into: <existing.line_number>` which is the
  // PRE-sort line number. The sort+renumber below mutates each ParsedLine's
  // line_number, so we snapshot pre-sort line_number → ParsedLine here and
  // patch the MERGED entries after renumber so they point at the final
  // surviving line number.
  const refByOldLine = new Map<number, ParsedLine>();
  for (const l of merged) refByOldLine.set(l.line_number, l);

  // Rule 9: Sort to match the operators' Excel convention:
  //   1. qty=0 ("not installed" placeholders) pushed to the bottom
  //   2. Within each bucket: designator A→Z primary, qty DESC tiebreaker
  //      ("Sort by Column B A-Z, then by Column A Largest-to-Smallest")
  merged.sort((a, b) => {
    const aZero = a.quantity <= 0;
    const bZero = b.quantity <= 0;
    if (aZero !== bZero) return aZero ? 1 : -1;
    const desCmp = naturalSort(a.reference_designator, b.reference_designator);
    if (desCmp !== 0) return desCmp;
    return b.quantity - a.quantity;
  });

  // Re-number lines after merge + sort
  merged.forEach((line, idx) => {
    line.line_number = idx + 1;
  });

  // Now patch every MERGED log entry's merged_into to the new line number
  // (looked up via the pre-sort → ParsedLine map).
  for (const entry of log) {
    if (entry.action !== "MERGED" || typeof entry.merged_into !== "number") continue;
    const ref = refByOldLine.get(entry.merged_into);
    if (ref) entry.merged_into = ref.line_number;
  }

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

      // Union alternates from both rows — different designators for the same
      // primary MPN might carry different second-source suggestions.
      if (line.alternates && line.alternates.length > 0) {
        const seen = new Set<string>(
          (existing.alternates ?? []).map((a) => a.mpn.toUpperCase())
        );
        seen.add(existing.mpn.toUpperCase());
        const merged = [...(existing.alternates ?? [])];
        for (const alt of line.alternates) {
          const k = alt.mpn.toUpperCase();
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(alt);
        }
        existing.alternates = merged.length > 0 ? merged : undefined;
      }

      stats.merged++;
      // Snapshot the SOURCE row (the one being absorbed) BEFORE we lose
      // its identity by folding into `existing`. The audit panel renders
      // every column so production can see what got combined.
      log.push({
        raw_row_index: -1,
        action: "MERGED",
        merged_into: existing.line_number,
        detail: `MPN ${line.mpn}`,
        merged_row: {
          quantity: line.quantity,
          reference_designator: line.reference_designator,
          cpc: line.cpc,
          description: line.description,
          mpn: line.mpn,
          manufacturer: line.manufacturer,
        },
      });
    } else {
      mpnMap.set(key, line);
      result.push(line);
    }
  }

  return result;
}
