"use client";

// ---------------------------------------------------------------------------
// CustomerQuoteBulkModal — paste a vendor RFQ response and apply prices to
// every matching BOM line at once.
//
// Accepted paste formats:
//   - TSV (default when copying from Excel/Sheets): one row per line, tab-
//     separated.
//   - CSV: comma-separated.
//
// Required headers (case-insensitive, any order): mpn, supplier, unit_price.
// Optional: currency, qty_break, valid_until, quote_ref, supplier_part_number.
//
// We preview the parsed rows + match count against the BOM before sending to
// the bulk endpoint, so the operator can spot column-mapping mistakes before
// 200 rows hit the cache.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BomLineLite {
  id: string;
  mpn: string | null;
  cpc: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  bomId: string;
  bomLines: BomLineLite[];
}

interface ParsedRow {
  index: number;
  mpn: string;
  supplier_name: string;
  unit_price: number;
  currency: string;
  qty_break?: number;
  valid_until?: string;
  quote_ref?: string;
  supplier_part_number?: string;
  // Status assigned during preview
  match: "in_bom" | "not_in_bom" | "invalid";
  reason?: string;
}

interface BulkResult {
  summary: { saved: number; invalid: number; not_in_bom: number; error: number };
  results: Array<{
    index: number;
    mpn: string;
    status: "saved" | "invalid" | "not_in_bom" | "error";
    reason?: string;
  }>;
}

function parsePaste(raw: string, bomKeys: Set<string>): ParsedRow[] {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Sniff delimiter: tab wins if either present. Falls back to comma.
  const firstLine = lines[0];
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const splitLine = (l: string): string[] => l.split(delim).map((c) => c.trim());

  // Header detection — first line MUST contain at least one of the required
  // headers. If it doesn't, we still parse positionally assuming the order
  // mpn, supplier, unit_price.
  const headerCells = splitLine(firstLine).map((c) => c.toLowerCase());
  const hasHeaders =
    headerCells.includes("mpn") ||
    headerCells.includes("supplier") ||
    headerCells.includes("unit_price") ||
    headerCells.includes("price");

  let header: string[];
  let dataLines: string[];
  if (hasHeaders) {
    header = headerCells;
    dataLines = lines.slice(1);
  } else {
    header = ["mpn", "supplier", "unit_price"];
    dataLines = lines;
  }

  const idx = (name: string): number => header.indexOf(name);
  const get = (cells: string[], col: number): string =>
    col >= 0 && col < cells.length ? cells[col] : "";

  const out: ParsedRow[] = [];
  for (let i = 0; i < dataLines.length; i++) {
    const cells = splitLine(dataLines[i]);
    const mpn = get(cells, idx("mpn"));
    const supplier_name =
      get(cells, idx("supplier")) ||
      get(cells, idx("supplier_name")) ||
      get(cells, idx("distributor"));
    const priceStr =
      get(cells, idx("unit_price")) || get(cells, idx("price"));
    const unit_price = parseFloat(priceStr);

    let match: ParsedRow["match"] = "in_bom";
    let reason: string | undefined;
    if (!mpn) {
      match = "invalid";
      reason = "missing mpn";
    } else if (!supplier_name) {
      match = "invalid";
      reason = "missing supplier";
    } else if (!Number.isFinite(unit_price) || unit_price <= 0) {
      match = "invalid";
      reason = "invalid unit_price";
    } else if (!bomKeys.has(mpn.toUpperCase())) {
      match = "not_in_bom";
      reason = "MPN/CPC not in this BOM";
    }

    const qbStr = get(cells, idx("qty_break"));
    const qb = qbStr ? parseInt(qbStr, 10) : NaN;
    const validRaw =
      get(cells, idx("valid_until")) || get(cells, idx("valid until"));
    const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validRaw) ? validRaw : undefined;

    out.push({
      index: i,
      mpn,
      supplier_name,
      unit_price: Number.isFinite(unit_price) ? unit_price : 0,
      currency: (get(cells, idx("currency")) || "CAD").toUpperCase(),
      qty_break: Number.isFinite(qb) && qb > 0 ? qb : undefined,
      valid_until: validUntil,
      quote_ref:
        get(cells, idx("quote_ref")) || get(cells, idx("ref")) || undefined,
      supplier_part_number:
        get(cells, idx("supplier_part_number")) ||
        get(cells, idx("spn")) ||
        undefined,
      match,
      reason,
    });
  }
  return out;
}

