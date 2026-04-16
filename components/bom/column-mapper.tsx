"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

export function ColumnMapper({
  headers,
  sampleRows,
  mapping,
  onMappingChange,
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
                <td className="px-2 py-1 text-gray-400">{ri + 1}</td>
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
