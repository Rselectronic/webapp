"use client";

// ----------------------------------------------------------------------------
// HistoricImportWizard
//
// Two-step CSV import flow for /settings/historic-import:
//   1. Upload + Validate (dry-run) — server parses, validates every row,
//      returns either a list of errors OR a preview table + total count.
//   2. Commit — same payload, dry_run=0, server bulk-inserts the rows
//      with is_historic=true. Atomic: any error rejects the whole file.
//
// Currency is locked to CAD (legacy invoices are all CAD per the operator).
// FX rate stays at 1. Reports include these rows automatically.
// ----------------------------------------------------------------------------

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

type Mode = "idle" | "validating" | "preview" | "committing" | "done" | "error";

interface PreviewRow {
  customer_code: string;
  invoice_number: string;
  issued_date: string;
  due_date: string | null;
  paid_date: string | null;
  status: string;
  tax_region: string;
  currency: "CAD" | "USD";
  fx_rate_to_cad: number;
  subtotal: number;
  gst: number;
  qst: number;
  hst: number;
  freight: number;
  discount: number;
  total: number;
  legacy_reference: string | null;
  notes: string | null;
}

interface DryRunSuccess {
  dry_run: true;
  rows: PreviewRow[];
  total_rows: number;
  total_invoiced_cad: number;
  total_invoiced_usd: number;
  total_cad_equivalent: number;
  rows_cad: number;
  rows_usd: number;
}

interface CommitSuccess {
  dry_run: false;
  inserted: number;
  invoice_numbers: string[];
}

interface ApiError {
  error: string;
  errors?: { row: number; message: string }[];
}

const SAMPLE_CSV = [
  "customer_code,invoice_number,issued_date,currency,fx_rate_to_cad,subtotal,gst,qst,hst,freight,discount,total,tax_region,status,paid_date,legacy_reference,notes",
  "TLAN,INV-LEGACY-2023-001,2023-04-15,CAD,1,1000.00,50.00,99.75,0,0,0,1149.75,QC,paid,2023-05-12,DM File V11 r142,CAD invoice example",
  "CVNS,INV-LEGACY-2023-014,2023-06-02,CAD,1,2500.00,125.00,249.38,0,0,0,2874.38,QC,paid,2023-07-05,QB INV #4567,",
  "CVNS,INV-LEGACY-2023-022,2023-09-18,USD,1.3502,1500.00,0,0,0,0,0,1500.00,INTERNATIONAL,paid,2023-10-22,QB INV #4612,USD invoice — fx=BoC noon rate at issue date",
].join("\n");

