import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { parseBom, naturalSort } from "@/lib/bom/parser";
import { resolveColumnMapping, attachAlternateColumns } from "@/lib/bom/column-mapper";
import { aiMapColumns } from "@/lib/bom/ai-column-mapper";
import type {
  BomConfig,
  ColumnMapping,
  ParseResult,
  RawRow,
} from "@/lib/bom/types";
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
        i++;
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
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  current.push(field);
  if (current.some((c) => c.trim())) rows.push(current);
  return rows;
}

function decodeBuffer(buffer: ArrayBuffer, encoding: string = "utf-8"): string {
  const norm = encoding.toLowerCase().replace(/[_-]/g, "");
  if (norm === "utf16" || norm === "utf16le" || norm === "utf16be") {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (norm === "latin1" || norm === "iso88591") {
    return new TextDecoder("latin1").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Parse one uploaded file into a ParseResult + column mapping. Pure: does
 * NOT touch the database or storage. Called once per file in the multi-file
 * upload loop so each file gets its own mapping resolution while sharing
 * the BOM record they'll all be inserted into.
 */
async function parseOneFile(opts: {
  file: File;
  bomConfig: BomConfig;
  userColumnMapping: Record<string, string> | null;
  userAltMpnColumns: string[] | null;
  userAltMfrColumns: string[] | null;
  userHeaderRow: number | null;
  userLastRow: number | null;
  requestedSheet: string | null;
  gmpInfo: { gmp_number: string; board_name: string | null } | undefined;
}): Promise<
  | {
      ok: true;
      buffer: ArrayBuffer;
      fileName: string;
      parseResult: ParseResult;
      mapping: ColumnMapping;
      mappingSource: "user" | "keyword" | "ai";
      headers: string[];
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const {
    file,
    bomConfig,
    userColumnMapping,
    userAltMpnColumns,
    userAltMfrColumns,
    userHeaderRow,
    userLastRow,
    requestedSheet,
    gmpInfo,
  } = opts;

  const buffer = await file.arrayBuffer();
  const fileName = file.name;
  const fileExt = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isCsv =
    bomConfig.format === "csv" || fileExt === "csv" || fileExt === "tsv";

  let allRows: (string | number | null)[][];
  if (isCsv) {
    const encoding = bomConfig.encoding ?? "utf-8";
    const separator =
      bomConfig.separator === "\\t" || bomConfig.separator === "\t"
        ? "\t"
        : bomConfig.separator ?? ",";
    const text = decodeBuffer(buffer, encoding);
    allRows = parseCsvText(text, separator);
  } else {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName =
      requestedSheet && workbook.SheetNames.includes(requestedSheet)
        ? requestedSheet
        : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    allRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
  }

  if (allRows.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: `File is empty: ${fileName}` },
    };
  }

  if (userLastRow && userLastRow > 0 && userLastRow < allRows.length) {
    allRows = allRows.slice(0, userLastRow);
  }

  let headers: string[];
  let dataStartIndex: number;
  if (userHeaderRow && userHeaderRow >= 1 && userHeaderRow <= allRows.length) {
    const idx = userHeaderRow - 1;
    headers = allRows[idx].map((h) => String(h ?? ""));
    dataStartIndex = idx + 1;
  } else if (bomConfig.header_none || bomConfig.columns_fixed) {
    const maxCols = Math.max(...allRows.map((r) => r.length));
    headers = Array.from({ length: maxCols }, (_, i) => `col_${i}`);
    dataStartIndex = 0;
  } else if (bomConfig.forced_columns) {
    headers = bomConfig.forced_columns;
    dataStartIndex = 1;
  } else if (
    bomConfig.header_row !== null &&
    bomConfig.header_row !== undefined
  ) {
    const headerRowIndex = bomConfig.header_row;
    if (allRows.length <= headerRowIndex) {
      return {
        ok: false,
        status: 400,
        body: { error: `header_row exceeds file length: ${fileName}` },
      };
    }
    headers = allRows[headerRowIndex].map((h) => String(h ?? ""));
    dataStartIndex = headerRowIndex + 1;
  } else {
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
    for (let i = 0; i < Math.min(allRows.length, 30); i++) {
      const rowStrs = (allRows[i] ?? [])
        .map((c) => String(c ?? "").toLowerCase().trim())
        .filter(Boolean);
      const textCells = rowStrs.filter(
        (s) => isNaN(Number(s)) && s.length > 1
      );
      if (textCells.length < 2) continue;
      const matches = rowStrs.filter((s) =>
        knownHeaders.some((kw) => s.includes(kw))
      );
      if (matches.length > bestMatchCount) {
        bestMatchCount = matches.length;
        foundRow = i;
      }
    }
    if (foundRow >= 0) {
      headers = allRows[foundRow].map((h) => String(h ?? ""));
      dataStartIndex = foundRow + 1;
    } else {
      headers = allRows[0].map((h) => String(h ?? ""));
      dataStartIndex = 1;
    }
  }

  const rawRows: RawRow[] = allRows.slice(dataStartIndex).map((row) => {
    const obj: RawRow = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] ?? null;
    });
    return obj;
  });

  let mapping: ColumnMapping | null = null;
  let mappingSource: "user" | "keyword" | "ai" = "keyword";

  if (userColumnMapping && Object.keys(userColumnMapping).length >= 2) {
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
    return {
      ok: false,
      status: 400,
      body: {
        error: `Could not detect BOM columns in "${fileName}", even with AI fallback. Detected columns: [${detectedHeaders.join(", ")}].`,
        detected_headers: detectedHeaders,
      },
    };
  }

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
  if (!mapping.alt_mpns || !mapping.alt_manufacturers) {
    mapping = attachAlternateColumns(bomConfig, headers, mapping);
  }

  const parseResult = parseBom(rawRows, mapping, headers, bomConfig, fileName, gmpInfo);
  return { ok: true, buffer, fileName, parseResult, mapping, mappingSource, headers };
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

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const formData = await request.formData();
  const customerId = formData.get("customer_id") as string;
  const gmpId = formData.get("gmp_id") as string;
  const revisionInput = ((formData.get("revision") as string) ?? "").trim();
  const revision = revisionInput || "1";

  // Multi-file extraction. The form sends `files[i]` + `sections[i]` parallel
  // arrays so an operator can upload SMT + TH (or any number of files) in a
  // single request — the route writes every line into one boms row.
  // Back-compat: a single `file` + `bom_section` is still accepted.
  const allowedSections = new Set(["full", "smt", "th", "other"]);
  const uploads: Array<{ file: File; section: string }> = [];

  const single = formData.get("file");
  if (single instanceof File) {
    const sRaw = ((formData.get("bom_section") as string) ?? "full")
      .toLowerCase()
      .trim();
    uploads.push({
      file: single,
      section: allowedSections.has(sRaw) ? sRaw : "full",
    });
  }
  for (let i = 0; ; i++) {
    const f = formData.get(`files[${i}]`);
    if (!(f instanceof File)) break;
    const sRaw = ((formData.get(`sections[${i}]`) as string) ?? "full")
      .toLowerCase()
      .trim();
    uploads.push({
      file: f as File,
      section: allowedSections.has(sRaw) ? sRaw : "full",
    });
  }

  if (uploads.length === 0 || !customerId || !gmpId) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: customer_id, gmp_id, and at least one file",
      },
      { status: 400 }
    );
  }

  // Optional UI fields. Each comes in two forms:
  //   • Whole-BOM (back-compat): `column_mapping`, `header_row`, etc.
  //   • Per-file (multi-template): `column_mappings[i]`, `header_rows[i]`,
  //     etc. Resolved independently for each file so SMT + TH halves with
  //     different column layouts can both be mapped correctly.
  const parseObj = (raw: string | null): Record<string, string> | null => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, string>)
        : null;
    } catch {
      return null;
    }
  };
  const parseJsonArray = (raw: string | null): string[] | null => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : null;
    } catch {
      return null;
    }
  };

  const sharedColumnMapping = parseObj(
    formData.get("column_mapping") as string | null
  );
  const sharedAltMpn = parseJsonArray(
    formData.get("alt_mpn_columns") as string | null
  );
  const sharedAltMfr = parseJsonArray(
    formData.get("alt_manufacturer_columns") as string | null
  );
  const sharedHeaderRow = (() => {
    const v = formData.get("header_row") as string | null;
    return v ? parseInt(v, 10) : null;
  })();
  const sharedLastRow = (() => {
    const v = formData.get("last_row") as string | null;
    return v ? parseInt(v, 10) : null;
  })();
  const sharedSheet =
    (formData.get("sheet_name") as string | null)?.trim() ?? null;

  // Per-file override resolvers. Fall back to the shared value when the
  // operator didn't set anything for this specific file in the UI.
  const perFileMapping = (i: number): Record<string, string> | null =>
    parseObj(formData.get(`column_mappings[${i}]`) as string | null) ??
    sharedColumnMapping;
  const perFileAltMpn = (i: number): string[] | null =>
    parseJsonArray(formData.get(`alt_mpn_columns[${i}]`) as string | null) ??
    sharedAltMpn;
  const perFileAltMfr = (i: number): string[] | null =>
    parseJsonArray(
      formData.get(`alt_manufacturer_columns[${i}]`) as string | null
    ) ?? sharedAltMfr;
  const perFileHeaderRow = (i: number): number | null => {
    const v = formData.get(`header_rows[${i}]`) as string | null;
    return v ? parseInt(v, 10) : sharedHeaderRow;
  };
  const perFileLastRow = (i: number): number | null => {
    const v = formData.get(`last_rows[${i}]`) as string | null;
    return v ? parseInt(v, 10) : sharedLastRow;
  };
  const perFileSheet = (i: number): string | null =>
    ((formData.get(`sheet_names[${i}]`) as string | null) ?? sharedSheet)?.trim() ??
    null;

  const bomName = ((formData.get("bom_name") as string) ?? "").trim() || null;
  const gerberName = ((formData.get("gerber_name") as string) ?? "").trim() || null;
  const gerberRevision =
    ((formData.get("gerber_revision") as string) ?? "").trim() || null;

  const { data: customer } = await admin
    .from("customers")
    .select("code, bom_config")
    .eq("id", customerId)
    .single();
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const bomConfig =
    (customer.bom_config as BomConfig) ?? { columns: "auto_detect" };

  const { data: gmp } = await admin
    .from("gmps")
    .select("gmp_number, board_name")
    .eq("id", gmpId)
    .single();
  const gmpInfo = gmp
    ? { gmp_number: gmp.gmp_number, board_name: gmp.board_name }
    : undefined;

  try {
    // ---- Per-file parse pass ----
    // Each file resolves its own column mapping (starting from the shared
    // userColumnMapping if provided). Single-template uploads (SMT + TH from
    // the same customer) match on the first try; if a second file has wildly
    // different headers it falls through to the customer's bom_config / AI
    // fallback like a standalone upload would.
    type ParsedFile = {
      buffer: ArrayBuffer;
      fileName: string;
      filePath: string;
      section: string;
      parseResult: ParseResult;
      mappingSource: "user" | "keyword" | "ai";
    };
    const parsedFiles: ParsedFile[] = [];

    for (let i = 0; i < uploads.length; i++) {
      const u = uploads[i];
      const result = await parseOneFile({
        file: u.file,
        bomConfig,
        userColumnMapping: perFileMapping(i),
        userAltMpnColumns: perFileAltMpn(i),
        userAltMfrColumns: perFileAltMfr(i),
        userHeaderRow: perFileHeaderRow(i),
        userLastRow: perFileLastRow(i),
        requestedSheet: perFileSheet(i),
        gmpInfo,
      });
      if (!result.ok) {
        return NextResponse.json(result.body, { status: result.status });
      }

      const filePath = `${customer.code}/${gmpId}/${result.fileName}`;
      const fileBuffer = new Uint8Array(result.buffer);
      const { error: uploadError } = await admin.storage
        .from("boms")
        .upload(filePath, fileBuffer, {
          contentType: u.file.type || "application/octet-stream",
          upsert: true,
        });
      if (uploadError) {
        console.error("[BOM UPLOAD] Storage error:", uploadError);
        return NextResponse.json(
          { error: "File upload failed", details: uploadError.message },
          { status: 500 }
        );
      }

      parsedFiles.push({
        buffer: result.buffer,
        fileName: result.fileName,
        filePath,
        section: u.section,
        parseResult: result.parseResult,
        mappingSource: result.mappingSource,
      });
    }

    // ---- One BOM record for the whole upload ----
    // file_name / file_path point at the first file (the canonical entry);
    // source_files JSONB lists every contributing file with its section + count.
    // bom_section is "full" when multiple files were uploaded, the single
    // file's section when only one was sent.
    const aggregateSection =
      parsedFiles.length === 1 ? parsedFiles[0].section : "full";
    const sourceFilesPayload =
      parsedFiles.length > 1
        ? parsedFiles.map((p) => ({
            file_name: p.fileName,
            file_path: p.filePath,
            section: p.section,
            component_count: p.parseResult.lines.length,
          }))
        : [];
    const totalSize = parsedFiles.reduce(
      (s, p) => s + p.buffer.byteLength,
      0
    );
    const fileHash = `${totalSize}-${parsedFiles.map((p) => p.fileName).join("|")}`;
    const displayName =
      bomName ||
      (parsedFiles.length === 1
        ? parsedFiles[0].fileName
        : `${parsedFiles[0].fileName} + ${parsedFiles.length - 1} more`);

    const { data: bom, error: bomError } = await admin
      .from("boms")
      .insert({
        gmp_id: gmpId,
        customer_id: customerId,
        file_name: parsedFiles[0].fileName,
        file_path: parsedFiles[0].filePath,
        file_hash: fileHash,
        revision,
        bom_name: displayName,
        gerber_name: gerberName,
        gerber_revision: gerberRevision,
        bom_section: aggregateSection,
        source_files: sourceFilesPayload,
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

    // ---- Build combined bom_lines across all files ----
    // PCB dedup: the physical board has exactly one PCB regardless of how
    // many BOM files describe its sides — keep the first PCB row found, drop
    // any others. Global line_number is assigned in upload order so the
    // sort-by-line_number on the BOM detail page keeps files visually grouped.
    type BuiltLine = {
      bom_id: string;
      line_number: number;
      quantity: number;
      reference_designator: string;
      cpc: string | null;
      description: string;
      mpn: string;
      manufacturer: string;
      is_pcb: boolean;
      is_dni: boolean;
      bom_section: string;
      // PCB rows get m_code=APCB seeded on insert so the field never sits at
      // null for a PCB and the m_code filter pills pick it up. Component
      // rows still come through with null and are classified later by the
      // AI / rules pipeline.
      m_code: string | null;
      m_code_confidence: number | null;
      m_code_source: string | null;
    };
    const allBomLines: BuiltLine[] = [];
    // For the alternates loop we need to map each parsed ParsedLine back to
    // the bom_line_id Supabase returns after insert. line_number is unique
    // across the combined set so we can key by that.
    type LookupRow = {
      section: string;
      line: ParseResult["lines"][number];
      globalLineNumber: number;
    };
    const alternateLineLookups: LookupRow[] = [];

    // Phase 1 — collect candidate rows from every parsed file WITHOUT
    // assigning final line_numbers yet. We sort the whole set across files
    // before numbering, so the merged BOM ends up globally ordered (PCB on
    // top, then qty DESC + designator A→Z for installed parts, then qty=0
    // rows pinned to the very bottom).
    type Candidate = {
      built: Omit<BuiltLine, "line_number">;
      parsedLine: ParseResult["lines"][number];
      section: string;
    };
    const candidates: Candidate[] = [];
    let pcbBuilt: BuiltLine | null = null;

    for (const p of parsedFiles) {
      if (p.parseResult.pcb_row && !pcbBuilt) {
        pcbBuilt = {
          bom_id: bom.id,
          line_number: 0,
          quantity: p.parseResult.pcb_row.quantity,
          reference_designator: p.parseResult.pcb_row.reference_designator,
          cpc: p.parseResult.pcb_row.cpc,
          description: p.parseResult.pcb_row.description,
          mpn: p.parseResult.pcb_row.mpn,
          manufacturer: p.parseResult.pcb_row.manufacturer,
          is_pcb: true,
          is_dni: false,
          bom_section: p.section,
          m_code: "APCB",
          m_code_confidence: 1.0,
          m_code_source: "auto",
        };
      }
      for (const line of p.parseResult.lines) {
        candidates.push({
          built: {
            bom_id: bom.id,
            quantity: line.quantity,
            reference_designator: line.reference_designator,
            cpc: line.cpc,
            description: line.description,
            mpn: line.mpn,
            manufacturer: line.manufacturer,
            is_pcb: line.is_pcb,
            is_dni: line.is_dni,
            bom_section: p.section,
            m_code: null,
            m_code_confidence: null,
            m_code_source: null,
          },
          parsedLine: line,
          section: p.section,
        });
      }
    }

    // Phase 2 — sort to match the operators' Excel convention:
    //   1. PCB on top (handled separately, not in this sort)
    //   2. qty=0 ("not installed") rows pushed to the bottom
    //   3. Within each bucket: designator A→Z primary, qty DESC tiebreaker
    //      ("Sort by Column B A-Z, then by Column A Largest-to-Smallest")
    candidates.sort((a, b) => {
      const aZero = a.built.quantity <= 0;
      const bZero = b.built.quantity <= 0;
      if (aZero !== bZero) return aZero ? 1 : -1;
      const desCmp = naturalSort(
        a.built.reference_designator ?? "",
        b.built.reference_designator ?? ""
      );
      if (desCmp !== 0) return desCmp;
      return b.built.quantity - a.built.quantity;
    });

    // Fallback synthetic PCB — if NO file contributed a PCB row and the
    // operator typed a gerber name, build one here so it can take line 1
    // alongside any other PCB-track logic, instead of having to shoehorn it
    // in with a post-insert renumber.
    if (!pcbBuilt && gerberName) {
      const pcbDescription = gerberRevision
        ? `${gerberName} (PCB, Rev ${gerberRevision})`
        : `${gerberName} (PCB)`;
      pcbBuilt = {
        bom_id: bom.id,
        line_number: 0,
        quantity: 1,
        reference_designator: "PCB",
        cpc: gerberName,
        description: pcbDescription,
        mpn: gerberName,
        manufacturer: "",
        is_pcb: true,
        is_dni: false,
        bom_section: aggregateSection,
        m_code: "APCB",
        m_code_confidence: 1.0,
        m_code_source: "auto",
      };
    }

    // Phase 3 — assign sequential line_numbers in sort order. PCB takes
    // line 1, then sorted candidates take 2..N. PCB is counted in the
    // BOM's component_count (it represents the physical board, which is a
    // billable part of the build).
    const pcbAdded = pcbBuilt !== null;
    let nextLineNumber = 1;
    if (pcbBuilt) {
      pcbBuilt.line_number = nextLineNumber++;
      allBomLines.push(pcbBuilt);
    }
    for (const c of candidates) {
      const ln = nextLineNumber++;
      allBomLines.push({ ...c.built, line_number: ln });
      alternateLineLookups.push({
        section: c.section,
        line: c.parsedLine,
        globalLineNumber: ln,
      });
    }

    const { data: insertedLines, error: linesError } = await admin
      .from("bom_lines")
      .insert(allBomLines)
      .select("id, line_number");
    if (linesError) {
      return NextResponse.json(
        { error: "Failed to insert BOM lines", details: linesError.message },
        { status: 500 }
      );
    }

    // (Synthetic PCB row, when needed, was built in Phase 1 alongside the
    // parsed PCB so it could take line 1 cleanly. Nothing to do here.)

    // ---- Alternates (customer-supplied + cross-BOM propagation) ----
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
      const lineMeta = new Map<
        string,
        {
          cpc: string | null;
          primaryMpn: string | null;
          mpnSet: Set<string>;
          nextRank: number;
        }
      >();
      for (const lookup of alternateLineLookups) {
        const bomLineId = byLineNumber.get(lookup.globalLineNumber);
        if (!bomLineId) continue;
        const line = lookup.line;
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

      // Cross-BOM learning loop — seed rs_alt rows from prior BOMs sharing
      // any CPC with this upload.
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

      const seen = new Set<string>();
      const deduped: AltInsert[] = [];
      for (const r of altRows) {
        const k = `${r.bom_line_id}|${r.mpn.toUpperCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(r);
      }

      if (deduped.length > 0) {
        const { error: altErr } = await admin
          .from("bom_line_alternates")
          .insert(deduped);
        if (altErr) {
          console.error("[bom/parse] alternates insert failed", altErr.message);
        }
      }
    }

    // ---- Final BOM update: aggregate stats across all source files ----
    // component_count includes the PCB row because it's a real billable
    // line on the board (operators see "162 components" with PCB counted).
    const totalLines =
      parsedFiles.reduce((s, p) => s + p.parseResult.lines.length, 0) +
      (pcbAdded ? 1 : 0);
    const totalLogEntries = parsedFiles.reduce(
      (s, p) => s + p.parseResult.log.length,
      0
    );
    const anyAutoPcb = parsedFiles.some((p) => p.parseResult.stats.auto_pcb);
    // Use the first file's mapping source as representative; the per-file
    // sources are preserved in source_files if anyone needs to audit which
    // file used the AI fallback later.
    const representativeMappingSource = parsedFiles[0].mappingSource;
    const aggregateStats = parsedFiles.reduce(
      (acc, p) => ({
        total_raw_rows: acc.total_raw_rows + p.parseResult.stats.total_raw_rows,
        included: acc.included + p.parseResult.stats.included,
        fiducials_skipped:
          acc.fiducials_skipped + p.parseResult.stats.fiducials_skipped,
        dni_skipped: acc.dni_skipped + p.parseResult.stats.dni_skipped,
        not_mounted_skipped:
          acc.not_mounted_skipped + p.parseResult.stats.not_mounted_skipped,
        merged: acc.merged + p.parseResult.stats.merged,
        section_headers_skipped:
          acc.section_headers_skipped +
          p.parseResult.stats.section_headers_skipped,
        auto_pcb: acc.auto_pcb || p.parseResult.stats.auto_pcb,
      }),
      {
        total_raw_rows: 0,
        included: 0,
        fiducials_skipped: 0,
        dni_skipped: 0,
        not_mounted_skipped: 0,
        merged: 0,
        section_headers_skipped: 0,
        auto_pcb: false,
      }
    );

    // Build the merge audit log. Each MERGED log entry carries the
    // per-file line_number it was merged into AND a full snapshot of the
    // SOURCE row (set by the parser before the merge mutated `existing`).
    // We remap merged_into to the final global line_number so the BOM
    // detail page can link directly to the surviving row, and pass through
    // every column of the source so production sees what got combined.
    type MergeLogEntry = {
      mpn: string;
      merged_into_line: number;
      file_name: string;
      source: {
        quantity: number;
        reference_designator: string;
        cpc: string | null;
        description: string;
        mpn: string;
        manufacturer: string;
      };
    };
    const mergeLog: MergeLogEntry[] = [];
    for (const p of parsedFiles) {
      for (const entry of p.parseResult.log) {
        if (entry.action !== "MERGED") continue;
        const localLine = p.parseResult.lines.find(
          (l) => l.line_number === entry.merged_into
        );
        if (!localLine) continue;
        const lookup = alternateLineLookups.find((l) => l.line === localLine);
        if (!lookup) continue;
        const mpnMatch = /^MPN (.+)$/.exec(entry.detail ?? "");
        const src = entry.merged_row;
        if (!src) continue;
        mergeLog.push({
          mpn: src.mpn || (mpnMatch?.[1] ?? ""),
          merged_into_line: lookup.globalLineNumber,
          file_name: p.fileName,
          source: {
            quantity: src.quantity,
            reference_designator: src.reference_designator,
            cpc: src.cpc,
            description: src.description,
            mpn: src.mpn,
            manufacturer: src.manufacturer,
          },
        });
      }
    }

    await admin
      .from("boms")
      .update({
        status: "parsed",
        component_count: totalLines,
        parse_result: {
          stats: aggregateStats,
          mapping_source: representativeMappingSource,
          log_summary: {
            total_log_entries: totalLogEntries,
            auto_pcb: anyAutoPcb,
          },
          merge_log: mergeLog,
          source_file_count: parsedFiles.length,
          per_file_mapping_sources: parsedFiles.map((p) => p.mappingSource),
        },
      })
      .eq("id", bom.id);

    // ---- customer_parts upsert (combined across all files) ----
    try {
      const procRows: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      const nowIso = new Date().toISOString();
      for (const p of parsedFiles) {
        for (const line of p.parseResult.lines) {
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
      }
      if (procRows.length > 0) {
        await admin
          .from("customer_parts")
          .upsert(procRows, {
            onConflict: "customer_id,cpc",
            ignoreDuplicates: true,
          });
        const allCpcs = procRows.map((r) => r.cpc as string);
        await admin
          .from("customer_parts")
          .update({ last_seen_at: nowIso })
          .eq("customer_id", customerId)
          .in("cpc", allCpcs);
      }
    } catch (err) {
      console.warn("[BOM PARSE] customer_parts upsert failed:", err);
    }

    // ---- Persist this customer's column mapping for next time ----
    // Use the primary file's mapping as the representative template. When
    // the operator uploaded different templates per file (rare) only the
    // first one's mapping gets cached on the customer; subsequent uploads
    // of the secondary template still trigger the column mapper, which is
    // the right behavior since they shouldn't overwrite each other.
    const primaryMapping = perFileMapping(0);
    const primaryHeaderRow = perFileHeaderRow(0);
    const primaryAltMpn = perFileAltMpn(0);
    const primaryAltMfr = perFileAltMfr(0);
    if (primaryMapping && Object.keys(primaryMapping).length > 0) {
      const nextConfig: Record<string, unknown> = {
        ...((customer.bom_config as Record<string, unknown>) ?? {}),
        columns: primaryMapping,
      };
      if (primaryHeaderRow && primaryHeaderRow >= 1) {
        nextConfig.header_row = primaryHeaderRow - 1;
      }
      if (primaryAltMpn) nextConfig.alt_mpn_columns = primaryAltMpn;
      if (primaryAltMfr)
        nextConfig.alt_manufacturer_columns = primaryAltMfr;
      await admin
        .from("customers")
        .update({ bom_config: nextConfig })
        .eq("id", customerId);
    }

    return NextResponse.json({
      bom_id: bom.id,
      file_name: parsedFiles[0].fileName,
      file_count: parsedFiles.length,
      stats: aggregateStats,
      component_count: totalLines,
      pcb_found: pcbAdded,
      pcb_auto: anyAutoPcb,
      mapping_source: representativeMappingSource,
      log_entries: totalLogEntries,
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
