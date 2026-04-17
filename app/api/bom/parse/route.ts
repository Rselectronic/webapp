import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { parseBom } from "@/lib/bom/parser";
import { resolveColumnMapping } from "@/lib/bom/column-mapper";
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
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Trim rows to the user's last-row boundary (1-indexed → 0-indexed, inclusive)
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
      // No header row (e.g. Lanka) — columns_fixed defines the field order
      // Use generic column names as "headers" for the RawRow keys
      const maxCols = Math.max(...allRows.map((r) => r.length));
      headers = Array.from({ length: maxCols }, (_, i) => `col_${i}`);
      dataStartIndex = 0;
    } else if (bomConfig.forced_columns) {
      // Forced column override (ISC 2100-0142) — use forced names as headers
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
        "ref des", "refdes", "manufacturer part", "qté", "position sur circuit",
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
    //   2. AI fallback — Claude reads headers + sample rows and proposes a mapping
    //   3. Hard fail with helpful error
    let mapping: ColumnMapping | null = null;
    let mappingSource: "keyword" | "ai" | "user" = "keyword";

    if (userColumnMapping && Object.keys(userColumnMapping).length >= 2) {
      // User explicitly mapped columns in the UI — use their mapping directly.
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
        // Keyword matching failed — try the AI mapper
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
        error: `Could not detect BOM columns, even with AI fallback. Detected columns: [${detectedHeaders.join(", ")}]. Configure the customer's BOM settings (Settings → Customers → Edit → BOM Config) with explicit column mappings.`,
        detected_headers: detectedHeaders,
        suggestion: "Set bom_config on the customer with explicit column mappings, e.g.: {\"columns\": {\"qty\": \"Your Qty Column\", \"mpn\": \"Your Part Number Column\", \"designator\": \"Your Ref Des Column\"}}",
      }, { status: 400 });
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

    // Create BOM record (admin bypasses RLS)
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

    // Build bom_lines rows — RAW parsed data only, NO classification.
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

    const { error: linesError } = await admin.from("bom_lines").insert(bomLines);
    if (linesError) {
      return NextResponse.json(
        { error: "Failed to insert BOM lines", details: linesError.message },
        { status: 500 }
      );
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
