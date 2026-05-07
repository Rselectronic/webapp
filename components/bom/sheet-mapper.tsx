"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ColumnMapping } from "./column-mapper";

// ---------------------------------------------------------------------------
// Click-to-map sheet view. Replaces the separate-dropdown column mapper with
// an Excel-like rendering of the first ~40 rows of the uploaded file. The
// operator picks a field chip from the left rail and clicks the matching
// column header cell; the chip is assigned to that column. Alternate MPN and
// Manufacturer chips support multi-select (click same cell again to remove).
// Row handles in the gutter let the operator pin the header row and the last
// data row. Everything outside the header→last-row window is greyed out.
// ---------------------------------------------------------------------------

interface Props {
  allRows: (string | number | null)[][];
  /** 1-indexed header row. */
  headerRow: number;
  /** 1-indexed last data row (inclusive). */
  lastRow: number;
  mapping: ColumnMapping;
  altMpnHeaders: string[];
  altMfrHeaders: string[];
  onHeaderRowChange: (row: number) => void;
  onLastRowChange: (row: number) => void;
  onMappingChange: (m: ColumnMapping) => void;
  onAltMpnHeadersChange: (h: string[]) => void;
  onAltMfrHeadersChange: (h: string[]) => void;
}

type FieldKey =
  | "qty"
  | "designator"
  | "mpn"
  | "description"
  | "manufacturer"
  | "cpc";

type PickerTarget = FieldKey | "alt_mpn" | "alt_mfr" | null;

interface FieldDef {
  key: FieldKey;
  label: string;
  required?: boolean;
  color: string;
}

const FIELDS: FieldDef[] = [
  { key: "qty", label: "Qty", required: true, color: "bg-blue-600 text-white" },
  { key: "designator", label: "Designator", required: true, color: "bg-indigo-600 text-white" },
  { key: "mpn", label: "MPN", required: true, color: "bg-purple-600 text-white" },
  { key: "description", label: "Description", color: "bg-slate-600 text-white" },
  { key: "manufacturer", label: "Manufacturer", color: "bg-teal-600 text-white" },
  { key: "cpc", label: "CPC", color: "bg-amber-600 text-white" },
];

// Render every row from the parsed sheet. The scroll container caps the
// visible viewport at max-h, but the operator can scroll the full BOM
// without the panel hiding tail rows. Earlier this was 40 to keep the DOM
// light; switching to "all rows" matches operator expectations (verify the
// data BOM end-to-end before committing the upload).