export function HistoricImportWizard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DryRunSuccess | null>(null);
  const [errors, setErrors] = useState<ApiError | null>(null);
  const [committed, setCommitted] = useState<CommitSuccess | null>(null);

  function reset(keepFile: boolean = false) {
    if (!keepFile) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }
    setPreview(null);
    setErrors(null);
    setCommitted(null);
    setMode("idle");
  }

  async function postCsv(commit: boolean) {
    if (!file) return;
    setErrors(null);
    setPreview(null);
    setCommitted(null);
    setMode(commit ? "committing" : "validating");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/invoices/historic-import${commit ? "" : "?dry_run=1"}`,
        { method: "POST", body: form }
      );

      // Robust response parsing — if the server returned HTML (e.g. a
      // generic 413/500 page from the proxy) or an empty body, json()
      // throws or returns {}, which previously rendered as a blank error
      // card. Read the raw text first, then parse, falling back to a
      // human-readable message that includes the HTTP status so the
      // operator at least knows whether they hit a body-size limit, a
      // server crash, or a real validation error.
      const rawText = await res.text();
      let parsed: unknown = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok) {
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          setErrors(parsed as ApiError);
        } else {
          // Non-JSON failure — surface what we have. Trim the raw text in
          // case it's a giant HTML error page.
          const snippet = rawText
            ? rawText.length > 400
              ? rawText.slice(0, 400) + "…"
              : rawText
            : "(empty response body)";
          setErrors({
            error: `Server returned HTTP ${res.status} ${res.statusText || ""}`.trim() +
              (snippet ? ` — ${snippet}` : ""),
          });
        }
        setMode("error");
        return;
      }

      const data = parsed as DryRunSuccess | CommitSuccess;
      if (commit) {
        setCommitted(data as CommitSuccess);
        setMode("done");
        router.refresh();
      } else {
        setPreview(data as DryRunSuccess);
        setMode("preview");
      }
    } catch (err) {
      setErrors({
        error: err instanceof Error ? err.message : "Network error",
      });
      setMode("error");
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historic-invoices-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* CSV format / sample download */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CSV Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            One row per legacy invoice. Required columns:{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] dark:bg-gray-800">
              customer_code
            </code>
            ,{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] dark:bg-gray-800">
              invoice_number
            </code>
            ,{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] dark:bg-gray-800">
              issued_date
            </code>{" "}
            (YYYY-MM-DD), and{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] dark:bg-gray-800">
              total
            </code>{" "}
            (CAD).
          </p>
          <p>
            Optional columns:{" "}
            <span className="font-mono text-[12px] text-gray-500">
              subtotal, gst, qst, hst, freight, discount, currency,
              fx_rate_to_cad, tax_region, status, due_date, paid_date,
              legacy_reference, notes
            </span>
            . Status defaults to <code>paid</code>; tax_region defaults to{" "}
            <code>QC</code>; currency defaults to <code>CAD</code>.
          </p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="font-medium">USD invoices:</span> set{" "}
            <code>currency=USD</code> and supply{" "}
            <code>fx_rate_to_cad</code> as the Bank of Canada noon rate on
            the invoice&apos;s issue date (e.g. <code>1.3502</code>). All
            money columns stay in the row&apos;s native currency — don&apos;t
            pre-convert USD totals to CAD.
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadSample}
              type="button"
            >
              <Download className="mr-2 h-4 w-4" />
              Download sample CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setErrors(null);
              setCommitted(null);
              setMode("idle");
            }}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
          />
          {file ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="font-mono">{file.name}</span>
              <span>({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => postCsv(false)}
              disabled={!file || mode === "validating" || mode === "committing"}
            >
              {mode === "validating" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating…
                </>
              ) : (
                "Validate"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => reset(false)}
              disabled={mode === "validating" || mode === "committing"}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Errors */}
      {errors ? (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              {errors.error}
            </CardTitle>
          </CardHeader>
          {errors.errors && errors.errors.length > 0 ? (
            <CardContent>
              <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                {errors.errors.length} row error
                {errors.errors.length === 1 ? "" : "s"}:
              </p>
              <ul className="max-h-64 overflow-auto rounded-md border bg-red-50 px-3 py-2 text-xs dark:border-red-900 dark:bg-red-950/30">
                {errors.errors.map((e, i) => (
                  <li key={i} className="text-red-800 dark:text-red-300">
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">
                Atomic: nothing was inserted. Fix the file and re-upload.
              </p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {/* Preview + Commit */}
      {preview ? (
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" />
              2. Validated — ready to commit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Rows
                </p>
                <p className="text-lg font-semibold">{preview.total_rows}</p>
                <p className="text-[11px] text-gray-500">
                  {preview.rows_cad} CAD · {preview.rows_usd} USD
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  CAD invoiced
                </p>
                <p className="text-lg font-semibold">
                  {formatCurrency(preview.total_invoiced_cad)}
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  USD invoiced
                </p>
                <p className="text-lg font-semibold">
                  {preview.total_invoiced_usd > 0
                    ? `$${preview.total_invoiced_usd.toFixed(2)} USD`
                    : "—"}
                </p>
              </div>
              <div className="rounded-md border bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
                <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  CAD-equivalent total
                </p>
                <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(preview.total_cad_equivalent)}
                </p>
                <p className="text-[11px] text-blue-700/70 dark:text-blue-300/70">
                  USD rows × their FX rate
                </p>
              </div>
            </div>

            <div className="overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">Customer</th>
                    <th className="px-2 py-1.5 font-medium">Invoice #</th>
                    <th className="px-2 py-1.5 font-medium">Issued</th>
                    <th className="px-2 py-1.5 font-medium">Region</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="px-2 py-1.5 font-medium">Cur</th>
                    <th className="px-2 py-1.5 text-right font-medium">FX</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Subtotal
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">GST</th>
                    <th className="px-2 py-1.5 text-right font-medium">QST</th>
                    <th className="px-2 py-1.5 text-right font-medium">HST</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Total
                    </th>
                    <th className="px-2 py-1.5 font-medium">Legacy ref</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {preview.rows.slice(0, 200).map((r) => (
                    <tr
                      key={r.invoice_number}
                      className="border-t dark:border-gray-800"
                    >
                      <td className="px-2 py-1">{r.customer_code}</td>
                      <td className="px-2 py-1">{r.invoice_number}</td>
                      <td className="px-2 py-1">{r.issued_date}</td>
                      <td className="px-2 py-1">{r.tax_region}</td>
                      <td className="px-2 py-1">{r.status}</td>
                      <td className="px-2 py-1">{r.currency}</td>
                      <td className="px-2 py-1 text-right">
                        {r.currency === "USD"
                          ? r.fx_rate_to_cad.toFixed(4)
                          : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(r.subtotal)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(r.gst)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(r.qst)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatCurrency(r.hst)}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold">
                        {formatCurrency(r.total)}
                      </td>
                      <td className="px-2 py-1 text-gray-500">
                        {r.legacy_reference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 200 ? (
                <p className="border-t px-3 py-2 text-xs text-gray-500 dark:border-gray-800">
                  Showing first 200 of {preview.rows.length} rows. Commit will
                  insert all of them.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => postCsv(true)}
                disabled={mode === "committing"}
              >
                {mode === "committing" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Committing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Commit {preview.total_rows} historic invoice
                    {preview.total_rows === 1 ? "" : "s"}
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => reset(true)}>
                Re-validate after edits
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Done */}
      {committed ? (
        <Card className="border-green-300 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" />
              Committed — {committed.inserted} invoice
              {committed.inserted === 1 ? "" : "s"} imported
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              The Reports → Revenue section now includes these historic
              invoices in its FY totals. Operational queries (Pending Invoice,
              AR aging) deliberately filter them out so day-to-day workflows
              stay focused on live data.
            </p>
            <Button variant="outline" onClick={() => reset(false)}>
              Import another file
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