export function CustomerQuoteBulkModal({
  open,
  onClose,
  onSaved,
  bomId,
  bomLines,
}: Props) {
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const bomKeys = useMemo(() => {
    const s = new Set<string>();
    for (const l of bomLines) {
      if (l.mpn?.trim()) s.add(l.mpn.trim().toUpperCase());
      if (l.cpc?.trim()) s.add(l.cpc.trim().toUpperCase());
    }
    return s;
  }, [bomLines]);

  const parsed = useMemo(() => parsePaste(paste, bomKeys), [paste, bomKeys]);
  const counts = useMemo(() => {
    const out = { total: parsed.length, in_bom: 0, not_in_bom: 0, invalid: 0 };
    for (const r of parsed) {
      if (r.match === "in_bom") out.in_bom += 1;
      else if (r.match === "not_in_bom") out.not_in_bom += 1;
      else out.invalid += 1;
    }
    return out;
  }, [parsed]);

  if (!open) return null;

  const canSave = counts.in_bom > 0 && !busy;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Only ship the rows we judged in_bom — the endpoint will re-check, but
      // there's no point sending invalid rows over the wire.
      const rows = parsed
        .filter((r) => r.match === "in_bom")
        .map((r) => ({
          mpn: r.mpn,
          supplier_name: r.supplier_name,
          unit_price: r.unit_price,
          currency: r.currency,
          qty_break: r.qty_break,
          quote_ref: r.quote_ref,
          valid_until: r.valid_until,
          supplier_part_number: r.supplier_part_number,
        }));
      const res = await fetch("/api/pricing/customer-quote/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bom_id: bomId, rows }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Bulk save failed (${res.status})`);
      }
      const data = (await res.json()) as BulkResult;
      setResult(data);
      if (data.summary.saved > 0) onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Bulk import distributor quotes
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Paste a TSV or CSV with columns:{" "}
            <span className="font-mono">mpn, supplier, unit_price</span>{" "}
            (required) and{" "}
            <span className="font-mono">currency, qty_break, valid_until, quote_ref, supplier_part_number</span>{" "}
            (optional). Copy directly from Excel / Google Sheets.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Paste data
            </label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              disabled={busy}
              rows={8}
              placeholder={"mpn\tsupplier\tunit_price\tcurrency\tqty_break\tvalid_until\nC0805C104K5RACTU\tWMD\t0.042\tCAD\t100\t2026-06-01"}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-950"
            />
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-medium dark:bg-gray-800">
                  {counts.total} row{counts.total === 1 ? "" : "s"} parsed
                </span>
                <span className="rounded bg-green-50 px-2 py-0.5 text-green-700 dark:bg-green-950/30 dark:text-green-300">
                  {counts.in_bom} will be priced
                </span>
                {counts.not_in_bom > 0 && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {counts.not_in_bom} not in this BOM
                  </span>
                )}
                {counts.invalid > 0 && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {counts.invalid} invalid
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">MPN</th>
                      <th className="px-2 py-1 text-left font-medium">Supplier</th>
                      <th className="px-2 py-1 text-right font-medium">Price</th>
                      <th className="px-2 py-1 text-right font-medium">Qty</th>
                      <th className="px-2 py-1 text-left font-medium">Valid</th>
                      <th className="px-2 py-1 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr
                        key={r.index}
                        className="border-t border-gray-100 dark:border-gray-800"
                      >
                        <td className="px-2 py-1 font-mono">{r.mpn || "—"}</td>
                        <td className="px-2 py-1">{r.supplier_name || "—"}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {Number.isFinite(r.unit_price)
                            ? r.unit_price.toFixed(4)
                            : "—"}{" "}
                          {r.currency}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {r.qty_break ?? 1}
                        </td>
                        <td className="px-2 py-1">{r.valid_until ?? "—"}</td>
                        <td className="px-2 py-1">
                          {r.match === "in_bom" ? (
                            <span className="text-green-700 dark:text-green-300">
                              ✓ in BOM
                            </span>
                          ) : r.match === "not_in_bom" ? (
                            <span
                              className="text-amber-700 dark:text-amber-300"
                              title={r.reason}
                            >
                              skip
                            </span>
                          ) : (
                            <span
                              className="text-red-700 dark:text-red-300"
                              title={r.reason}
                            >
                              {r.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
              {result.summary.saved} saved
              {result.summary.not_in_bom > 0
                ? ` · ${result.summary.not_in_bom} skipped (not in BOM)`
                : ""}
              {result.summary.invalid > 0
                ? ` · ${result.summary.invalid} invalid`
                : ""}
              {result.summary.error > 0
                ? ` · ${result.summary.error} errored`
                : ""}
              . Run "Fetch Prices" or "Refresh" to see updated quotes.
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-800 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving {counts.in_bom} row{counts.in_bom === 1 ? "" : "s"}…
              </>
            ) : (
              `Save ${counts.in_bom} row${counts.in_bom === 1 ? "" : "s"}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
