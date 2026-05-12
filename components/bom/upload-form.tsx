"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ColumnMapping } from "./column-mapper";
import { SheetMapper } from "./sheet-mapper";
import * as XLSX from "xlsx";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Gmp {
  id: string;
  gmp_number: string;
  board_name: string | null;
}

interface UploadFormProps {
  customers: Customer[];
  /**
   * When the operator launched the form from a customer or GMP detail page,
   * we already know the customer (and possibly the GMP) — skip those
   * dropdowns and drop them at the file picker. Both fields stay locked
   * but a "Change" link reveals them in case they navigated by mistake.
   */
  prefilledCustomerId?: string | null;
  prefilledGmp?: {
    id: string;
    gmp_number: string;
    board_name: string | null;
    customer_id: string;
  } | null;
}

export function UploadForm({
  customers,
  prefilledCustomerId,
  prefilledGmp,
}: UploadFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  // Free-text customer search. Mirrors the GMP typeahead pattern: customerId
  // is the authoritative FK; customerInput is the text box the user sees.
  const [customerInput, setCustomerInput] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerWrapperRef = useRef<HTMLDivElement>(null);
  const [gmps, setGmps] = useState<Gmp[]>([]);
  const [gmpsLoading, setGmpsLoading] = useState(false);
  const [gmpId, setGmpId] = useState("");
  const [gmpInput, setGmpInput] = useState("");
  const [gmpDropdownOpen, setGmpDropdownOpen] = useState(false);
  const gmpWrapperRef = useRef<HTMLDivElement>(null);
  // Multi-file state. The first entry is the "primary" file used by the
  // column mapper preview; additional files are parsed by the server using
  // the same shared column mapping. Each file has its own bom_section tag
  // (full / smt / th / other) so a single upload can carry SMT + TH halves
  // of a split board.
  type BomSection = "full" | "smt" | "th" | "other";
  const [files, setFiles] = useState<File[]>([]);
  const [fileSections, setFileSections] = useState<BomSection[]>([]);
  // Derived: the primary file drives the column mapper preview. Anywhere
  // the form historically said `file` (the first selected file) still works.
  const file: File | null = files[0] ?? null;
  const [bomName, setBomName] = useState("");
  const [revision, setRevision] = useState("1");
  const [gerberName, setGerberName] = useState("");
  const [gerberRevision, setGerberRevision] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Column mapper preview state
  const [allFileRows, setAllFileRows] = useState<(string | number | null)[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  // Multi-sheet workbook handling. Most customers send single-sheet xlsx,
  // but some (Cevians, ISC variants) drop the BOM into sheet 2/3 with the
  // first sheet being a cover/notes page. We surface a sheet selector
  // whenever the workbook has more than one sheet.
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");
  // Cached parsed workbook so switching sheets doesn't re-parse the file.
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const fileExtRef = useRef<string>("");
  const previewErrorRef = useRef<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Headers the user has flagged as alternate MPN / Manufacturer columns via
  // the Column Mapper UI. Kept separate from `columnMapping` (single-value)
  // so the primary-field dropdowns don't have to deal with arrays.
  const [altMpnHeaders, setAltMpnHeaders] = useState<string[]>([]);
  const [altMfrHeaders, setAltMfrHeaders] = useState<string[]>([]);
  const [showMapper, setShowMapper] = useState(false);
  // 1-indexed row numbers for the user
  const [headerRow, setHeaderRow] = useState(1);
  const [lastRow, setLastRow] = useState(1);
  // Cached customer BOM config — when set, its mapping pre-applies to the
  // next file load for this customer so the operator doesn't redo the work.
  const [customerBomConfig, setCustomerBomConfig] = useState<{
    columns?: Record<string, string>;
    header_row?: number | null;
    alt_mpn_columns?: string[];
    alt_manufacturer_columns?: string[];
  } | null>(null);
  const [usingSavedMapping, setUsingSavedMapping] = useState(false);

  // Multi-file column mapping. The live mapper state (columnMapping,
  // headerRow, allFileRows, etc.) always represents the ACTIVE file. When
  // the operator switches files we snapshot the live state into this cache
  // for the old file and restore the new file's cached state (or run
  // readFilePreview if it hasn't been previewed yet). At submit time we
  // walk the cache to send per-file mappings to the server.
  type FileCache = {
    allRows: (string | number | null)[][];
    previewHeaders: string[];
    previewRows: string[][];
    columnMapping: ColumnMapping;
    altMpnHeaders: string[];
    altMfrHeaders: string[];
    headerRow: number;
    lastRow: number;
    sheetNames: string[];
    activeSheet: string;
    previewError: string | null;
    usingSavedMapping: boolean;
    showMapper: boolean;
    workbook: XLSX.WorkBook | null;
    fileExt: string;
  };
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const perFileCacheRef = useRef<Record<number, FileCache>>({});

  // True when launched from a customer/GMP detail page with pre-selection.
  // Locks the customer + GMP fields to a compact read-only display until
  // the operator clicks "Change" to override.
  const [contextLocked, setContextLocked] = useState<boolean>(
    Boolean(prefilledCustomerId)
  );

  // One-shot prefill on mount when launched from a customer/GMP detail page.
  // Sets the customer + GMP without going through the typeahead UI (those
  // dropdowns stay hidden behind the "Change" link). Fetches the customer's
  // bom_config so the column mapper still gets the saved template applied
  // when the file is dropped.
  useEffect(() => {
    if (!prefilledCustomerId) return;
    let cancelled = false;
    (async () => {
      const customer = customers.find((c) => c.id === prefilledCustomerId);
      if (customer) {
        setCustomerInput(`${customer.code} — ${customer.company_name}`);
      }
      setCustomerId(prefilledCustomerId);

      setGmpsLoading(true);
      const [gmpsRes, customerRes] = await Promise.all([
        fetch(`/api/gmps?customer_id=${prefilledCustomerId}`),
        fetch(`/api/customers/${prefilledCustomerId}`),
      ]);
      if (cancelled) return;

      if (gmpsRes.ok) {
        const data = await gmpsRes.json();
        const list: Gmp[] = data.gmps ?? [];
        if (cancelled) return;
        setGmps(list);
      }
      if (!cancelled) setGmpsLoading(false);
      if (customerRes.ok) {
        const data = await customerRes.json();
        if (cancelled) return;
        const cfg = data?.bom_config ?? null;
        if (cfg && typeof cfg === "object") {
          setCustomerBomConfig({
            columns:
              cfg.columns &&
              typeof cfg.columns === "object" &&
              cfg.columns !== "auto_detect"
                ? cfg.columns
                : undefined,
            header_row:
              typeof cfg.header_row === "number" ? cfg.header_row : null,
            alt_mpn_columns: Array.isArray(cfg.alt_mpn_columns)
              ? cfg.alt_mpn_columns
              : undefined,
            alt_manufacturer_columns: Array.isArray(
              cfg.alt_manufacturer_columns
            )
              ? cfg.alt_manufacturer_columns
              : undefined,
          });
        }
      }

      // Lock the GMP to the one passed in. Pre-empts any keystrokes the
      // operator might land while the page is still hydrating.
      if (prefilledGmp && !cancelled) {
        setGmpId(prefilledGmp.id);
        setGmpInput(prefilledGmp.gmp_number);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledCustomerId, prefilledGmp?.id]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (gmpWrapperRef.current && !gmpWrapperRef.current.contains(e.target as Node)) {
        setGmpDropdownOpen(false);
      }
      if (customerWrapperRef.current && !customerWrapperRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter customers by typed text against code OR company name (case-insensitive).
  const filteredCustomers = customers.filter((c) => {
    const q = customerInput.trim().toLowerCase();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.company_name.toLowerCase().includes(q)
    );
  });

  const handleCustomerSelect = (customer: Customer) => {
    setCustomerInput(`${customer.code} — ${customer.company_name}`);
    setCustomerDropdownOpen(false);
    handleCustomerChange(customer.id);
  };

  const handleCustomerInputChange = (value: string) => {
    setCustomerInput(value);
    setCustomerDropdownOpen(true);
    // Clear the underlying FK if the user types something that doesn't match
    // the currently-selected customer — forces them to pick from the list.
    if (customerId) {
      const current = customers.find((c) => c.id === customerId);
      if (current && value !== `${current.code} — ${current.company_name}`) {
        setCustomerId("");
        setGmpId("");
        setGmpInput("");
        setGmps([]);
      }
    }
  };

  const clearCustomer = () => {
    setCustomerInput("");
    setCustomerId("");
    setCustomerDropdownOpen(false);
    setGmpId("");
    setGmpInput("");
    setGmps([]);
  };

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setGmpId("");
    setGmpInput("");
    setGmpDropdownOpen(false);
    setGmps([]);
    setGmpsLoading(true);
    setCustomerBomConfig(null);

    // Fetch GMPs + full customer detail in parallel. The customer detail
    // gives us bom_config, which holds the mapping the operator (or another
    // operator) saved on a previous upload for this customer.
    const [gmpsRes, customerRes] = await Promise.all([
      fetch(`/api/gmps?customer_id=${id}`),
      fetch(`/api/customers/${id}`),
    ]);
    if (gmpsRes.ok) {
      const data = await gmpsRes.json();
      setGmps(data.gmps ?? []);
    }
    setGmpsLoading(false);
    if (customerRes.ok) {
      const data = await customerRes.json();
      const cfg = data?.bom_config ?? null;
      if (cfg && typeof cfg === "object") {
        setCustomerBomConfig({
          columns: cfg.columns && typeof cfg.columns === "object" && cfg.columns !== "auto_detect"
            ? cfg.columns
            : undefined,
          header_row:
            typeof cfg.header_row === "number" ? cfg.header_row : null,
          alt_mpn_columns: Array.isArray(cfg.alt_mpn_columns) ? cfg.alt_mpn_columns : undefined,
          alt_manufacturer_columns: Array.isArray(cfg.alt_manufacturer_columns)
            ? cfg.alt_manufacturer_columns
            : undefined,
        });
      }
    }
  }, []);

  // Auto-detect keywords for column mapping (matches server-side column-mapper.ts)
  const AUTO_KEYWORDS: Record<string, string[]> = {
    qty: ["qty", "quantity", "qté", "count", "amount"],
    designator: ["designator", "designation", "ref des", "refdes", "reference", "index"],
    mpn: ["mpn", "manufacturer part", "part number", "mfr#", "partnumber", "mfg p/n", "p/n", "pn"],
    manufacturer: ["manufacturer", "mfg", "mfr", "vendor"],
    description: ["description", "desc", "name", "comment", "value", "spec"],
    cpc: ["cpc", "erp_pn", "customer part", "internal pn", "legend p/n", "fiso#"],
  };

  function autoDetectMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const usedIndices = new Set<number>();
    // Densify: sparse arrays from XLSX cause `normalized[i]` to be undefined
    // at the holes, and .includes() then throws. Coerce every slot to a
    // string so the inner loops are safe.
    const normalized: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      normalized.push(String(headers[i] ?? "").toLowerCase().trim());
    }

    for (const [field, keywords] of Object.entries(AUTO_KEYWORDS)) {
      for (let i = 0; i < normalized.length; i++) {
        if (usedIndices.has(i)) continue;
        const cell = normalized[i] ?? "";
        if (cell && keywords.some((kw) => cell.includes(kw))) {
          mapping[field] = headers[i] ?? "";
          usedIndices.add(i);
          break;
        }
      }
    }
    return mapping;
  }

  /**
   * Pre-fill the mapping from the customer's saved bom_config when possible,
   * falling back to keyword auto-detect for any fields it doesn't cover or
   * for columns that no longer exist in this file.
   */
  function applySavedOrAutoMapping(hdrs: string[]): {
    mapping: ColumnMapping;
    altMpns: string[];
    altMfrs: string[];
    savedHit: boolean;
  } {
    const saved = customerBomConfig;
    const mapping: ColumnMapping = {};
    let savedHit = false;
    if (saved?.columns) {
      const lowerToOriginal = new Map<string, string>();
      for (const h of hdrs) lowerToOriginal.set(h.toLowerCase().trim(), h);
      for (const [field, name] of Object.entries(saved.columns)) {
        if (typeof name !== "string") continue;
        const match = lowerToOriginal.get(name.toLowerCase().trim());
        if (match) {
          mapping[field] = match;
          savedHit = true;
        }
      }
    }
    // Fill any gaps from auto-detect so the operator isn't stuck with a
    // half-applied template after the customer's BOM format drifts.
    const autoDetected = autoDetectMapping(hdrs);
    for (const [field, name] of Object.entries(autoDetected)) {
      if (!mapping[field]) mapping[field] = name;
    }

    const pickArr = (arr: string[] | undefined) => {
      if (!arr) return [];
      return arr.filter((h) => hdrs.includes(h));
    };
    return {
      mapping,
      altMpns: pickArr(saved?.alt_mpn_columns),
      altMfrs: pickArr(saved?.alt_manufacturer_columns),
      savedHit,
    };
  }

  /** Given all rows and a 0-indexed header position, compute headers + sample rows + auto-mapping */
  function computePreview(
    rows: (string | number | null)[][],
    headerIdx: number,
    endIdx?: number
  ) {
    // Densify the header row — XLSX sometimes returns sparse arrays where
    // some indices are holes (not just empty strings), and downstream code
    // calls .includes() / .toLowerCase() on them.
    const headerSrc = rows[headerIdx] ?? [];
    const hdrs: string[] = [];
    for (let i = 0; i < headerSrc.length; i++) {
      hdrs.push(String(headerSrc[i] ?? "").trim());
    }
    const dataEnd = endIdx ?? rows.length;
    const sampleEnd = Math.min(headerIdx + 6, dataEnd);
    const samples = rows
      .slice(headerIdx + 1, sampleEnd)
      .map((row) => hdrs.map((_, ci) => String(row[ci] ?? "").trim()));

    setPreviewHeaders(hdrs);
    setPreviewRows(samples);
    const { mapping, altMpns, altMfrs, savedHit } = applySavedOrAutoMapping(hdrs);
    setColumnMapping(mapping);
    setAltMpnHeaders(altMpns);
    setAltMfrHeaders(altMfrs);
    setUsingSavedMapping(savedHit);
  }

  function handleHeaderRowChange(row1: number) {
    setHeaderRow(row1);
    // Ensure last row stays >= header row + 1
    if (lastRow <= row1) setLastRow(Math.min(row1 + 1, allFileRows.length));
    computePreview(allFileRows, row1 - 1, lastRow);
  }

  function handleLastRowChange(row1: number) {
    setLastRow(row1);
    computePreview(allFileRows, headerRow - 1, row1);
  }

  /** Score a sheet by how BOM-like its content looks. The first row that
   *  has 3+ text-bearing cells signals a header; we use that count as the
   *  rank. Empty sheets score 0 and are skipped. */
  function scoreSheet(rows: (string | number | null)[][]): number {
    if (!rows || rows.length === 0) return 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i] ?? [];
      let count = 0;
      // Use a length-based loop so sparse-array holes don't slip past .filter.
      for (let j = 0; j < row.length; j++) {
        const s = String(row[j] ?? "").trim();
        if (s.length > 1 && isNaN(Number(s))) count++;
      }
      if (count >= 3) return count + rows.length / 1000;
    }
    return 0;
  }

  function rowsFromSheet(
    wb: XLSX.WorkBook,
    sheetName: string
  ): (string | number | null)[][] {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];
    // defval:"" fills empty cells so the resulting rows are dense — sparse
    // arrays (produced when defval is omitted) blow up downstream code
    // that does `row[i].includes(...)` on a hole.
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as (string | number | null)[][];
  }

  /** Apply a fully-parsed sheet's rows: set state, decide header row, fire
   *  computePreview, and unconditionally show the mapper UI. Surfaces any
   *  prior preview error (e.g. file read failure) so the operator sees why
   *  the panel may be empty instead of it silently disappearing. */
  function applySheetRows(rows: (string | number | null)[][]) {
    setAllFileRows(rows);

    if (rows.length === 0) {
      // Still show the mapper with an empty state — the operator can switch
      // sheets or fix the file rather than guess why nothing happened.
      setShowMapper(true);
      setHeaderRow(1);
      setLastRow(1);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setColumnMapping({});
      setAltMpnHeaders([]);
      setAltMfrHeaders([]);
      return;
    }

    let headerIdx = -1;
    if (
      customerBomConfig?.header_row != null &&
      Number.isInteger(customerBomConfig.header_row) &&
      customerBomConfig.header_row >= 0 &&
      customerBomConfig.header_row < rows.length
    ) {
      headerIdx = customerBomConfig.header_row;
    }
    if (headerIdx < 0) {
      // Auto-detect the header row (first row with 3+ non-empty text cells).
      // length-based loop dodges sparse-array holes from XLSX.
      headerIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i] ?? [];
        let count = 0;
        for (let j = 0; j < row.length; j++) {
          const s = String(row[j] ?? "").trim();
          if (s.length > 1 && isNaN(Number(s))) count++;
        }
        if (count >= 3) {
          headerIdx = i;
          break;
        }
      }
    }

    const detectedHeaderRow = headerIdx + 1; // 1-indexed
    setHeaderRow(detectedHeaderRow);
    setLastRow(rows.length);
    computePreview(rows, headerIdx, rows.length);
    setShowMapper(true);
  }

  async function readFilePreview(f: File) {
    previewErrorRef.current = null;
    setPreviewError(null);
    workbookRef.current = null;
    fileExtRef.current = "";
    setSheetNames([]);
    setActiveSheet("");

    try {
      const buffer = await f.arrayBuffer();
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      fileExtRef.current = ext;

      if (ext === "csv" || ext === "tsv") {
        // CSV/TSV — single virtual sheet. No multi-sheet handling.
        const text = new TextDecoder("utf-8").decode(buffer);
        const rows = text
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => line.split(ext === "tsv" ? "\t" : ",")) as (
          | string
          | number
          | null
        )[][];
        applySheetRows(rows);
        return;
      }

      // XLSX / XLS — pick the best sheet, expose all sheets so the operator
      // can switch if our auto-pick guessed wrong (Cevians-style workbooks
      // where the BOM lives on sheet 2 or 3, with a cover page on sheet 1).
      const wb = XLSX.read(buffer, { type: "array" });
      workbookRef.current = wb;
      const allSheets = wb.SheetNames ?? [];
      setSheetNames(allSheets);

      if (allSheets.length === 0) {
        previewErrorRef.current = "Workbook has no sheets.";
        setPreviewError(previewErrorRef.current);
        applySheetRows([]);
        return;
      }

      let bestSheet = allSheets[0];
      let bestScore = scoreSheet(rowsFromSheet(wb, bestSheet));
      for (let i = 1; i < allSheets.length; i++) {
        const score = scoreSheet(rowsFromSheet(wb, allSheets[i]));
        if (score > bestScore) {
          bestScore = score;
          bestSheet = allSheets[i];
        }
      }

      setActiveSheet(bestSheet);
      applySheetRows(rowsFromSheet(wb, bestSheet));
    } catch (err) {
      previewErrorRef.current =
        err instanceof Error
          ? `Could not read file preview: ${err.message}`
          : "Could not read file preview.";
      setPreviewError(previewErrorRef.current);
      // Show the mapper with empty state so the operator sees the error
      // instead of the section silently never appearing.
      applySheetRows([]);
    }
  }

  /** User-driven sheet switch. Re-parses the cached workbook for the new
   *  sheet without re-reading the file. */
  function handleSheetChange(name: string) {
    setActiveSheet(name);
    const wb = workbookRef.current;
    if (!wb) return;
    applySheetRows(rowsFromSheet(wb, name));
  }

  // Pick a default section tag from a filename so the operator doesn't have
  // to manually flip the dropdown for obvious cases. Conservative: only
  // matches "smt" or "th" surrounded by non-word chars; defaults to "full".
  function guessSectionFromName(name: string): BomSection {
    const n = name.toLowerCase();
    if (/(^|[^a-z])smt([^a-z]|$)/.test(n)) return "smt";
    if (/(^|[^a-z])th([^a-z]|$)/.test(n)) return "th";
    if (/through[\s_-]?hole/.test(n)) return "th";
    return "full";
  }

  // Reset all parse-preview state. Used when the file list goes from
  // populated → empty so the column mapper UI vanishes cleanly.
  function resetPreviewState() {
    setBomName("");
    setShowMapper(false);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setColumnMapping({});
    setAllFileRows([]);
    setHeaderRow(1);
    setLastRow(1);
    setSheetNames([]);
    setActiveSheet("");
    setPreviewError(null);
    workbookRef.current = null;
  }

  // First-file path: clears the list and starts fresh. Mirrors the old
  // single-file `handleFileSelected` so all the call sites that drop ONE
  // file still work — including the drop zone before any file is selected.
  function handleFileSelected(f: File | null) {
    if (!f) {
      setFiles([]);
      setFileSections([]);
      setActiveFileIdx(0);
      perFileCacheRef.current = {};
      resetPreviewState();
      return;
    }
    setFiles([f]);
    setFileSections([guessSectionFromName(f.name)]);
    setActiveFileIdx(0);
    perFileCacheRef.current = {};
    setBomName(f.name);
    setShowMapper(false);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setColumnMapping({});
    setAllFileRows([]);
    setHeaderRow(1);
    setLastRow(1);
    setSheetNames([]);
    setActiveSheet("");
    setPreviewError(null);
    workbookRef.current = null;
    void readFilePreview(f);
  }

  // Append additional files (drag-drop of multiple files, or "Add another
  // file" button after the first is loaded). Does NOT re-run the column
  // mapper preview — that stays anchored on files[0] since we assume the
  // split halves use the same template.
  function handleFilesAdded(newFiles: File[]) {
    if (newFiles.length === 0) return;
    // First file ever? Use the single-file path so the preview kicks in.
    if (files.length === 0) {
      handleFileSelected(newFiles[0]);
      // Append the rest as secondary files.
      const rest = newFiles.slice(1);
      if (rest.length > 0) {
        setFiles((prev) => [...prev, ...rest]);
        setFileSections((prev) => [
          ...prev,
          ...rest.map((f) => guessSectionFromName(f.name)),
        ]);
      }
      return;
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setFileSections((prev) => [
      ...prev,
      ...newFiles.map((f) => guessSectionFromName(f.name)),
    ]);
  }

  function handleFileSectionChange(idx: number, section: BomSection) {
    setFileSections((prev) =>
      prev.map((s, i) => (i === idx ? section : s))
    );
  }

  // Snapshot the live mapper state (the active file's edits) into the cache.
  function snapshotActiveToCache() {
    perFileCacheRef.current[activeFileIdx] = {
      allRows: allFileRows,
      previewHeaders,
      previewRows,
      columnMapping,
      altMpnHeaders,
      altMfrHeaders,
      headerRow,
      lastRow,
      sheetNames,
      activeSheet,
      previewError,
      usingSavedMapping,
      showMapper,
      workbook: workbookRef.current,
      fileExt: fileExtRef.current,
    };
  }

  // Restore the live mapper state from a cached snapshot.
  function restoreFromCache(c: FileCache) {
    setAllFileRows(c.allRows);
    setPreviewHeaders(c.previewHeaders);
    setPreviewRows(c.previewRows);
    setColumnMapping(c.columnMapping);
    setAltMpnHeaders(c.altMpnHeaders);
    setAltMfrHeaders(c.altMfrHeaders);
    setHeaderRow(c.headerRow);
    setLastRow(c.lastRow);
    setSheetNames(c.sheetNames);
    setActiveSheet(c.activeSheet);
    setPreviewError(c.previewError);
    setUsingSavedMapping(c.usingSavedMapping);
    setShowMapper(c.showMapper);
    workbookRef.current = c.workbook;
    fileExtRef.current = c.fileExt;
  }

  // Switch which file the column mapper is previewing. Caches the OLD
  // file's edits, restores the NEW file's cached state if present, else
  // runs readFilePreview for the first time. Per-file mappings are kept in
  // the cache and submitted independently at upload time, so files with
  // different templates can have different column mappings.
  function switchToFile(newIdx: number) {
    if (newIdx === activeFileIdx) return;
    if (newIdx < 0 || newIdx >= files.length) return;
    snapshotActiveToCache();
    setActiveFileIdx(newIdx);
    const cached = perFileCacheRef.current[newIdx];
    if (cached) {
      restoreFromCache(cached);
    } else {
      void readFilePreview(files[newIdx]);
    }
  }

  function handleRemoveFile(idx: number) {
    const remaining = files.filter((_, i) => i !== idx);
    const remainingSections = fileSections.filter((_, i) => i !== idx);
    // No files left → wipe preview state entirely.
    if (remaining.length === 0) {
      handleFileSelected(null);
      return;
    }

    // Snapshot the active file's edits before reshuffling the cache so
    // nothing is lost if the operator was on the file we're about to drop
    // (or its sibling whose index shifts).
    snapshotActiveToCache();

    // Drop the removed file's cache entry and shift higher indices down.
    const oldCache = perFileCacheRef.current;
    const newCache: Record<number, FileCache> = {};
    for (const key of Object.keys(oldCache)) {
      const k = Number(key);
      if (k === idx) continue;
      newCache[k > idx ? k - 1 : k] = oldCache[k];
    }
    perFileCacheRef.current = newCache;

    setFiles(remaining);
    setFileSections(remainingSections);

    // Figure out which file becomes active after the removal:
    //  - removed the active file → fall back to file 0
    //  - removed a file before the active one → active index shifts down
    //  - removed a file after the active one → active index unchanged
    let newActive: number;
    if (idx === activeFileIdx) {
      newActive = 0;
    } else if (idx < activeFileIdx) {
      newActive = activeFileIdx - 1;
    } else {
      newActive = activeFileIdx;
    }
    setActiveFileIdx(newActive);

    // bomName mirrors files[0].name when it's the default — refresh it if
    // the primary changed.
    if (idx === 0) setBomName(remaining[0].name);

    // Load the new active file's state — from cache if cached, else from
    // disk via readFilePreview.
    const cached = newCache[newActive];
    if (cached) {
      restoreFromCache(cached);
    } else {
      setShowMapper(false);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setColumnMapping({});
      setAllFileRows([]);
      setHeaderRow(1);
      setLastRow(1);
      setSheetNames([]);
      setActiveSheet("");
      setPreviewError(null);
      workbookRef.current = null;
      void readFilePreview(remaining[newActive]);
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) handleFilesAdded(dropped);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files.length]
  );

  // Filtered GMPs based on input text
  const filteredGmps = gmps.filter((g) => {
    if (!gmpInput.trim()) return true;
    const q = gmpInput.toLowerCase();
    return (
      g.gmp_number.toLowerCase().includes(q) ||
      (g.board_name && g.board_name.toLowerCase().includes(q))
    );
  });

  // Whether the input exactly matches an existing GMP (case-insensitive)
  const exactMatch = gmps.find(
    (g) => g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
  );

  const handleGmpSelect = (gmp: Gmp) => {
    setGmpId(gmp.id);
    setGmpInput(gmp.gmp_number);
    setGmpDropdownOpen(false);
  };

  const handleGmpInputChange = (value: string) => {
    setGmpInput(value);
    // If the user edits the text, clear the selected ID so we know it's a "new" GMP
    // unless the typed text exactly matches an existing GMP number
    const match = gmps.find(
      (g) => g.gmp_number.toLowerCase() === value.trim().toLowerCase()
    );
    if (match) {
      setGmpId(match.id);
    } else {
      setGmpId("");
    }
    setGmpDropdownOpen(true);
  };

  const handleUpload = async () => {
    if (files.length === 0 || !customerId) return;
    setUploading(true);
    setError(null);

    try {
      let resolvedGmpId = gmpId;

      // If no existing GMP was selected, create a new one
      if (!resolvedGmpId && gmpInput.trim()) {
        const gmpRes = await fetch("/api/gmps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: customerId, gmp_number: gmpInput.trim() }),
        });
        if (gmpRes.status === 409) {
          // GMP already exists — look it up and use it (new BOM revision under existing GMP)
          const existingGmp = gmps.find(
            (g) => g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
          );
          if (existingGmp) {
            resolvedGmpId = existingGmp.id;
          } else {
            // Not in the loaded list — fetch it
            const lookupRes = await fetch(`/api/gmps?customer_id=${customerId}`);
            if (lookupRes.ok) {
              const lookupData = await lookupRes.json();
              const match = (lookupData.gmps ?? []).find(
                (g: { id: string; gmp_number: string }) =>
                  g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
              );
              if (match) resolvedGmpId = match.id;
            }
          }
          if (!resolvedGmpId) throw new Error("GMP exists but could not be found. Please try again.");
        } else if (!gmpRes.ok) {
          const err = await gmpRes.json();
          throw new Error(err.error ?? "Failed to create GMP");
        } else {
          const gmpData = await gmpRes.json();
          resolvedGmpId = gmpData.id;
        }
      }

      if (!resolvedGmpId) throw new Error("Please enter a GMP number");

      // Snapshot the active file's current mapper state into the cache so
      // every file has a consistent, up-to-date entry to read from below.
      snapshotActiveToCache();

      const formData = new FormData();
      formData.append("customer_id", customerId);
      formData.append("gmp_id", resolvedGmpId);
      formData.append("revision", revision.trim() || "1");
      if (bomName.trim()) formData.append("bom_name", bomName.trim());
      if (gerberName.trim()) formData.append("gerber_name", gerberName.trim());
      if (gerberRevision.trim()) formData.append("gerber_revision", gerberRevision.trim());

      // Walk every file and send its file blob + section tag + (optional)
      // per-file column mapping. Files the operator never opened in the
      // preview have no cache entry — the server falls back to the
      // customer's saved bom_config / AI mapper for those.
      files.forEach((f, i) => {
        formData.append(`files[${i}]`, f);
        formData.append(`sections[${i}]`, fileSections[i] ?? "full");

        const c = perFileCacheRef.current[i];
        if (!c) return; // Server will auto-resolve this file's mapping.

        if (Object.keys(c.columnMapping).length > 0) {
          formData.append(
            `column_mappings[${i}]`,
            JSON.stringify(c.columnMapping)
          );
        }
        if (c.altMpnHeaders.length > 0) {
          formData.append(
            `alt_mpn_columns[${i}]`,
            JSON.stringify(c.altMpnHeaders)
          );
        }
        if (c.altMfrHeaders.length > 0) {
          formData.append(
            `alt_manufacturer_columns[${i}]`,
            JSON.stringify(c.altMfrHeaders)
          );
        }
        if (c.showMapper && c.headerRow >= 1) {
          formData.append(`header_rows[${i}]`, String(c.headerRow));
          formData.append(`last_rows[${i}]`, String(c.lastRow));
        }
        if (c.activeSheet) {
          formData.append(`sheet_names[${i}]`, c.activeSheet);
        }
      });

      const res = await fetch("/api/bom/parse", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Server returns { error, details } — show both so the operator
        // sees the actual cause (e.g. "header_row exceeds file length",
        // FastAPI parser exception, RLS denial) instead of a generic
        // "Parse failed" with no clue what went wrong.
        const parts = [
          (err as { error?: string }).error,
          (err as { details?: string }).details,
        ].filter(Boolean) as string[];
        throw new Error(parts.length > 0 ? parts.join(" — ") : "Upload failed");
      }

      const result = await res.json();
      router.push(`/bom/${result.bom_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  const gmpReady = gmpId || gmpInput.trim().length > 0;

  // Lookup the prefilled customer's display data (when available). Used by
  // the locked-summary card so we can show "TLAN — Lanka" without waiting
  // on a network round-trip.
  const prefilledCustomer = prefilledCustomerId
    ? customers.find((c) => c.id === prefilledCustomerId) ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* Locked context — shown when launched from a customer/GMP detail
          page. Collapses customer + GMP into a compact card with a "Change"
          link instead of two typeahead inputs the operator already filled
          out implicitly by clicking "Upload BOM" on that page. */}
      {contextLocked && prefilledCustomer ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
                  Customer
                </span>
                <div className="font-medium text-blue-900 dark:text-blue-100">
                  <span className="font-mono">{prefilledCustomer.code}</span>
                  <span className="ml-1 text-blue-800/80 dark:text-blue-200/80">
                    — {prefilledCustomer.company_name}
                  </span>
                </div>
              </div>
              {prefilledGmp ? (
                <div>
                  <span className="text-xs uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
                    GMP
                  </span>
                  <div className="font-medium text-blue-900 dark:text-blue-100">
                    <span className="font-mono">
                      {prefilledGmp.gmp_number}
                    </span>
                    {prefilledGmp.board_name ? (
                      <span className="ml-1 text-blue-800/80 dark:text-blue-200/80">
                        — {prefilledGmp.board_name}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContextLocked(false)}
              className="text-blue-700 hover:text-blue-900 dark:text-blue-300"
            >
              Change
            </Button>
          </div>
        </div>
      ) : null}

      {/* Customer — type to search, click to pick */}
      {!contextLocked && (
      <div className="space-y-2">
        <Label>Customer</Label>
        <div className="relative" ref={customerWrapperRef}>
          <Input
            placeholder="Type customer code or company name..."
            value={customerInput}
            onChange={(e) => handleCustomerInputChange(e.target.value)}
            onFocus={() => setCustomerDropdownOpen(true)}
            autoComplete="off"
            className={customerId ? "pr-8" : undefined}
          />
          {customerInput && (
            <button
              type="button"
              onClick={clearCustomer}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label="Clear customer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {customerDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
              <div className="max-h-60 overflow-y-auto p-1">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                        customerId === c.id && "bg-muted"
                      )}
                      onMouseDown={(e) => {
                        // mousedown fires before input blur, keeping the click alive
                        e.preventDefault();
                        handleCustomerSelect(c);
                      }}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", customerId === c.id ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono font-medium">{c.code}</span>
                      <span className="text-muted-foreground truncate">— {c.company_name}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                    No customers match <span className="font-medium">&quot;{customerInput.trim()}&quot;</span>.
                    Add them first in <a href="/customers" className="underline">Customers</a>.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* GMP — hidden in locked-context mode only when a GMP was actually
          prefilled. "Add Board" from the customer page passes customer_id
          without gmp_id, so the operator still needs the input to enter a
          new GMP name. */}
      {(!contextLocked || !prefilledGmp) && customerId && (
        <div className="space-y-2">
          <Label>GMP (Board / Product)</Label>
          <div className="relative" ref={gmpWrapperRef}>
            <Input
              placeholder={
                gmpsLoading
                  ? "Loading existing GMPs for this customer..."
                  : gmps.length > 0
                    ? "Type to search or enter new GMP..."
                    : "e.g. TL265-5040-000-T"
              }
              value={gmpInput}
              onChange={(e) => handleGmpInputChange(e.target.value)}
              onFocus={() => { if (!gmpsLoading && gmps.length > 0) setGmpDropdownOpen(true); }}
              autoComplete="off"
              disabled={gmpsLoading}
              className={gmpsLoading ? "pr-9" : undefined}
            />
            {gmpsLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {/* Dropdown list */}
            {gmpDropdownOpen && !gmpsLoading && gmps.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                <div className="max-h-48 overflow-y-auto p-1">
                  {filteredGmps.length > 0 ? (
                    filteredGmps.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                          gmpId === g.id && "bg-muted"
                        )}
                        onMouseDown={(e) => {
                          // Use mousedown to fire before input blur
                          e.preventDefault();
                          handleGmpSelect(g);
                        }}
                      >
                        <Check className={cn("h-3.5 w-3.5 shrink-0", gmpId === g.id ? "opacity-100" : "opacity-0")} />
                        <span className="font-medium">{g.gmp_number}</span>
                        {g.board_name && <span className="text-muted-foreground truncate">— {g.board_name}</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No matching GMPs — press Upload to create <span className="font-medium">{gmpInput.trim()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Hint text below input */}
            {gmpInput.trim() && !gmpId && !exactMatch && (
              <p className="mt-1 text-xs text-muted-foreground">
                New GMP will be created: <span className="font-medium">{gmpInput.trim()}</span>
              </p>
            )}
          </div>

        </div>
      )}

      {/* File drop zone — empty state. Once at least one file is selected,
          this collapses into the per-file list (below) plus an "Add another
          file" button so the operator can layer in the partner half of a
          split BOM. */}
      {customerId && gmpReady && files.length === 0 && (
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-gray-400" />
            <p className="font-medium">Drag &amp; drop BOM file(s) here</p>
            <p className="text-sm text-gray-500">
              Supports .xlsx, .xls, .csv — drop multiple files at once if the
              customer splits SMT and TH into separate files.
            </p>
            <div>
              <input
                id="bom-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                className="hidden"
                onChange={(e) =>
                  handleFilesAdded(Array.from(e.target.files ?? []))
                }
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() =>
                  document.getElementById("bom-file-input")?.click()
                }
              >
                Browse files
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Per-file list — shown once at least one file is selected. Each row
          has the filename, a section dropdown, and a remove button. The
          "Add another file" trigger sits at the bottom for layering in the
          partner half. */}
      {customerId && gmpReady && files.length > 0 && (
        <div
          className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
            dragOver ? "border-blue-400 bg-blue-50" : "border-green-300 bg-green-50/30 dark:bg-green-950/10"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            {files.length} file{files.length === 1 ? "" : "s"} selected
            {files.length > 1 ? " — will be merged into a single BOM" : ""}
            {files.length > 1 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                · click a file to preview &amp; map it
              </span>
            )}
          </p>
          <ul className="space-y-2">
            {files.map((f, i) => {
              const isActive = i === activeFileIdx;
              const cached = perFileCacheRef.current[i];
              const hasMapping =
                isActive
                  ? Object.keys(columnMapping).length > 0
                  : cached
                    ? Object.keys(cached.columnMapping).length > 0
                    : false;
              return (
                <li
                  key={`${f.name}-${i}`}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                    isActive
                      ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => switchToFile(i)}
                    disabled={isActive}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    aria-label={isActive ? "Currently previewing" : `Switch preview to ${f.name}`}
                  >
                    <FileSpreadsheet
                      className={`h-5 w-5 shrink-0 ${
                        isActive ? "text-blue-600" : "text-green-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-gray-500">
                        {(f.size / 1024).toFixed(1)} KB
                        {isActive ? " • previewing now" : hasMapping ? " • mapped" : " • not yet previewed"}
                      </p>
                    </div>
                  </button>
                  <div className="w-40 shrink-0">
                    <Select
                      value={fileSections[i] ?? "full"}
                      onValueChange={(v) =>
                        handleFileSectionChange(i, (v ?? "full") as BomSection)
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Full" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full board</SelectItem>
                        <SelectItem value="smt">SMT only</SelectItem>
                        <SelectItem value="th">Through-Hole only</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <input
              id="bom-file-input-more"
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(Array.from(e.target.files ?? []));
                // Reset the input so the same file can be picked again if
                // the operator removed and re-added it.
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                document.getElementById("bom-file-input-more")?.click()
              }
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              Add another file
            </Button>
            <span className="text-xs text-muted-foreground">
              Use this when the customer ships TH and SMT as separate files.
            </span>
          </div>
        </div>
      )}

      {/* BOM Name + Gerber fields — shown after file is selected */}
      {file && (
        <div className="space-y-3 rounded-lg border p-4 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
            <div>
              <Label htmlFor="bom-name">BOM Name</Label>
              <Input
                id="bom-name"
                type="text"
                value={bomName}
                onChange={(e) => setBomName(e.target.value)}
                placeholder={file.name}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Defaults to the uploaded filename. Edit if you want a cleaner display name.
              </p>
            </div>
            <div>
              <Label htmlFor="bom-revision">BOM Version</Label>
              <Input
                id="bom-revision"
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="e.g. 1, V5, Rev A"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Each version is a separate BOM under the same GMP.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gerber-name">Gerber Name</Label>
              <Input
                id="gerber-name"
                type="text"
                value={gerberName}
                onChange={(e) => setGerberName(e.target.value)}
                placeholder="e.g. TL265-5001-000-T_Gerber"
              />
            </div>
            <div>
              <Label htmlFor="gerber-revision">Gerber Revision</Label>
              <Input
                id="gerber-revision"
                type="text"
                value={gerberRevision}
                onChange={(e) => setGerberRevision(e.target.value)}
                placeholder="e.g. V3, Rev A"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sheet selector — only shown for multi-sheet workbooks. Common for
          Cevians-style files where the BOM lives on sheet 2 or 3 with a
          cover/notes page on sheet 1. We auto-pick the sheet with the most
          BOM-like content but surface a switcher in case the guess is wrong. */}
      {sheetNames.length > 1 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span>Workbook has {sheetNames.length} sheets. Active sheet:</span>
          <Select
            value={activeSheet}
            onValueChange={(v) => handleSheetChange(v ?? "")}
          >
            <SelectTrigger size="sm" className="min-w-[10rem]">
              <SelectValue>{(v: string) => v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sheetNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-amber-800/70 dark:text-amber-300/70">
            Switch if the BOM data is on a different tab.
          </span>
        </div>
      )}

      {/* Preview error — surfaced instead of swallowed so the operator sees
          why the mapper might be empty. */}
      {previewError && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {previewError}
        </div>
      )}

      {/* Banner — saved template applied. Operators usually don't need to
          touch the mapper on a repeat upload for the same customer, so the
          full panel is still shown but this gives them a clear signal it was
          auto-filled from memory. */}
      {showMapper && usingSavedMapping && (
        <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-sm text-green-800 dark:text-green-200 flex items-center justify-between gap-2">
          <span>
            <Check className="inline h-4 w-4 mr-1 -mt-0.5" />
            Using this customer&apos;s saved mapping. Review below and edit if the
            file format changed.
          </span>
        </div>
      )}

      {/* Column mapper preview — keep mounted whenever a file is loaded, even
          if the currently-selected header row is blank (so the user can keep
          adjusting the row number instead of the whole section disappearing).
          When the active sheet is empty we still mount it so the operator
          can see the empty state and switch sheets / fix the file. */}
      {showMapper && files.length > 1 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          Mapping for: <span className="font-mono font-medium">{files[activeFileIdx]?.name}</span>
          <span className="ml-2 text-xs text-blue-700/80 dark:text-blue-300/70">
            Each file keeps its own mapping. Click a file above to switch.
          </span>
        </div>
      )}
      {showMapper && (
        <SheetMapper
          allRows={allFileRows}
          headerRow={headerRow}
          lastRow={lastRow}
          mapping={columnMapping}
          altMpnHeaders={altMpnHeaders}
          altMfrHeaders={altMfrHeaders}
          onHeaderRowChange={handleHeaderRowChange}
          onLastRowChange={handleLastRowChange}
          onMappingChange={setColumnMapping}
          onAltMpnHeadersChange={setAltMpnHeaders}
          onAltMfrHeadersChange={setAltMfrHeaders}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {file && (
        <Button onClick={handleUpload} disabled={uploading} className="w-full">
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading &amp; Parsing...</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" />Upload &amp; Parse BOM</>
          )}
        </Button>
      )}
    </div>
  );
}
