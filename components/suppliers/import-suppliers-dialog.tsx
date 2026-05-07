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
import { Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

// Recognised template columns. The CSV/XLSX header row may use any of the
// aliases below — we normalise to the canonical key when sending to the
// import API. Operators paste headers from various sources, so being
// permissive here saves a lot of "why didn't my file work" support.
const COLUMN_ALIASES: Record<string, string> = {
  // Required
  code: "code",
  supplier_code: "code",
  // Required
  legal_name: "legal_name",
  name: "legal_name",
  company: "legal_name",
  company_name: "legal_name",
  supplier: "legal_name",
  // Optional
  category: "category",
  default_currency: "default_currency",
  currency: "default_currency",
  payment_terms: "payment_terms",
  terms: "payment_terms",
  address_line1: "address_line1",
  line1: "address_line1",
  address: "address_line1",
  address_line2: "address_line2",
  line2: "address_line2",
  city: "city",
  state_province: "state_province",
  state: "state_province",
  province: "state_province",
  postal_code: "postal_code",
  zip: "postal_code",
  zip_code: "postal_code",
  country: "country",
  is_approved: "is_approved",
  approved: "is_approved",
  online_only: "online_only",
  notes: "notes",
  // Primary contact
  contact_name: "contact_name",
  contact_email: "contact_email",
  email: "contact_email",
  contact_phone: "contact_phone",
  phone: "contact_phone",
  contact_title: "contact_title",
  title: "contact_title",
};

interface RawRow {
  [key: string]: unknown;
}

interface NormalisedRow {
  // Mirrors ImportRow on the server. Strings only — server parses bools.
  code: string;
  legal_name: string;
  category?: string;
  default_currency?: string;
  payment_terms?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  is_approved?: string;
  online_only?: string;
  notes?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_title?: string;
}

interface RowResult {
  row: number;
  code: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
}

type ImportMode = "import" | "upsert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const TEMPLATE_HEADERS = [
  "code",
  "legal_name",
  "category",
  "default_currency",
  "payment_terms",
  "address_line1",
  "address_line2",
  "city",
  "state_province",
  "postal_code",
  "country",
  "is_approved",
  "online_only",
  "notes",
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_title",
];

const TEMPLATE_SAMPLE_ROW = {
  code: "ACME",
  legal_name: "Acme Components Inc.",
  category: "distributor",
  default_currency: "USD",
  payment_terms: "Net 30, Credit Card",
  address_line1: "123 Industrial Way",
  address_line2: "Suite 400",
  city: "Toronto",
  state_province: "ON",
  postal_code: "M5V 2A8",
  country: "Canada",
  is_approved: "true",
  online_only: "false",
  notes: "Backup supplier for caps & resistors",
  contact_name: "Jane Smith",
  contact_email: "jane@acmecomponents.com",
  contact_phone: "+1 416 555 1212",
  contact_title: "Account Manager",
};

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const header = TEMPLATE_HEADERS.join(",");
    const sample = TEMPLATE_HEADERS.map(
      (h) =>
        `"${(TEMPLATE_SAMPLE_ROW as Record<string, string>)[h]?.replace(/"/g, '""') ?? ""}"`
    ).join(",");
    const blob = new Blob([`${header}\n${sample}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supplier-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const ws = XLSX.utils.json_to_sheet([TEMPLATE_SAMPLE_ROW], {
      header: TEMPLATE_HEADERS,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, "supplier-import-template.xlsx");
  }
}

function normaliseHeader(h: string): string | null {
  const key = h.toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  return COLUMN_ALIASES[key] ?? null;
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
    if (canon) headerMap.set(k, canon);
    else unknown.push(k);
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

export function ImportSuppliersDialog({ open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<NormalisedRow[]>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Mode: "import" = insert new only, skip existing codes (safe default).
  // "upsert" = update existing rows by code, insert new ones.
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
        toast.error("Could not recognise any columns. Download the template for the expected format.");
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
      const res = await fetch("/api/suppliers/import", {
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
      // Toast summarises by mode — upsert distinguishes created vs updated.
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
          <DialogTitle>Import suppliers</DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file. Each row creates one supplier and
            optionally a primary contact. Duplicate codes are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          {/* Template + file picker */}
          <div className="rounded-md border bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900">1. Download a template</p>
                <p className="text-xs text-gray-600">
                  Required columns: <code>code</code>, <code>legal_name</code>.
                  Everything else is optional.
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
                      Adds new suppliers. Rows whose code already exists are
                      skipped.
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
                      New codes are inserted; existing codes are{" "}
                      <strong>overwritten</strong> with the values in the file
                      (legal name, category, currency, payment terms, address,
                      approval/online flags, notes). Existing contacts are
                      preserved.
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
                  4. Preview — {parsedRows.length} row{parsedRows.length === 1 ? "" : "s"}
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
                      <th className="px-2 py-1">Code</th>
                      <th className="px-2 py-1">Legal name</th>
                      <th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Currency</th>
                      <th className="px-2 py-1">Approved</th>
                      <th className="px-2 py-1">Online</th>
                      <th className="px-2 py-1">Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                        <td className="px-2 py-1 font-mono">{r.code || "—"}</td>
                        <td className="px-2 py-1">{r.legal_name || "—"}</td>
                        <td className="px-2 py-1 text-gray-600">{r.category ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-600">{r.default_currency ?? "CAD"}</td>
                        <td className="px-2 py-1 text-gray-600">{r.is_approved ?? "false"}</td>
                        <td className="px-2 py-1 text-gray-600">{r.online_only ?? "false"}</td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.contact_name ? r.contact_name : "—"}
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
                  <div className="text-base font-semibold text-green-800">{summary.created}</div>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
                  <div className="text-blue-700">Updated</div>
                  <div className="text-base font-semibold text-blue-800">{summary.updated}</div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <div className="text-amber-700">Skipped</div>
                  <div className="text-base font-semibold text-amber-800">{summary.skipped}</div>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-2">
                  <div className="text-red-700">Errors</div>
                  <div className="text-base font-semibold text-red-800">{summary.errors}</div>
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-b bg-gray-50 text-left text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-1">Row</th>
                      <th className="px-2 py-1">Code</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={`${r.row}-${r.code}`} className="border-b last:border-b-0">
                        <td className="px-2 py-1 text-gray-500">{r.row}</td>
                        <td className="px-2 py-1 font-mono">{r.code || "—"}</td>
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
                        <td className="px-2 py-1 text-gray-600">{r.message ?? ""}</td>
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
                ? mode === "upsert" ? "Upserting…" : "Importing…"
                : `${mode === "upsert" ? "Upsert" : "Import"} ${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
