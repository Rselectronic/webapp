"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";

// Column-name normalisation. Header strings are lowercased + whitespace/dashes
// → underscores before lookup. Operators paste from very different sources
// (the existing BG Excel uses "BG or SS?", "Serial No.", etc.) so we accept
// every variant we know about. Unknown columns are surfaced as a warning.
const COLUMN_ALIASES: Record<string, string> = {
  // CPC
  cpc: "cpc",
  // Serial No. — BG feeder-slot identifier. Optional.
  serial_no: "serial_no",
  serial_number: "serial_no",
  serial: "serial_no",
  slot: "serial_no",
  // Description
  description: "description",
  desc: "description",
  // MPN — required
  mpn: "mpn",
  manufacturer_part_number: "mpn",
  manufacturer_part: "mpn",
  part_number: "mpn",
  // Manufacturer
  manufacturer: "manufacturer",
  mfr: "manufacturer",
  // Pool — required (BG / Safety). Header normalisation strips trailing
  // "?" so "BG or SS?" arrives here as "bg_or_ss".
  bg_or_ss: "pool",
  pool: "pool",
  type: "pool",
  // Stock — initial physical count
  stock: "stock",
  qty: "stock",
  quantity: "stock",
  on_hand: "stock",
  // Optional
  min: "min_stock_threshold",
  min_stock_threshold: "min_stock_threshold",
  threshold: "min_stock_threshold",
  notes: "notes",
  // ── Explicitly ignored ──
  // "#" — row counter only, no business meaning
  "#": "__ignore__",
};

interface RawRow {
  [key: string]: unknown;
}

// Mirrors ImportRow on the server. Strings only — server parses ints/pools.
interface NormalisedRow {
  cpc?: string;
  serial_no?: string;
  description?: string;
  mpn: string;
  manufacturer?: string;
  pool: string;
  stock?: string;
  min_stock_threshold?: string;
  notes?: string;
}

interface RowResult {
  row: number;
  cpc?: string;
  serial_no?: string;
  mpn: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
}

type ImportMode = "import" | "upsert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

// Template uses canonical column names matching the operator's existing BG
// Excel layout (CPC | Serial No. | Description | MPN | Manufacturer | BG or
// SS? | Stock). Serial No. is now wired through to inventory_parts.serial_no
// and the inventory_serial_history audit trail.
const TEMPLATE_HEADERS = [
  "CPC",
  "Serial No.",
  "Description",
  "MPN",
  "Manufacturer",
  "BG or SS?",
  "Stock",
  "Min",
  "Notes",
];