function excelColumn(idx: number): string {
  // 0 → A, 25 → Z, 26 → AA, etc.
  let s = "";
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function SheetMapper({
  allRows,
  headerRow,
  lastRow,
  mapping,
  altMpnHeaders,
  altMfrHeaders,
  onHeaderRowChange,
  onLastRowChange,
  onMappingChange,
  onAltMpnHeadersChange,
  onAltMfrHeadersChange,
}: Props) {
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const maxCols = useMemo(() => {
    // Trim trailing fully-empty columns — the XLSX reader often pads rows with
    // nulls out to the sheet's nominal width, producing dozens of blank columns
    // that force the user to scroll horizontally past nothing. Find the last
    // column with any non-empty cell in any row and stop there.
    let lastNonEmpty = -1;
    for (const r of allRows) {
      for (let i = r.length - 1; i > lastNonEmpty; i--) {
        if (String(r[i] ?? "").trim() !== "") {
          lastNonEmpty = i;
          break;
        }
      }
    }
    return Math.max(lastNonEmpty + 1, 1);
  }, [allRows]);

  const headerIdx = headerRow - 1;
  const lastIdx = lastRow - 1;

  const headers = useMemo(() => {
    const row = allRows[headerIdx] ?? [];
    return Array.from({ length: maxCols }, (_, i) =>
      String(row[i] ?? "").trim()
    );
  }, [allRows, headerIdx, maxCols]);

  // No cap — the operator wants to verify the entire sheet before uploading.
  const rowsToShow = allRows.length;

  // Reverse lookup: header name → fields that currently point to it.
  const assignedFields = useMemo(() => {
    const m = new Map<string, FieldKey[]>();
    for (const [k, v] of Object.entries(mapping)) {
      if (!v) continue;
      const arr = m.get(v) ?? [];
      arr.push(k as FieldKey);
      m.set(v, arr);
    }
    return m;
  }, [mapping]);

  const altMpnSet = useMemo(() => new Set(altMpnHeaders), [altMpnHeaders]);
  const altMfrSet = useMemo(() => new Set(altMfrHeaders), [altMfrHeaders]);

  const mappedCount = FIELDS.filter((f) => mapping[f.key]).length;

  const handleHeaderClick = (headerText: string) => {
    if (!picker) return;
    const t = headerText.trim();
    if (!t) {
      // Skip empty header cells — nothing meaningful to bind to.
      setPicker(null);
      return;
    }
    if (picker === "alt_mpn") {
      const next = altMpnSet.has(t)
        ? altMpnHeaders.filter((h) => h !== t)
        : [...altMpnHeaders, t];
      onAltMpnHeadersChange(next);
      return;
    }
    if (picker === "alt_mfr") {
      const next = altMfrSet.has(t)
        ? altMfrHeaders.filter((h) => h !== t)
        : [...altMfrHeaders, t];
      onAltMfrHeadersChange(next);
      return;
    }
    // Single-field: clear any other field currently holding this column.
    // Exception: CPC and MPN are allowed to share the SAME column. Many
    // customer BOMs omit a dedicated CPC, and the parser uses MPN as the CPC
    // fallback. So clicking a CPC picker on an MPN-mapped column (or vice
    // versa) must NOT wipe the sibling mapping.
    const nextMapping: ColumnMapping = { ...mapping };
    const cpcMpnPair = picker === "cpc" || picker === "mpn";
    for (const [k, v] of Object.entries(nextMapping)) {
      if (v !== t || k === picker) continue;
      const sibling =
        cpcMpnPair &&
        ((picker === "cpc" && k === "mpn") || (picker === "mpn" && k === "cpc"));
      if (sibling) continue;
      delete nextMapping[k];
    }
    nextMapping[picker] = t;
    onMappingChange(nextMapping);
    setPicker(null);
  };

  const clearField = (field: FieldKey) => {
    const next = { ...mapping };
    delete next[field];
    onMappingChange(next);
  };

  const colorFor = (field: FieldKey) =>
    FIELDS.find((f) => f.key === field)?.color ?? "bg-gray-500 text-white";

  return (
    <div className="rounded-lg border bg-white dark:bg-gray-950 dark:border-gray-800">
      {/* Top bar: status + row indicators */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Column Mapping</span>
          <span
            className={cn(
              "font-medium",
              mappedCount >= 3 ? "text-green-600" : "text-amber-600"
            )}
          >
            {mappedCount}/6 mapped
          </span>
          {picker && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
              Click a column header to assign{" "}
              {picker === "alt_mpn"
                ? "an Alternate MPN"
                : picker === "alt_mfr"
                  ? "an Alternate Manufacturer"
                  : FIELDS.find((f) => f.key === picker)?.label}
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => setPicker(null)}
              >
                cancel
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            Header row:{" "}
            <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
              {headerRow}
            </span>
          </span>
          <span>
            Last data row:{" "}
            <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
              {lastRow}
            </span>
          </span>
          <span>
            File rows: <span className="font-mono">{allRows.length}</span>
          </span>
        </div>
      </div>

      {/* Horizontal field rail — chips sit above the sheet so the sheet gets
          the full width of the card. Keeps horizontal scroll minimal. */}
      <div className="border-b px-3 py-2 bg-gray-50 dark:bg-gray-900/40 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {FIELDS.map((f) => {
            const assigned = mapping[f.key];
            const isActive = picker === f.key;
            return (
              <div
                key={f.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-xs transition",
                  isActive
                    ? "border-blue-500 ring-2 ring-blue-500/40 bg-white dark:bg-gray-950"
                    : assigned
                      ? "border-green-400 bg-white dark:bg-gray-950"
                      : "border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-700"
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5"
                  onClick={() => setPicker(isActive ? null : f.key)}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      assigned ? "bg-green-500" : "bg-gray-300"
                    )}
                  />
                  <span className="font-medium">
                    {f.label}
                    {f.required && <span className="text-red-500">*</span>}
                  </span>
                  {assigned && (
                    <span className="font-mono text-gray-500 max-w-[140px] truncate">
                      → {assigned}
                    </span>
                  )}
                </button>
                {assigned && (
                  <button
                    type="button"
                    className="rounded-full px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700"
                    onClick={() => clearField(f.key)}
                    aria-label={`Clear ${f.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
          {(
            [
              {
                key: "alt_mpn",
                label: "Alt MPNs",
                values: altMpnHeaders,
                onClear: () => onAltMpnHeadersChange([]),
              },
              {
                key: "alt_mfr",
                label: "Alt Mfr",
                values: altMfrHeaders,
                onClear: () => onAltMfrHeadersChange([]),
              },
            ] as const
          ).map(({ key, label, values, onClear }) => {
            const isActive = picker === key;
            return (
              <div
                key={key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-xs transition",
                  isActive
                    ? "border-blue-500 ring-2 ring-blue-500/40"
                    : "border-gray-200 dark:border-gray-700",
                  "bg-white dark:bg-gray-950"
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 font-medium"
                  onClick={() => setPicker(isActive ? null : key)}
                >
                  {label}
                  <span className="font-normal text-gray-500">
                    ({values.length})
                  </span>
                </button>
                {values.length > 0 && (
                  <button
                    type="button"
                    className="rounded-full px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700"
                    onClick={onClear}
                  >
                    clear
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          Click a chip above, then click the matching column header in the
          sheet below.
        </p>
      </div>

      {/* Sheet */}
      <div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900">
              <tr>
                <th className="sticky left-0 z-20 w-12 border-b border-r px-2 py-1 text-center text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-gray-900 dark:border-gray-800">
                  #
                </th>
                {Array.from({ length: maxCols }, (_, i) => (
                  <th
                    key={i}
                    className="border-b border-r px-2 py-1 text-center text-[10px] font-mono text-gray-500 dark:border-gray-800"
                  >
                    {excelColumn(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.slice(0, rowsToShow).map((row, rIdx) => {
                const isHeader = rIdx === headerIdx;
                const outside = rIdx < headerIdx || rIdx > lastIdx;
                const isHovered = hoverRow === rIdx;
                return (
                  <tr
                    key={rIdx}
                    onMouseEnter={() => setHoverRow(rIdx)}
                    onMouseLeave={() => setHoverRow((h) => (h === rIdx ? null : h))}
                    className={cn(
                      outside && "opacity-40",
                      isHeader && "bg-yellow-50 dark:bg-yellow-950/30"
                    )}
                  >
                    {/* Row gutter with quick set actions on hover */}
                    <td
                      className={cn(
                        "sticky left-0 z-[5] border-b border-r px-1 py-0.5 text-center font-mono text-[10px] align-middle",
                        "bg-gray-50 dark:bg-gray-900/60 dark:border-gray-800",
                        isHeader && "bg-yellow-100 dark:bg-yellow-950/50"
                      )}
                      style={{ minWidth: 64 }}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="text-gray-500">{rIdx + 1}</span>
                        {isHovered && (
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              title="Set this row as the header row"
                              className="rounded bg-yellow-200 px-1 text-[9px] leading-none hover:bg-yellow-300 dark:bg-yellow-900 dark:hover:bg-yellow-800"
                              onClick={() => onHeaderRowChange(rIdx + 1)}
                            >
                              H
                            </button>
                            <button
                              type="button"
                              title="Set this row as the last data row"
                              className="rounded bg-gray-200 px-1 text-[9px] leading-none hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
                              onClick={() => onLastRowChange(rIdx + 1)}
                            >
                              L
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Data cells */}
                    {Array.from({ length: maxCols }, (_, cIdx) => {
                      const value = String(row[cIdx] ?? "");
                      if (isHeader) {
                        const headerText = value.trim();
                        const assigned = assignedFields.get(headerText) ?? [];
                        const isAltMpn = altMpnSet.has(headerText);
                        const isAltMfr = altMfrSet.has(headerText);
                        const isTarget =
                          picker !== null && headerText.length > 0;
                        return (
                          <td
                            key={cIdx}
                            onClick={() => handleHeaderClick(value)}
                            className={cn(
                              "border-b border-r px-1.5 py-0.5 font-semibold align-top dark:border-gray-800",
                              isTarget && "cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40",
                              !headerText && "text-gray-300"
                            )}
                            style={{ maxWidth: 140, minWidth: 72 }}
                            title={headerText}
                          >
                            <div className="flex flex-col gap-0.5 overflow-hidden">
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {headerText || <em className="font-normal">(empty)</em>}
                              </span>
                              {(assigned.length > 0 || isAltMpn || isAltMfr) && (
                                <div className="flex flex-wrap gap-1">
                                  {assigned.map((f) => (
                                    <span
                                      key={f}
                                      className={cn(
                                        "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium",
                                        colorFor(f)
                                      )}
                                    >
                                      {FIELDS.find((x) => x.key === f)?.label}
                                    </span>
                                  ))}
                                  {isAltMpn && (
                                    <span className="inline-flex items-center rounded-full bg-purple-200 text-purple-900 dark:bg-purple-900/60 dark:text-purple-100 px-1.5 py-0 text-[10px] font-medium">
                                      Alt MPN
                                    </span>
                                  )}
                                  {isAltMfr && (
                                    <span className="inline-flex items-center rounded-full bg-teal-200 text-teal-900 dark:bg-teal-900/60 dark:text-teal-100 px-1.5 py-0 text-[10px] font-medium">
                                      Alt Mfr
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cIdx}
                          className={cn(
                            "border-b border-r px-1.5 py-0.5 overflow-hidden text-ellipsis whitespace-nowrap dark:border-gray-800",
                            rIdx === lastIdx && "border-b-2 border-b-blue-500"
                          )}
                          style={{ maxWidth: 140 }}
                          title={value}
                        >
                          {value || <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-gray-500 border-t dark:border-gray-800">
            Showing all {allRows.length} row{allRows.length === 1 ? "" : "s"}.
            Scroll inside the table to inspect. Header + last-row selection
            still applies to the full file.
          </div>
        </div>
      </div>
    </div>
  );
}
