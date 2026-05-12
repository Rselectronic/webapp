"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GitMerge } from "lucide-react";

type MergeLogEntry = {
  mpn: string;
  merged_into_line: number;
  file_name?: string | null;
  source?: {
    quantity: number;
    reference_designator: string;
    cpc: string | null;
    description: string;
    mpn: string;
    manufacturer: string;
  };
};

export function MergeLogPanel({ entries }: { entries: MergeLogEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!entries || entries.length === 0) return null;

  // Group by source file so the table is easier to scan when the BOM came
  // from multiple uploads (SMT + TH).
  const byFile = new Map<string, MergeLogEntry[]>();
  for (const e of entries) {
    const key = e.file_name ?? "(unknown file)";
    const arr = byFile.get(key) ?? [];
    arr.push(e);
    byFile.set(key, arr);
  }

  return (
    <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-900"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <GitMerge className="h-4 w-4 text-blue-500" />
        Merge log
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {entries.length} row{entries.length === 1 ? "" : "s"} absorbed
        </span>
      </button>

      {open && (
        <div className="border-t px-4 py-3 dark:border-gray-800">
          <p className="mb-3 text-xs text-gray-500">
            Source rows whose MPN matched an earlier row on the same file.
            Each row below was folded into the listed surviving line (its
            quantity was added and its designator joined).
          </p>
          <div className="space-y-4">
            {Array.from(byFile.entries()).map(([file, items]) => (
              <div key={file}>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {file}
                </div>
                <div className="overflow-x-auto rounded-md border dark:border-gray-800">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Qty</th>
                        <th className="px-3 py-2 text-left font-medium">Designator</th>
                        <th className="px-3 py-2 text-left font-medium">CPC</th>
                        <th className="px-3 py-2 text-left font-medium">MPN</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-left font-medium">Manufacturer</th>
                        <th className="px-3 py-2 text-right font-medium">Merged into line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((e, i) => {
                        const src = e.source;
                        return (
                          <tr
                            key={`${e.mpn}-${e.merged_into_line}-${i}`}
                            className={i > 0 ? "border-t dark:border-gray-800" : ""}
                          >
                            <td className="px-3 py-2 font-mono">{src?.quantity ?? "—"}</td>
                            <td className="px-3 py-2">{src?.reference_designator ?? "—"}</td>
                            <td className="px-3 py-2 font-mono">{src?.cpc ?? "—"}</td>
                            <td className="px-3 py-2 font-mono">{src?.mpn || e.mpn || "—"}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {src?.description ?? "—"}
                            </td>
                            <td className="px-3 py-2">{src?.manufacturer || "—"}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">
                              {e.merged_into_line}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