const TEMPLATE_SAMPLE_ROW: Record<string, string> = {
  CPC: "C-CAP-100NF",
  "Serial No.": "47",
  Description: "100nF 0402 X7R 50V",
  MPN: "CL05B104KB5NNNC",
  Manufacturer: "Samsung Electro-Mechanics",
  "BG or SS?": "BG",
  Stock: "5000",
  Min: "1000",
  Notes: "Tape & reel, feeder slot 47",
};

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const header = TEMPLATE_HEADERS.join(",");
    const sample = TEMPLATE_HEADERS.map(
      (h) => `"${(TEMPLATE_SAMPLE_ROW[h] ?? "").replace(/"/g, '""')}"`
    ).join(",");
    const blob = new Blob([`${header}\n${sample}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const ws = XLSX.utils.json_to_sheet([TEMPLATE_SAMPLE_ROW], {
      header: TEMPLATE_HEADERS,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, "inventory-import-template.xlsx");
  }
}

function normaliseHeader(h: string): string | null {
  // Lowercase, trim, collapse whitespace + dashes to underscores, drop
  // trailing question marks and periods. "BG or SS?" → "bg_or_ss".
  const key = h
    .toLowerCase()
    .trim()
    .replace(/\?+$/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_#]/g, "");
  if (key in COLUMN_ALIASES) {
    const target = COLUMN_ALIASES[key];
    return target === "__ignore__" ? null : target;
  }
  // Some sheets keep a literal "#" header for the row counter — we already
  // handle "serial_no" above; the bare "#" character is normalised to "" by
  // the regex strip, which falls through here and is treated as unknown. That
  // is fine — the dialog will surface it as an unknown column to ignore.
  return null;
}

function readFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        if (!firstSheet) {
          reject(new Error("File has no sheets"));
          return;
        }
        const json = XLSX.utils.sheet_to_json<RawRow>(firstSheet, {
          defval: "",
          raw: false,
        });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function normaliseRows(raw: RawRow[]): {
  rows: NormalisedRow[];
  unknownColumns: string[];
} {
  if (raw.length === 0) return { rows: [], unknownColumns: [] };
  const firstRow = raw[0];
  const headerMap = new Map<string, string>(); // raw header -> canonical
  const unknown: string[] = [];
  for (const k of Object.keys(firstRow)) {
    const canon = normaliseHeader(k);
    if (canon) {
      headerMap.set(k, canon);
    } else {
      // "#" (row counter) is intentionally ignored — don't surface it as
      // unknown. Empty header strings show up sometimes from xlsx files
      // that have stray formatting columns.
      const lk = k
        .toLowerCase()
        .trim()
        .replace(/\?+$/g, "")
        .replace(/\.+$/g, "")
        .replace(/\s+/g, "_");
      if (lk !== "#" && lk !== "") {
        unknown.push(k);
      }
    }
  }

  const rows: NormalisedRow[] = raw.map((r) => {
    const out: Partial<NormalisedRow> = {};
    for (const [rawKey, canon] of headerMap.entries()) {
      const v = r[rawKey];
      if (v == null) continue;
      const s = String(v).trim();
      if (s === "") continue;
      (out as Record<string, string>)[canon] = s;
    }
    return out as NormalisedRow;
  });
  return { rows, unknownColumns: unknown };
}

export function ImportInventoryDialog({ open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<NormalisedRow[]>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Mode: "import" = insert new only, skip existing CPCs (safe default).
  // "upsert" = update existing rows by CPC, insert new ones, reconcile stock.
  const [mode, setMode] = useState<ImportMode>("import");
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setUnknownCols([]);
    setResults(null);
    setSummary(null);
  }

  async function handleFile(f: File | null) {
    if (!f) {
      reset();
      return;
    }
    setFile(f);
    setResults(null);
    setSummary(null);
    setParsing(true);
    try {
      const raw = await readFile(f);
      if (raw.length === 0) {
        toast.error("File has no data rows");
        setParsedRows([]);
        return;
      }
      const { rows, unknownColumns } = normaliseRows(raw);
      setParsedRows(rows);
      setUnknownCols(unknownColumns);
      if (rows.length === 0) {
        toast.error(
          "Could not recognise any columns. Download the template for the expected format."
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
      setParsedRows([]);
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    if (parsedRows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, mode }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: typeof summary;
        results?: RowResult[];
      };
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      setSummary(j.summary ?? null);
      setResults(j.results ?? []);
      const c = j.summary?.created ?? 0;
      const u = j.summary?.updated ?? 0;
      const e = j.summary?.errors ?? 0;
      const s = j.summary?.skipped ?? 0;
      const parts: string[] = [];
      if (c > 0) parts.push(`${c} created`);
      if (u > 0) parts.push(`${u} updated`);
      if (s > 0) parts.push(`${s} skipped`);
      if (e > 0) parts.push(`${e} error${e === 1 ? "" : "s"}`);
      toast.success(parts.length > 0 ? parts.join(", ") : "Import complete");
      if (c > 0 || u > 0) onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import inventory parts</DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file. Each row creates one inventory part
            (BG or Safety pool) and seeds its on-hand quantity. Duplicate
            MPNs are skipped in import mode.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          {/* Template + file picker */}
          <div className="rounded-md border bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900">1. Download a template</p>
                <p className="text-xs text-gray-600">
                  Columns: <code>CPC</code>, <code>Serial No.</code>,{" "}
                  <code>Description</code>, <code>MPN</code>,{" "}
                  <code>Manufacturer</code>, <code>BG or SS?</code>,{" "}
                  <code>Stock</code>, <code>Min</code>, <code>Notes</code>.
                  Required: <code>CPC</code>, <code>BG or SS?</code>.{" "}
                  <code>Serial No.</code> is the BG feeder-slot identifier
                  (optional).
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate("csv")}
                >
                  <Download className="mr-1 h-3 w-3" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate("xlsx")}
                >
                  <Download className="mr-1 h-3 w-3" />
                  XLSX
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-gray-50 p-3 text-sm">
            <p className="mb-2 font-medium text-gray-900">2. Choose your file</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-gray-800"
            />
            {file && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
                {parsing && <span className="ml-1 text-blue-600">parsing…</span>}
              </div>
            )}
          </div>

          {/* Mode picker — visible once a file has been parsed */}
          {parsedRows.length > 0 && !results && (
            <div className="rounded-md border bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium text-gray-900">3. Choose mode</p>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="import-mode"
                    value="import"
                    checked={mode === "import"}
                    onChange={() => setMode("import")}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Import (insert only)</span>
                    <p className="text-xs text-gray-600">
                      Adds new parts. Rows whose MPN already exists are skipped.
                      For new parts, a positive Stock value writes one
                      <code className="mx-1">initial_stock</code>
                      movement so the on-hand count matches the file.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="import-mode"
                    value="upsert"
                    checked={mode === "upsert"}
                    onChange={() => setMode("upsert")}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Upsert (insert + update)</span>
                    <p className="text-xs text-gray-600">
                      New MPNs are inserted; existing MPNs are{" "}
                      <strong>overwritten</strong> with the values in the file
                      (CPC, description, manufacturer, pool, min threshold,
                      notes). Existing movements and allocations are{" "}
                      <strong>not touched</strong>. If the imported{" "}
                      <code>Stock</code> differs from the part&rsquo;s current
                      <code className="mx-1">physical_qty</code>, a single{" "}
                      <code>manual_adjust</code> movement is written
                      (note: &ldquo;Reconciled from import&rdquo;) to bring the
                      ledger into alignment.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedRows.length > 0 && !results && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">
                  4. Preview — {parsedRows.length} row
                  {parsedRows.length === 1 ? "" : "s"}
                </p>
              </div>
              {unknownCols.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Ignoring unknown column{unknownCols.length === 1 ? "" : "s"}:{" "}
                    <code>{unknownCols.join(", ")}</code>. See the template for
                    accepted column names.
                  </span>
                </div>
              )}
              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-b bg-gray-50 text-left text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">Serial No.</th>
                      <th className="px-2 py-1">CPC</th>
                      <th className="px-2 py-1">MPN</th>
                      <th className="px-2 py-1">Manufacturer</th>
                      <th className="px-2 py-1">Description</th>
                      <th className="px-2 py-1">Pool</th>
                      <th className="px-2 py-1">Stock</th>
                      <th className="px-2 py-1">Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                        <td className="px-2 py-1 font-mono text-gray-600">
                          {r.serial_no || "—"}
                        </td>
                        <td className="px-2 py-1 font-mono text-gray-600">
                          {r.cpc || "—"}
                        </td>
                        <td className="px-2 py-1 font-mono">{r.mpn || "—"}</td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.manufacturer ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.description ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.pool ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.stock ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.min_stock_threshold ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 50 && (
                  <div className="border-t bg-gray-50 px-2 py-1 text-xs text-gray-500">
                    Showing first 50 of {parsedRows.length}. Submit to import all.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results */}
          {results && summary && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Import results</p>
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="rounded-md border bg-white p-2">
                  <div className="text-gray-500">Total</div>
                  <div className="text-base font-semibold">{summary.total}</div>
                </div>
                <div className="rounded-md border border-green-200 bg-green-50 p-2">
                  <div className="text-green-700">Created</div>
                  <div className="text-base font-semibold text-green-800">
                    {summary.created}
                  </div>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
                  <div className="text-blue-700">Updated</div>
                  <div className="text-base font-semibold text-blue-800">
                    {summary.updated}
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <div className="text-amber-700">Skipped</div>
                  <div className="text-base font-semibold text-amber-800">
                    {summary.skipped}
                  </div>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-2">
                  <div className="text-red-700">Errors</div>
                  <div className="text-base font-semibold text-red-800">
                    {summary.errors}
                  </div>
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-b bg-gray-50 text-left text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-1">Row</th>
                      <th className="px-2 py-1">Serial No.</th>
                      <th className="px-2 py-1">CPC</th>
                      <th className="px-2 py-1">MPN</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={`${r.row}-${r.cpc || r.mpn}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-2 py-1 text-gray-500">{r.row}</td>
                        <td className="px-2 py-1 font-mono">
                          {r.serial_no || "—"}
                        </td>
                        <td className="px-2 py-1 font-mono">{r.cpc || "—"}</td>
                        <td className="px-2 py-1 font-mono">{r.mpn || "—"}</td>
                        <td className="px-2 py-1">
                          {r.status === "created" && (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <CheckCircle2 className="h-3 w-3" /> created
                            </span>
                          )}
                          {r.status === "updated" && (
                            <span className="inline-flex items-center gap-1 text-blue-700">
                              <CheckCircle2 className="h-3 w-3" /> updated
                            </span>
                          )}
                          {r.status === "skipped" && (
                            <span className="text-amber-700">skipped</span>
                          )}
                          {r.status === "error" && (
                            <span className="text-red-700">error</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.message ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              onClick={submit}
              disabled={submitting || parsedRows.length === 0}
            >
              <Upload className="mr-1 h-3 w-3" />
              {submitting
                ? mode === "upsert"
                  ? "Upserting…"
                  : "Importing…"
                : `${mode === "upsert" ? "Upsert" : "Import"} ${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
