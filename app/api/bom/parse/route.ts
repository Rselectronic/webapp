import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { parseBom } from "@/lib/bom/parser";
import { resolveColumnMapping, attachAlternateColumns } from "@/lib/bom/column-mapper";
import { aiMapColumns } from "@/lib/bom/ai-column-mapper";
import type { BomConfig, ColumnMapping, RawRow } from "@/lib/bom/types";
import * as XLSX from "xlsx";
/**
 * Parse a raw CSV/TSV string into rows of string arrays.
 * Handles quoted fields with embedded separators and newlines.
 */
function parseCsvText(text: string, separator: string = ","): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === separator) {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim())) rows.push(current);
        current = [];
        if (ch === "\r") i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }
  // Last field/row
  current.push(field);
  if (current.some((c) => c.trim())) rows.push(current);

  return rows;
}

/**
 * Decode a file buffer into a string, handling different encodings.
 * Supports utf-8 (default), utf-16 (RTINGS), and latin1/iso-8859-1.
 */
function decodeBuffer(buffer: ArrayBuffer, encoding: string = "utf-8"): string {
  const normalizedEncoding = encoding.toLowerCase().replace(/[_-]/g, "");
  if (normalizedEncoding === "utf16" || normalizedEncoding === "utf16le" || normalizedEncoding === "utf16be") {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (normalizedEncoding === "latin1" || normalizedEncoding === "iso88591") {
    return new TextDecoder("latin1").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only: BOM uploads create a row in `boms` plus N rows in `bom_lines`,
  // and write a file into the `boms` storage bucket. Production users have
  // no INSERT policy on either table and shouldn't be authoring BOMs at all.
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const customerId = formData.get("customer_id") as string;
  const gmpId = formData.get("gmp_id") as string;
  // Revision can be anything the user typed ("1", "V5", "Rev A", "2.1"). Default to "1".
  const revisionInput = ((formData.get("revision") as string) ?? "").trim();
  const revision = revisionInput || "1";

  // Optional: explicit column mapping from the UI's column mapper.
  // If provided, overrides the customer's bom_config for column detection.
  const rawColumnMapping = formData.get("column_mapping") as string | null;
  let userColumnMapping: Record<string, string> | null = null;
  if (rawColumnMapping) {
    try {
      userColumnMapping = JSON.parse(rawColumnMapping);
    } catch { /* ignore bad JSON */ }
  }

  // User-picked alternate MPN / Manufacturer header names from the Column
  // Mapper UI. When present, these override any auto-detected alt columns.
  const parseJsonArray = (raw: string | null): string[] | null => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
    } catch {
      return null;
    }
  };
  const userAltMpnColumns = parseJsonArray(formData.get("alt_mpn_columns") as string | null);
  const userAltMfrColumns = parseJsonArray(formData.get("alt_manufacturer_columns") as string | null);

  // Optional: user-editable BOM display name, gerber info
  const bomName = ((formData.get("bom_name") as string) ?? "").trim() || null;
  const gerberName = ((formData.get("gerber_name") as string) ?? "").trim() || null;
  const gerberRevision = ((formData.get("gerber_revision") as string) ?? "").trim() || null;

  // Optional: explicit header row and last row from the UI (1-indexed).
  // If provided, overrides the auto-detection and bom_config header_row.
  const rawHeaderRow = formData.get("header_row") as string | null;
  const rawLastRow = formData.get("last_row") as string | null;
  const userHeaderRow = rawHeaderRow ? parseInt(rawHeaderRow, 10) : null;
  const userLastRow = rawLastRow ? parseInt(rawLastRow, 10) : null;

  if (!file || !customerId || !gmpId) {
    return NextResponse.json(
      { error: "Missing required fields: file, customer_id, gmp_id" },
      { status: 400 }
    );
  }

  const { data: customer } = await admin
    .from("customers")
    .select("code, bom_config")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const bomConfig = (customer.bom_config as BomConfig) ?? { columns: "auto_detect" };

  // Fetch GMP record for auto-PCB fallback (board name / GMP number)
  const { data: gmp } = await admin
    .from("gmps")
    .select("gmp_number, board_name")
    .eq("id", gmpId)
    .single();

  try {
    const buffer = await file.arrayBuffer();
    const fileName = file.name;
    const fileExt = fileName.split(".").pop()?.toLowerCase() ?? "";

    // Determine if this is a CSV file (by config or extension)
    const isCsv =
      bomConfig.format === "csv" ||
      fileExt === "csv" ||
      fileExt === "tsv";

    let allRows: (string | number | null)[][];

    if (isCsv) {
      // --- CSV/TSV path: decode with configured encoding, split with configured separator ---
      const encoding = bomConfig.encoding ?? "utf-8";
      const separator = bomConfig.separator === "\\t" || bomConfig.separator === "\t" ? "\t" : (bomConfig.separator ?? ",");
      const text = decodeBuffer(buffer, encoding);
      allRows = parseCsvText(text, separator);
    } else {
      // --- Excel path: use SheetJS ---
      const workbook = XLSX.read(buffer, { type: "array" });
      const requestedSheet = (formData.get("sheet_name") as string | null)?.trim();
      // Honor the sheet the client picked in the column mapper. Workbooks
      // with cover/notes pages on sheet 0 (Cevians-style) need this — the
      // client maps against sheet 2/3, server has to parse the same one or
      // header_row + column_mapping refer to rows that don't exist.
      const sheetName =
        requestedSheet && workbook.SheetNames.includes(requestedSheet)
          ? requestedSheet
          : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // defval:"" fills empty cells so rows are dense — matches the client
      // and keeps downstream string ops safe.
      allRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Trim rows to the user's last-row boundary (1-indexed â†’ 0-indexed, inclusive)
    if (userLastRow && userLastRow > 0 && userLastRow < allRows.length) {
      allRows = allRows.slice(0, userLastRow);
    }

    // Determine header row and data start.
    // Priority: user-provided header_row > bom_config > auto-detect
    let headers: string[];
    let dataStartIndex: number;

    if (userHeaderRow && userHeaderRow >= 1 && userHeaderRow <= allRows.length) {
      // User explicitly chose the header row in the column mapper UI (1-indexed)
      const idx = userHeaderRow - 1;
      headers = allRows[idx].map((h) => String(h ?? ""));
      dataStartIndex = idx + 1;
    } else if (bomConfig.header_none || bomConfig.columns_fixed) {
      // No header row (e.g. Lanka) â€” columns_fixed defines the field order
      // Use generic column names as "headers" for the RawRow keys
      const maxCols = Math.max(...allRows.map((r) => r.length));
      headers = Array.from({ length: maxCols }, (_, i) => `col_${i}`);
      dataStartIndex = 0;
    } else if (bomConfig.forced_columns) {
      // Forced column override (ISC 2100-0142) â€” use forced names as headers
      headers = bomConfig.forced_columns;
      dataStartIndex = 1; // skip whatever row 0 is (it's the real header, but we override it)
    } else if (bomConfig.header_row !== null && bomConfig.header_row !== undefined) {
      // Explicit header row index
      const headerRowIndex = bomConfig.header_row;
      if (allRows.length <= headerRowIndex) {
        return NextResponse.json({ error: "header_row exceeds file length" }, { status: 400 });
      }
      headers = allRows[headerRowIndex].map((h) => String(h ?? ""));
      dataStartIndex = headerRowIndex + 1;
    } else {
      // Auto-scan: try rows 0-30 to find the one with recognizable column headers
      const knownHeaders = [
        "qty", "quantity", "designator", "mpn", "manufacturer part number",
        "description", "reference", "part number", "manufacturer", "value",
        "ref des", "refdes", "manufacturer part", "qtÃ©", "position sur circuit",
        "# manufacturier", "partnumber", "manufacturer p/n", "p/n", "part no",
        "mfg", "mfr", "comment", "component", "count", "amount", "vendor",
        "part #", "part#", "pn", "item", "spec", "mfg part", "mfr part",
      ];
      let foundRow = -1;
      let bestMatchCount = 0;
      // First pass: find the row with the MOST keyword matches
      for (let i = 0; i < Math.min(allRows.length, 30); i++) {
        const rowStrs = (allRows[i] ?? []).map((c) => String(c ?? "").toLowerCase().trim()).filter(Boolean);
        // Skip rows with mostly numbers (these are data rows, not headers)
        const textCells = rowStrs.filter((s) => isNaN(Number(s)) && s.length > 1);
        if (textCells.length < 2) continue;
        const matches = rowStrs.filter((s) => knownHeaders.some((kw) => s.includes(kw)));
        if (matches.length > bestMatchCount) {
          bestMatchCount = matches.length;
          foundRow = i;
        }
      }
      if (foundRow >= 0) {
        headers = allRows[foundRow].map((h) => String(h ?? ""));
        dataStartIndex = foundRow + 1;
      } else {
        // Fallback: use row 0
        headers = allRows[0].map((h) => String(h ?? ""));
        dataStartIndex = 1;
      }
    }

    // Convert to RawRow objects
    const rawRows: RawRow[] = allRows.slice(dataStartIndex).map((row) => {
      const obj: RawRow = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      return obj;
    });

    // Resolve column mapping. Priority:
    //   0. User-provided mapping from the UI column mapper (highest priority)
    //   1. Customer bom_config (explicit) or keyword auto-detect
    //   2. AI fallback â€” Claude reads headers + sample rows and proposes a mapping
    //   3. Hard fail with helpful error
    let mapping: ColumnMapping | null = null;
    let mappingSource: "keyword" | "ai" | "user" = "keyword";

    if (userColumnMapping && Object.keys(userColumnMapping).length >= 2) {
      // User explicitly mapped columns in the UI â€” use their mapping directly.
      // The mapping is { field: headerName }, need to convert to ColumnMapping
      // which is { field: columnIndex }.
      const m: Partial<ColumnMapping> = {};
      for (const [field, headerName] of Object.entries(userColumnMapping)) {
        const idx = headers.findIndex(
          (h) => h.toLowerCase().trim() === headerName.toLowerCase().trim()
        );
        if (idx !== -1) {
          (m as Record<string, number>)[field] = idx;
        }
      }
      if (m.mpn !== undefined || m.description !== undefined) {
        mapping = m as ColumnMapping;
        mappingSource = "user";
      }
    }

    if (!mapping) {
      try {
        mapping = resolveColumnMapping(bomConfig, headers);
      } catch {
        // Keyword matching failed â€” try the AI mapper
        const sampleRows = allRows.slice(dataStartIndex, dataStartIndex + 5);
        const aiMapping = await aiMapColumns(headers, sampleRows);
        if (aiMapping) {
          mapping = aiMapping;
          mappingSource = "ai";
        }
      }
    }

    if (!mapping) {
      const detectedHeaders = headers.filter((h) => h && h.trim()).slice(0, 15);
      return NextResponse.json({
        error: `Could not detect BOM columns, even with AI fallback. Detected columns: [${detectedHeaders.join(", ")}]. Configure the customer's BOM settings (Settings â†’ Customers â†’ Edit â†’ BOM Config) with explicit column mappings.`,
        detected_headers: detectedHeaders,
        suggestion: "Set bom_config on the customer with explicit column mappings, e.g.: {\"columns\": {\"qty\": \"Your Qty Column\", \"mpn\": \"Your Part Number Column\", \"designator\": \"Your Ref Des Column\"}}",
      }, { status: 400 });
    }

    // Bind alternate MPN / Manufacturer columns. User picks from the UI
    // Column Mapper take precedence; otherwise fall back to
    // customers.bom_config.alt_mpn_columns and finally auto-detect.
    if (userAltMpnColumns && userAltMpnColumns.length > 0) {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      mapping.alt_mpns = userAltMpnColumns
        .map((col) => normalized.indexOf(col.toLowerCase().trim()))
        .filter((idx) => idx !== -1);
    }
    if (userAltMfrColumns && userAltMfrColumns.length > 0) {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      mapping.alt_manufacturers = userAltMfrColumns
        .map((col) => normalized.indexOf(col.toLowerCase().trim()))
        .filter((idx) => idx !== -1);
    }
    // If user didn't pick, use customer config / auto-detect.
    if (!mapping.alt_mpns || !mapping.alt_manufacturers) {
      mapping = attachAlternateColumns(bomConfig, headers, mapping);
    }
    const parseResult = parseBom(
      rawRows,
      mapping,
      headers,
      bomConfig,
      fileName,
      gmp ? { gmp_number: gmp.gmp_number, board_name: gmp.board_name } : undefined
    );

    // Upload file to Supabase Storage (admin bypasses RLS)
    const filePath = `${customer.code}/${gmpId}/${fileName}`;
    const fileBuffer = new Uint8Array(buffer);
    const { error: uploadError } = await admin.storage.from("boms").upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (uploadError) {
      console.error("[BOM UPLOAD] Storage error:", uploadError);
      return NextResponse.json({ error: "File upload failed", details: uploadError.message }, { status: 500 });
    }

    // Create BOM record (admin bypasses RLS).
    // Board-level details (boards_per_panel, board_side, ipc_class,
    // solder_type) live on the GMP now, not the BOM, so we don't seed them
    // here â€” every BOM under a given GMP shares the same physical board.
    const { data: bom, error: bomError } = await admin
      .from("boms")
      .insert({
        gmp_id: gmpId,
        customer_id: customerId,
        file_name: fileName,
        file_path: filePath,
        file_hash: `${file.size}-${fileName}`,
        revision,
        bom_name: bomName || fileName,
        gerber_name: gerberName,
        gerber_revision: gerberRevision,
        status: "parsing",
        created_by: user.id,
      })
      .select()
      .single();

    if (bomError || !bom) {
      return NextResponse.json(
        { error: "Failed to create BOM record", details: bomError?.message },
        { status: 500 }
      );
    }

    // Build bom_lines rows â€” RAW parsed data only, NO classification.
    // M-code assignment happens later as an explicit user action after merge.
    const bomLines = parseResult.lines.map((line) => ({
      bom_id: bom.id,
      line_number: line.line_number,
      quantity: line.quantity,
      reference_designator: line.reference_designator,
      cpc: line.cpc,
      description: line.description,
      mpn: line.mpn,
      manufacturer: line.manufacturer,
      is_pcb: line.is_pcb,
      is_dni: line.is_dni,
      m_code: null,
      m_code_confidence: null,
      m_code_source: null,
    }));

    // Prepend PCB row if found
    if (parseResult.pcb_row) {
      bomLines.unshift({
        bom_id: bom.id,
        line_number: 0,
        quantity: parseResult.pcb_row.quantity,
        reference_designator: parseResult.pcb_row.reference_designator,
        cpc: parseResult.pcb_row.cpc,
        description: parseResult.pcb_row.description,
        mpn: parseResult.pcb_row.mpn,
        manufacturer: parseResult.pcb_row.manufacturer,
        is_pcb: true,
        is_dni: false,
        m_code: null,
        m_code_confidence: null,
        m_code_source: null,
      });
    }

    const { data: insertedLines, error: linesError } = await admin
      .from("bom_lines")
      .insert(bomLines)
      .select("id, line_number");
    if (linesError) {
      return NextResponse.json(
        { error: "Failed to insert BOM lines", details: linesError.message },
        { status: 500 }
      );
    }

    // Auto-create synthetic PCB line when the parser found no PCB row AND the
    // uploader supplied a gerber_name. Keeps every BOM guaranteed-PCB'd for
    // downstream pricing/production. Idempotent: only fires when no live
    // is_pcb row exists, so a re-parse after operator delete won't resurrect.
    if (!parseResult.pcb_row && gerberName) {
      const { data: existingPcb } = await admin
        .from("bom_lines")
        .select("id")
        .eq("bom_id", bom.id)
        .eq("is_pcb", true)
        .limit(1);
      if (!existingPcb || existingPcb.length === 0) {
        const minLineNumber = insertedLines && insertedLines.length > 0
          ? Math.min(...insertedLines.map((l) => l.line_number))
          : 1;
        const pcbLineNumber = minLineNumber - 1;
        const pcbDescription = gerberRevision
          ? `${gerberName} (PCB, Rev ${gerberRevision})`
          : `${gerberName} (PCB)`;
        await admin.from("bom_lines").insert({
          bom_id: bom.id,
          line_number: pcbLineNumber,
          quantity: 1,
          reference_designator: "PCB",
          cpc: gerberName,
          description: pcbDescription,
          mpn: gerberName,
          manufacturer: null,
          is_pcb: true,
          is_dni: false,
          m_code: "APCB",
          m_code_source: "auto",
          m_code_confidence: 1.0,
        });
      }
    }

    // Persist customer-supplied alternates captured during parsing. We write
    // rank=0 as the primary MPN mirror so the pricing fetch loop can iterate a
    // single list without special-casing the primary column. rank=1..N hold
    // the alternates in the order the customer listed them.
    if (insertedLines && insertedLines.length > 0) {
      const byLineNumber = new Map(
        insertedLines.map((r) => [r.line_number, r.id])
      );
      type AltInsert = {
        bom_line_id: string;
        mpn: string;
        manufacturer: string | null;
        source: "customer" | "rs_alt" | "operator";
        rank: number;
        notes?: string | null;
      };
      const altRows: AltInsert[] = [];
      // Track per-line: primary MPN, customer-supplied MPN set, and next rank
      // so we can cleanly append cross-BOM historical alternates afterwards.
      const lineMeta = new Map<
        string,
        { cpc: string | null; primaryMpn: string | null; mpnSet: Set<string>; nextRank: number }
      >();
      for (const line of parseResult.lines) {
        const bomLineId = byLineNumber.get(line.line_number);
        if (!bomLineId) continue;
        const meta = {
          cpc: line.cpc || null,
          primaryMpn: line.mpn ? line.mpn.toUpperCase() : null,
          mpnSet: new Set<string>(),
          nextRank: 0,
        };
        if (line.mpn) {
          altRows.push({
            bom_line_id: bomLineId,
            mpn: line.mpn,
            manufacturer: line.manufacturer || null,
            source: "customer",
            rank: 0,
          });
          meta.mpnSet.add(line.mpn.toUpperCase());
          meta.nextRank = 1;
        }
        if (line.alternates && line.alternates.length > 0) {
          line.alternates.forEach((alt, i) => {
            altRows.push({
              bom_line_id: bomLineId,
              mpn: alt.mpn,
              manufacturer: alt.manufacturer || null,
              source: "customer",
              rank: i + 1,
            });
            meta.mpnSet.add(alt.mpn.toUpperCase());
            meta.nextRank = Math.max(meta.nextRank, i + 2);
          });
        }
        lineMeta.set(bomLineId, meta);
      }

      // Cross-BOM learning loop: look up alternates from PRIOR bom_lines that
      // share a CPC with any of our new lines, and seed them onto this BOM.
      // We always label propagated rows as `rs_alt` (not `customer`) because
      // they originate from RS's accumulated history of this CPC, not the
      // current customer's BOM â€” even if they were `customer` on a prior BOM.
      const cpcs = Array.from(
        new Set(
          Array.from(lineMeta.values())
            .map((m) => m.cpc)
            .filter((c): c is string => !!c && c.trim().length > 0)
        )
      );
      let propagatedRows = 0;
      const propagatedLines = new Set<string>();
      if (cpcs.length > 0) {
        try {
          const { data: historical, error: histErr } = await admin
            .from("bom_line_alternates")
            .select(
              "mpn, manufacturer, source, notes, created_at, bom_lines!inner(cpc, bom_id)"
            )
            .in("bom_lines.cpc", cpcs)
            .neq("bom_lines.bom_id", bom.id)
            .order("created_at", { ascending: false });
          if (histErr) {
            console.warn(
              "[bom/parse] CPC propagation lookup failed:",
              histErr.message
            );
          } else if (historical && historical.length > 0) {
            // Group by CPC, dedupe by upper(mpn) keeping the most recent (first
            // seen, since we sorted DESC).
            type HistRow = {
              mpn: string;
              manufacturer: string | null;
              source: string;
              notes: string | null;
            };
            const byCpc = new Map<string, Map<string, HistRow>>();
            for (const row of historical as Array<{
              mpn: string;
              manufacturer: string | null;
              source: string;
              notes: string | null;
              bom_lines: { cpc: string | null } | { cpc: string | null }[];
            }>) {
              const bl = Array.isArray(row.bom_lines)
                ? row.bom_lines[0]
                : row.bom_lines;
              const cpc = bl?.cpc;
              if (!cpc || !row.mpn) continue;
              const key = row.mpn.toUpperCase();
              if (!byCpc.has(cpc)) byCpc.set(cpc, new Map());
              const m = byCpc.get(cpc)!;
              if (!m.has(key)) {
                m.set(key, {
                  mpn: row.mpn,
                  manufacturer: row.manufacturer,
                  source: row.source,
                  notes: row.notes,
                });
              }
            }

            for (const [bomLineId, meta] of lineMeta.entries()) {
              if (!meta.cpc) continue;
              const hist = byCpc.get(meta.cpc);
              if (!hist || hist.size === 0) continue;
              let added = 0;
              for (const [upperMpn, row] of hist.entries()) {
                if (meta.primaryMpn && upperMpn === meta.primaryMpn) continue;
                if (meta.mpnSet.has(upperMpn)) continue;
                altRows.push({
                  bom_line_id: bomLineId,
                  mpn: row.mpn,
                  manufacturer: row.manufacturer,
                  source: "rs_alt",
                  rank: meta.nextRank++,
                  notes: row.notes,
                });
                meta.mpnSet.add(upperMpn);
                added++;
                propagatedRows++;
              }
              if (added > 0) propagatedLines.add(bomLineId);
            }
          }
        } catch (e) {
          console.warn(
            "[bom/parse] CPC propagation threw:",
            e instanceof Error ? e.message : String(e)
          );
        }
      }
      console.info(
        `[bom/parse] CPC propagation: seeded ${propagatedRows} rs_alt rows across ${propagatedLines.size} lines from ${cpcs.length} historical CPCs`
      );

      // Final safety dedupe per (bom_line_id, mpn) to respect UNIQUE constraint.
      const seen = new Set<string>();
      const dedupedAltRows: AltInsert[] = [];
      for (const r of altRows) {
        const k = `${r.bom_line_id}|${r.mpn.toUpperCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        dedupedAltRows.push(r);
      }
      altRows.length = 0;
      altRows.push(...dedupedAltRows);

      if (altRows.length > 0) {
        const { error: altErr } = await admin
          .from("bom_line_alternates")
          .insert(altRows);
        if (altErr) {
          // Non-fatal: the BOM is still usable with only the primary MPN.
          // Log via parse_result so it surfaces on the BOM detail page.
          console.error("[bom/parse] alternates insert failed", altErr.message);
        }
      }
    }

    // Update BOM to parsed
    await admin
      .from("boms")
      .update({
        status: "parsed",
        component_count: parseResult.lines.length,
        parse_result: {
          stats: parseResult.stats,
          mapping_source: mappingSource,
          log_summary: {
            total_log_entries: parseResult.log.length,
            auto_pcb: parseResult.stats.auto_pcb,
          },
        },
      })
      .eq("id", bom.id);

    // Procurement-log write â€” for every parsed BOM line with a CPC, upsert
    // into customer_parts so the per-customer procurement history grows with
    // each upload. Only writes columns derived from the BOM itself; curated
    // columns (mpn_to_use, digikey_pn, m_code_manual, notesâ€¦) are left
    // untouched by DO NOTHING on conflict so we never clobber operator edits.
    try {
      const procRows: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      const nowIso = new Date().toISOString();
      for (const line of parseResult.lines) {
        const cpc = (line.cpc ?? "").trim();
        if (!cpc) continue;
        const key = `${customerId}|${cpc.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        procRows.push({
          customer_id: customerId,
          cpc,
          original_mpn: line.mpn ?? null,
          original_manufacturer: line.manufacturer ?? null,
          last_seen_at: nowIso,
        });
      }
      if (procRows.length > 0) {
        // ignoreDuplicates keeps operator-curated fields (mpn_to_use,
        // digikey_pn, m_code_manual, notes, â€¦) intact â€” we only insert rows
        // that don't yet exist. A separate update then bumps last_seen_at on
        // rows that already existed.
        await admin
          .from("customer_parts")
          .upsert(procRows, { onConflict: "customer_id,cpc", ignoreDuplicates: true });
        const cpcs = procRows.map((r) => r.cpc as string);
        await admin
          .from("customer_parts")
          .update({ last_seen_at: nowIso })
          .eq("customer_id", customerId)
          .in("cpc", cpcs);
      }
    } catch (err) {
      console.warn("[BOM PARSE] customer_parts upsert failed:", err);
    }

    // Wave 1 â€” remember this customer's mapping for next time. If the user
    // touched the Column Mapper (userColumnMapping is non-null) we persist
    // their choices onto customers.bom_config so the next upload for the
    // same customer pre-fills without them having to redo the mapping.
    // header_row is stored 0-indexed to match the existing BomConfig shape.
    if (userColumnMapping && Object.keys(userColumnMapping).length > 0) {
      const nextConfig: Record<string, unknown> = {
        ...(customer.bom_config as Record<string, unknown> ?? {}),
        columns: userColumnMapping,
      };
      if (userHeaderRow && userHeaderRow >= 1) {
        nextConfig.header_row = userHeaderRow - 1;
      }
      if (userAltMpnColumns) nextConfig.alt_mpn_columns = userAltMpnColumns;
      if (userAltMfrColumns) nextConfig.alt_manufacturer_columns = userAltMfrColumns;
      // Best-effort â€” don't fail the upload if this write errors.
      await admin
        .from("customers")
        .update({ bom_config: nextConfig })
        .eq("id", customerId);
    }

    return NextResponse.json({
      bom_id: bom.id,
      file_name: fileName,
      stats: parseResult.stats,
      component_count: parseResult.lines.length,
      pcb_found: parseResult.pcb_row !== null,
      pcb_auto: parseResult.stats.auto_pcb,
      mapping_source: mappingSource,
      log_entries: parseResult.log.length,
    });
  } catch (err) {
    console.error("[BOM PARSE] Error:", err);
    return NextResponse.json(
      {
        error: "Parse failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
