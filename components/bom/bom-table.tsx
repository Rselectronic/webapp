"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { McodeSelect } from "./mcode-select";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Search, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BomLine {
  id: string;
  line_number: number;
  quantity: number;
  reference_designator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  is_pcb: boolean;
  m_code: string | null;
  m_code_confidence: number | null;
  m_code_source: string | null;
  m_code_reasoning: string | null;
}

interface BomTableProps {
  lines: BomLine[];
  bomId: string;
}

/** Wraps a truncated cell in a tooltip to show the full value on hover. */
function CellWithTooltip({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) {
    return <span className="text-gray-400">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={`block truncate cursor-default ${className ?? ""}`}>
            {value}
          </span>
        }
      />
      <TooltipContent className="max-w-md break-words whitespace-pre-wrap">
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

export function BomTable({ lines: initialLines, bomId: _bomId }: BomTableProps) {
  const [lines, setLines] = useState(initialLines);
  const [search, setSearch] = useState("");
  const [activeMcodes, setActiveMcodes] = useState<Set<string>>(new Set());
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);

  async function handleDeleteLine(lineId: string, mpn: string | null) {
    const label = mpn ?? "this row";
    if (
      !window.confirm(
        `Delete row ${label}? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingLineId(lineId);
    try {
      const res = await fetch(`/api/bom/lines/${lineId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setLines((prev) => prev.filter((l) => l.id !== lineId));
      toast.success("Row deleted");
    } catch (err) {
      toast.error("Failed to delete row", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeletingLineId(null);
    }
  }

  // Sync local state when server-provided lines change (e.g. after classification + router.refresh())
  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  const nonPcb = lines.filter((l) => !l.is_pcb);
  const classified = nonPcb.filter((l) => l.m_code).length;
  const unclassified = nonPcb.length - classified;

  // Collect all M-codes actually present in the BOM, sorted by frequency desc.
  const availableMcodes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of nonPcb) {
      const code = line.m_code ?? "__UNCLASSIFIED__";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [nonPcb]);

  // Apply search + filters to compute what actually renders.
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => {
      // PCB rows: hidden when any filter is active (they aren't classifiable).
      if (line.is_pcb) {
        if (q || activeMcodes.size > 0 || unclassifiedOnly) return false;
        return true;
      }

      if (unclassifiedOnly && line.m_code) return false;

      if (activeMcodes.size > 0) {
        const code = line.m_code ?? "__UNCLASSIFIED__";
        if (!activeMcodes.has(code)) return false;
      }

      if (q) {
        const haystack = [
          line.mpn,
          line.description,
          line.reference_designator,
          line.cpc,
          line.manufacturer,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [lines, search, activeMcodes, unclassifiedOnly]);

  const totalComponentCount = nonPcb.length;
  const shownComponentCount = filteredLines.filter((l) => !l.is_pcb).length;

  function toggleMcode(code: string) {
    setActiveMcodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setActiveMcodes(new Set());
    setUnclassifiedOnly(false);
  }

  const hasActiveFilters = search.length > 0 || activeMcodes.size > 0 || unclassifiedOnly;

  async function handleMcodeChange(lineId: string, mcode: string) {
    const supabase = createClient();

    await supabase
      .from("bom_lines")
      .update({ m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual", m_code_reasoning: "Manual override" })
      .eq("id", lineId);

    // Learning loop — save to components table for future auto-classification
    const line = lines.find((l) => l.id === lineId);
    if (line?.mpn) {
      await supabase.from("components").upsert(
        {
          mpn: line.mpn,
          manufacturer: line.manufacturer ?? undefined,
          description: line.description ?? undefined,
          m_code: mcode,
          m_code_source: "manual",
        },
        { onConflict: "mpn,manufacturer" }
      );
    }

    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual", m_code_reasoning: "Manual override" }
          : l
      )
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary">{totalComponentCount} components</Badge>
          <Badge variant="default">{classified} classified</Badge>
          {unclassified > 0 && (
            <Badge variant="destructive">{unclassified} need review</Badge>
          )}
        </div>

        {/* Filter + search bar — always visible above the table */}
        <div className="rounded-lg border-2 border-blue-100 bg-blue-50/40 p-3 space-y-3 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            <Search className="h-3.5 w-3.5" />
            Filter &amp; Search
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search MPN, description, designator, CPC, manufacturer..."
                className="pl-8 pr-8 h-9 bg-white dark:bg-gray-950"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Switch
                checked={unclassifiedOnly}
                onCheckedChange={setUnclassifiedOnly}
              />
              <span>Show only unclassified</span>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2"
              >
                Clear filters
              </button>
            )}

            <div className="ml-auto text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {shownComponentCount}
              </span>{" "}
              of {totalComponentCount} components
            </div>
          </div>

          {availableMcodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-gray-500 mr-1">
                M-Code:
              </span>
              <button
                type="button"
                onClick={() => setActiveMcodes(new Set())}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  activeMcodes.size === 0
                    ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800"
                }`}
              >
                All
              </button>
              {availableMcodes.map(([code, count]) => {
                const active = activeMcodes.has(code);
                const label = code === "__UNCLASSIFIED__" ? "Unclassified" : code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleMcode(code)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : code === "__UNCLASSIFIED__"
                          ? "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800"
                    }`}
                  >
                    {label} <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-white overflow-x-auto dark:border-gray-800 dark:bg-gray-950">
          <Table className="min-w-[1400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 px-3 py-2.5">#</TableHead>
                <TableHead className="w-16 px-3 py-2.5">Qty</TableHead>
                <TableHead className="w-40 px-3 py-2.5">Designator</TableHead>
                <TableHead className="w-32 px-3 py-2.5">CPC</TableHead>
                <TableHead className="w-96 px-3 py-2.5">Description</TableHead>
                <TableHead className="w-44 px-3 py-2.5">MPN</TableHead>
                <TableHead className="w-32 px-3 py-2.5">Manufacturer</TableHead>
                <TableHead className="w-32 px-3 py-2.5">M-Code</TableHead>
                <TableHead className="w-64 px-3 py-2.5">Reasoning</TableHead>
                <TableHead className="w-20 px-3 py-2.5">Confidence</TableHead>
                <TableHead className="w-12 px-3 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    No components match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLines.map((line) => (
                  <TableRow
                    key={line.id}
                    className={
                      line.is_pcb
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : !line.m_code
                          ? "bg-orange-50/60 dark:bg-orange-950/20"
                          : ""
                    }
                  >
                    <TableCell className="px-3 py-2.5 text-xs text-gray-400">
                      {line.is_pcb ? "PCB" : line.line_number}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-sm">
                      {line.quantity}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs max-w-[160px]">
                      <CellWithTooltip value={line.reference_designator} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs max-w-[128px]">
                      <CellWithTooltip value={line.cpc} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs max-w-[384px]">
                      <CellWithTooltip value={line.description} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs max-w-[176px]">
                      <CellWithTooltip value={line.mpn} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs max-w-[128px]">
                      <CellWithTooltip value={line.manufacturer} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      {line.is_pcb ? (
                        <Badge variant="secondary" className="text-xs">PCB</Badge>
                      ) : (
                        <McodeSelect
                          value={line.m_code}
                          confidence={line.m_code_confidence}
                          source={line.m_code_source}
                          onSelect={(mcode) => handleMcodeChange(line.id, mcode)}
                        />
                      )}
                    </TableCell>
                    {/* Reasoning */}
                    <TableCell className="px-3 py-2.5">
                      {line.is_pcb ? null : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            line.m_code_source === "database" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                              : line.m_code_source === "rules" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                              : line.m_code_source === "api" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                              : line.m_code_source === "manual" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {line.m_code_source === "database" ? "DB"
                              : line.m_code_source === "rules" ? "Rule"
                              : line.m_code_source === "api" ? "AI"
                              : line.m_code_source === "manual" ? "Manual"
                              : "—"}
                          </span>
                          <div className="min-w-0 flex-1 text-xs text-gray-500">
                            <CellWithTooltip
                              value={
                                line.m_code_reasoning
                                  ? line.m_code_reasoning.replace("KEYWORD: ", "").replace(/^PAR-/, "R-")
                                  : null
                              }
                            />
                          </div>
                        </div>
                      )}
                    </TableCell>
                    {/* Confidence */}
                    <TableCell className="px-3 py-2.5">
                      {line.is_pcb || line.m_code_confidence == null ? null : (
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-12 rounded-full bg-gray-200 overflow-hidden dark:bg-gray-700">
                            <div
                              className={`h-full rounded-full ${
                                line.m_code_confidence >= 0.9 ? "bg-green-500"
                                  : line.m_code_confidence >= 0.7 ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${Math.round(line.m_code_confidence * 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono font-semibold ${
                            line.m_code_confidence >= 0.9 ? "text-green-700 dark:text-green-400"
                              : line.m_code_confidence >= 0.7 ? "text-yellow-700 dark:text-yellow-400"
                              : "text-red-700 dark:text-red-400"
                          }`}>
                            {Math.round(line.m_code_confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </TableCell>
                    {/* Actions */}
                    <TableCell className="px-3 py-2.5 text-right">
                      {line.is_pcb ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                          disabled={deletingLineId === line.id}
                          onClick={() => handleDeleteLine(line.id, line.mpn)}
                          aria-label="Delete row"
                        >
                          {deletingLineId === line.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
