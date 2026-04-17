"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STANDARD_FIELDS = [
  { key: "qty", label: "Qty", required: true },
  { key: "designator", label: "Designator", required: true },
  { key: "cpc", label: "CPC", required: false },
  { key: "description", label: "Description", required: false },
  { key: "mpn", label: "MPN", required: true },
  { key: "manufacturer", label: "Manufacturer", required: false },
] as const;

type FieldKey = (typeof STANDARD_FIELDS)[number]["key"];

export interface ColumnMapping {
  [field: string]: string; // field key → header name
}

interface ColumnMapperProps {
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  /** 1-indexed header row number as displayed to the user */
  headerRow: number;
  /** 1-indexed last row to process (inclusive) */
  lastRow: number;
  /** Total number of rows in the file */
  totalRows: number;
  onHeaderRowChange: (row: number) => void;
  onLastRowChange: (row: number) => void;
}

export function ColumnMapper({
  headers,
  sampleRows,
  mapping,
  onMappingChange,
  headerRow,
  lastRow,
  totalRows,
  onHeaderRowChange,
  onLastRowChange,
}: ColumnMapperProps) {
  const usedHeaders = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean)),
    [mapping]
  );

  function handleFieldChange(field: FieldKey, header: string) {
    const next = { ...mapping };
    if (header === "__none__") {
      delete next[field];
    } else {
      next[field] = header;
    }
    onMappingChange(next);
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const requiredMet = STANDARD_FIELDS.filter((f) => f.required).every(
    (f) => mapping[f.key]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Column Mapping
        </h3>
        <span
          className={`text-xs ${
            requiredMet
              ? "text-green-600"
              : "text-orange-600"
          }`}
        >
          {mappedCount}/{STANDARD_FIELDS.length} mapped
          {!requiredMet && " — Qty, Designator, MPN required"}
        </span>
      </div>

      {/* Row range controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="space-y-1">
          <Label htmlFor="header-row" className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Header Row
          </Label>
          <Input
            id="header-row"
            type="number"
            min={1}
            max={totalRows}
            value={headerRow}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= totalRows) onHeaderRowChange(v);
            }}
            className="h-8 w-20 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="last-row" className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Last Row to Process
          </Label>
          <Input
            id="last-row"
            type="number"
            min={headerRow + 1}
            max={totalRows}
            value={lastRow}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= headerRow + 1 && v <= totalRows) onLastRowChange(v);
            }}
            className="h-8 w-24 text-xs"
          />
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          {totalRows} rows in file — data rows {headerRow + 1}–{lastRow}
        </p>
      </div>

      {/* Mapping dropdowns */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STANDARD_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {field.label}
              {field.required && (
                <span className="ml-0.5 text-red-500">*</span>
              )}
            </label>
            <Select
              value={mapping[field.key] ?? "__none__"}
              onValueChange={(v) => { if (v) handleFieldChange(field.key, v); }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="— not mapped —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-gray-400">— not mapped —</span>
                </SelectItem>
                {headers.map((h, i) => {
                  const taken =
                    usedHeaders.has(h) && mapping[field.key] !== h;
                  return (
                    <SelectItem
                      key={i}
                      value={h}
                      disabled={taken}
                    >
                      {h || `Column ${i + 1}`}
                      {taken && " (used)"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto rounded border bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
              <th className="px-2 py-1.5 text-left text-gray-500 w-8">#</th>
              {headers.map((h, i) => {
                const mappedTo = Object.entries(mapping).find(
                  ([, v]) => v === h
                );
                return (
                  <th
                    key={i}
                    className={`px-2 py-1.5 text-left ${
                      mappedTo
                        ? "text-blue-700 dark:text-blue-300 font-semibold"
                        : "text-gray-400"
                    }`}
                  >
                    <div>{h || `Col ${i + 1}`}</div>
                    {mappedTo && (
                      <div className="text-[10px] font-normal text-blue-500">
                        → {STANDARD_FIELDS.find((f) => f.key === mappedTo[0])?.label}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b last:border-0 dark:border-gray-800"
              >
                <td className="px-2 py-1 text-gray-400">{headerRow + 1 + ri}</td>
                {headers.map((h, ci) => {
                  const mappedTo = Object.entries(mapping).find(
                    ([, v]) => v === h
                  );
                  return (
                    <td
                      key={ci}
                      className={`px-2 py-1 max-w-[200px] truncate ${
                        mappedTo
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-400"
                      }`}
                      title={row[ci] ?? ""}
                    >
                      {row[ci] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
