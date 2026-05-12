"use client";

import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
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
import { MCodeChart } from "./mcode-chart";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { Search, X, Trash2, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Check } from "lucide-react";
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
  pin_count: number | null;
  m_code_approved_by?: string | null;
  m_code_approved_at?: string | null;
}

interface BomTableProps {
  lines: BomLine[];
  bomId: string;
  customerId?: string;
  alternatesByLineId?: Record<
    string,
    Array<{ mpn: string; manufacturer: string | null; source: string }>
  >;
}

function sourceLabel(source: string): string {
  if (source === "customer") return "Customer alternate";
  if (source === "rs_alt") return "RS alternate";
  if (source === "operator") return "Operator-added";
  return source;
}

/**
 * Wraps a truncated cell in a tooltip to show the full value on hover.
 *
 * Placement details that fix the mis-anchored-arrow issue:
 * - The truncated span is still `block truncate` so ellipsis works, but the
 *   tooltip is anchored to the START (left edge) of that span instead of the
 *   default center. Because the visible text is left-aligned inside a wide
 *   table cell, center-anchoring made the tooltip look floating in space.
 * - `sideOffset` bumped up so the bubble clears the row above instead of
 *   crowding its border.
 * - `alignOffset` shifts the tooltip 8px right so the arrow lines up with
 *   where the text actually starts (after the cell padding), not the exact
 *   edge of the <td>.
 */
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
      <TooltipContent
        side="top"
        align="start"
        sideOffset={8}
        alignOffset={8}
        className="max-w-md break-words whitespace-pre-wrap"
      >
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

type SortField =
  | "m_code"
  | "cpc"
  | "qty"
  | "mpn"
  | "manufacturer"
  | "designator"
  | "description"
  | null;
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Column layout — percentages sum to 100 so the table always fills its
// container on first load with zero horizontal scroll. Users can drag the
// resize handle on any column's right edge to rebalance width against the
// next column.
// ---------------------------------------------------------------------------

type ColKey =
  | "num"
  | "qty"
  | "designator"
  | "cpc"
  | "mpn"
  | "description"
  | "manufacturer"
  | "m_code"
  | "th_pins"
  | "reasoning"
  | "confidence"
  | "actions";

const COL_ORDER: ColKey[] = [
  "num",
  "qty",
  "designator",
  "cpc",
  "mpn",
  "description",
  "manufacturer",
  "m_code",
  "th_pins",
  "reasoning",
  "confidence",
  "actions",
];

const COL_INITIAL_PCT: Record<ColKey, number> = {
  num: 3,
  qty: 4,
  designator: 10,
  cpc: 8,
  description: 18,
  mpn: 12,
  manufacturer: 10,
  m_code: 8,
  th_pins: 5,
  reasoning: 12,
  confidence: 7,
  actions: 3,
};

/** Minimum column width in pixels — drag can't shrink below this. */
const COL_MIN_PX = 40;

export function BomTable({ lines: initialLines, bomId, customerId, alternatesByLineId }: BomTableProps) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [search, setSearch] = useState("");
  const [activeMcodes, setActiveMcodes] = useState<Set<string>>(new Set());
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  // AI-only filter: show only rows the classifier API tagged
  // (m_code_source === "ai"). Useful for verifying AI picks before locking
  // an m_code with the operator's manual review pass.
  const [aiOnly, setAiOnly] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  // AI-approval workflow state. Set of line IDs currently being approved
  // (so we can disable the per-row button + show a spinner) and a flag for
  // the bulk-approve action.
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Column widths in absolute pixels. On first mount we measure the wrapping
  // container and seed these from COL_INITIAL_PCT so every column fits without
  // horizontal scroll. After that, dragging a resize handle grows or shrinks
  // ONLY that column; the table's total width changes, and the container's
  // overflow-x-auto kicks in naturally when the table exceeds the viewport.
  const [colWidthPx, setColWidthPx] = useState<Record<ColKey, number> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const resizeDrag = useRef<{ col: ColKey; startX: number; startPx: number } | null>(null);

  // Seed pixel widths from the container's width on first render so the
  // initial layout fills the viewport exactly. We don't re-run on container
  // resize — the goal is a stable starting layout that the user then shapes.
  useLayoutEffect(() => {
    if (colWidthPx !== null) return;
    const w = containerRef.current?.clientWidth ?? 0;
    if (w <= 0) return;
    const next: Record<ColKey, number> = {} as Record<ColKey, number>;
    for (const key of COL_ORDER) {
      next[key] = Math.max(COL_MIN_PX, Math.round((COL_INITIAL_PCT[key] / 100) * w));
    }
    setColWidthPx(next);
  }, [colWidthPx]);

  const handleResizeStart = useCallback(
    (col: ColKey, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!colWidthPx) return;
      resizeDrag.current = {
        col,
        startX: e.clientX,
        startPx: colWidthPx[col],
      };

      const onMove = (ev: MouseEvent) => {
        const drag = resizeDrag.current;
        if (!drag) return;
        const deltaPx = ev.clientX - drag.startX;
        const newPx = Math.max(COL_MIN_PX, drag.startPx + deltaPx);
        setColWidthPx((prev) => (prev ? { ...prev, [drag.col]: newPx } : prev));
      };
      const onUp = () => {
        resizeDrag.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      // Keep the col-resize cursor through the whole drag even when the mouse
      // strays off the thin handle strip.
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [colWidthPx]
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  async function confirmDeleteLine() {
    if (!deleteTarget) return;
    const lineId = deleteTarget.id;
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
      // Ask the server page to re-fetch so the 4 summary tiles above the
      // table (Components / Classified / Need Review / Merged Lines) update.
      // Without this, they stay pinned to the server-rendered snapshot.
      router.refresh();
      setDeleteTarget(null);
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

  // Qty=0 lines are not-installed placeholders — kept in the table so
  // production sees the empty designators, but excluded from classification
  // stats since they intentionally don't get M-coded. The PCB row is now
  // INCLUDED (qty>0, m_code=APCB) so the Components / Classified tiles
  // reflect every billable line on the board.
  const classifiable = lines.filter((l) => l.quantity > 0);
  const thLines = classifiable.filter((l) => l.m_code === "TH");
  const thMissingPins = thLines.filter(
    (l) => l.pin_count === null || l.pin_count === undefined
  ).length;

  // Collect all M-codes actually present in the BOM, sorted by frequency desc.
  // Qty=0 lines are excluded so the filter pill counts match the summary badges.
  // PCB rows (m_code = APCB) ARE included so the operator can filter to them
  // — handy when they want to verify which row is currently tagged as the
  // PCB before deciding to keep or re-tag it.
  // Rows the AI tagged but the operator hasn't approved yet. Drives the
  // bulk-approve banner above the table and gates the "Start Quote" button
  // (downstream — handled by the page that owns StartQuoteButton).
  const pendingAiLines = useMemo(
    () => lines.filter((l) => l.m_code_source === "ai"),
    [lines]
  );

  const availableMcodes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of classifiable) {
      const code = line.m_code ?? "__UNCLASSIFIED__";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [classifiable]);

  // Apply search + filters + sorting to compute what actually renders.
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = lines.filter((line) => {
      // PCB rows participate in search + m_code filters just like any other
      // row. Operators wanted to be able to "Filter by APCB" and see the
      // PCB row, and to find a misclassified PCB by typing its CPC / MPN.
      //
      // Qty=0 rows are "not installed" placeholders, not unclassified
      // components — exclude them from BOTH the "Unclassified Only" toggle
      // and the __UNCLASSIFIED__ filter pill so the unclassified bucket
      // matches what actually needs human review.
      if (unclassifiedOnly && (line.m_code || line.quantity <= 0)) return false;

      // AI-only: filter to rows the classifier API tagged. PCB rows with
      // m_code_source "auto" don't count — only "ai" rows survive this
      // filter so the operator can review what the AI actually picked.
      if (aiOnly && line.m_code_source !== "ai") return false;

      if (activeMcodes.size > 0) {
        const code = line.m_code ?? "__UNCLASSIFIED__";
        if (!activeMcodes.has(code)) return false;
        if (code === "__UNCLASSIFIED__" && line.quantity <= 0) return false;
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

    if (sortField) {
      filtered.sort((a, b) => {
        if (a.is_pcb) return -1;
        if (b.is_pcb) return 1;
        let aVal: string | number = "";
        let bVal: string | number = "";
        if (sortField === "qty") {
          aVal = a.quantity;
          bVal = b.quantity;
        } else if (sortField === "designator") {
          // SortField uses "designator"; the backing field is reference_designator.
          aVal = (a.reference_designator ?? "").toLowerCase();
          bVal = (b.reference_designator ?? "").toLowerCase();
        } else {
          // "m_code" | "cpc" | "mpn" | "manufacturer" | "description" —
          // all map directly to a string field on BomLine.
          aVal = (a[sortField] ?? "").toLowerCase();
          bVal = (b[sortField] ?? "").toLowerCase();
        }
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [lines, search, activeMcodes, unclassifiedOnly, aiOnly, sortField, sortDir]);

  // Totals displayed in the summary row exclude qty=0 (not-installed) lines.
  // PCB rows are included (they're a real line on the board).
  const totalComponentCount = classifiable.length;
  const shownComponentCount = filteredLines.filter((l) => l.quantity > 0).length;

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
    setAiOnly(false);
  }

  const hasActiveFilters =
    search.length > 0 || activeMcodes.size > 0 || unclassifiedOnly || aiOnly;

  async function handlePinCountChange(lineId: string, rawValue: string) {
    const trimmed = rawValue.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 9999)) {
      toast.error("Invalid pin count", { description: "Enter a whole number between 0 and 9999." });
      return;
    }

    // Optimistic update
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, pin_count: parsed } : l))
    );

    const res = await fetch(`/api/bom/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_count: parsed }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Failed to save pin count", {
        description: data.error ?? `Save failed (${res.status})`,
      });
      // Rollback: re-sync from server copy on next refresh. For now best-effort revert to initial value.
      const initial = initialLines.find((l) => l.id === lineId);
      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId ? { ...l, pin_count: initial?.pin_count ?? null } : l
        )
      );
    }
  }

  /**
   * Approve one or more AI-classified m_codes. The server flips
   * m_code_source from "ai" → "manual", stamps approved_by + approved_at,
   * and writes the m_code to the global components cache + per-customer
   * override so the next BOM with the same CPC skips the AI call.
   */
  async function approveLines(lineIds: string[]) {
    if (lineIds.length === 0) return;
    const bulk = lineIds.length > 1;
    if (bulk) setBulkApproving(true);
    else setApprovingIds((s) => new Set(s).add(lineIds[0]));

    try {
      const res = await fetch(`/api/bom/${bomId}/approve-mcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: lineIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const data = (await res.json()) as { approved: number; approved_at: string };
      const nowIso = data.approved_at ?? new Date().toISOString();
      setLines((prev) =>
        prev.map((l) =>
          lineIds.includes(l.id)
            ? {
                ...l,
                m_code_source: "manual",
                m_code_approved_at: nowIso,
              }
            : l
        )
      );
      toast.success(
        bulk
          ? `Approved ${data.approved} AI classification${data.approved === 1 ? "" : "s"}`
          : "AI classification approved"
      );
      router.refresh();
    } catch (err) {
      toast.error("Approval failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (bulk) setBulkApproving(false);
      else setApprovingIds((s) => {
        const next = new Set(s);
        for (const id of lineIds) next.delete(id);
        return next;
      });
    }
  }

  async function handleMcodeChange(lineId: string, mcode: string) {
    const supabase = createClient();

    // Keep is_pcb in sync with the m_code choice in BOTH directions:
    //   APCB → is_pcb = true  (so all "skip PCBs" predicates catch it)
    //   any other code → is_pcb = false (operator is fixing a wrong PCB tag)
    const isPcb = mcode === "APCB";

    await supabase
      .from("bom_lines")
      .update({
        m_code: mcode,
        m_code_confidence: 1.0,
        m_code_source: "manual",
        m_code_reasoning: "Manual override",
        is_pcb: isPcb,
      })
      .eq("id", lineId);

    // Learning loop — save to components table for future auto-classification.
    // Key on CPC (customer part code); fall back to MPN when the BOM has no
    // CPC column, matching the classifier's lookup rule.
    const line = lines.find((l) => l.id === lineId);
    const lookupKey = line?.cpc || line?.mpn;
    if (lookupKey) {
      await supabase.from("components").upsert(
        {
          cpc: lookupKey,
          manufacturer: line?.manufacturer ?? undefined,
          description: line?.description ?? undefined,
          m_code: mcode,
          m_code_source: "manual",
        },
        { onConflict: "cpc,manufacturer" }
      );
    }

    // Also write to the per-customer procurement log. customer_parts is the
    // source of truth for Layer-1 classification going forward — when the
    // same CPC turns up on this customer's next BOM, the classifier reads
    // `m_code_manual` from here before falling back to the global
    // components cache.
    if (customerId && line?.cpc) {
      await supabase.from("customer_parts").upsert(
        {
          customer_id: customerId,
          cpc: line.cpc,
          original_mpn: line.mpn ?? null,
          original_manufacturer: line.manufacturer ?? null,
          m_code_manual: mcode,
          m_code_manual_updated_at: new Date().toISOString(),
        },
        { onConflict: "customer_id,cpc" }
      );
    }

    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              m_code: mcode,
              m_code_confidence: 1.0,
              m_code_source: "manual",
              m_code_reasoning: "Manual override",
              is_pcb: isPcb,
            }
          : l
      )
    );

    // Ask the server page to re-fetch so the 4 summary tiles above the table
    // (Components / Classified / Need Review / Merged Lines) reflect the new
    // m_code. Without this they stay pinned to the server-rendered snapshot.
    router.refresh();
  }

  // Live M-Code distribution — recomputes whenever lines change. Excludes
  // qty=0 placeholders so they don't inflate the Unclassified bucket. The
  // PCB row is INCLUDED (it's m_code=APCB) so the donut sums to the same
  // total as the Components tile.
  const mcodeDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const code = line.m_code ?? "Unclassified";
      dist[code] = (dist[code] ?? 0) + 1;
    }
    return dist;
  }, [lines]);

  const hasClassifiedForChart = useMemo(
    () => Object.keys(mcodeDistribution).some((k) => k !== "Unclassified"),
    [mcodeDistribution]
  );

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-4">
        {/* TH pin warning — surfaces only the unique signal not already in
            the stat tiles above. Components/Classified/Need-Review counts
            live in the cards; repeating them here was clutter. TH-parts
            count is in the M-Code Distribution chart's APCB/TH slices. */}
        {thMissingPins > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="destructive">
              {thMissingPins} missing TH pin{thMissingPins === 1 ? "" : "s"}
            </Badge>
          </div>
        )}

        {/* Live M-Code Distribution Chart */}
        {hasClassifiedForChart && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">M-Code Distribution</CardTitle>
              <CardDescription>
                Classification breakdown of {totalComponentCount} components
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MCodeChart distribution={mcodeDistribution} />
            </CardContent>
          </Card>
        )}

        {/* AI-approval banner — appears when the classifier tagged rows that
            no one has signed off on yet. Bulk approve flips them to
            "manual" and caches the m_codes globally + per-customer so the
            next BOM with the same CPC skips the AI entirely. */}
        {pendingAiLines.length > 0 && (
          <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/30 flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="flex-1 min-w-[260px] text-sm">
              <span className="font-semibold text-orange-900 dark:text-orange-100">
                {pendingAiLines.length} AI classification
                {pendingAiLines.length === 1 ? "" : "s"} pending approval
              </span>
              <span className="ml-2 text-orange-800/80 dark:text-orange-200/80 text-xs">
                Review and approve before starting the quote. Approved m-codes
                are cached so the same CPC won&apos;t re-hit the AI.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAiOnly(true)}
              className="bg-white dark:bg-gray-900"
            >
              Review
            </Button>
            <Button
              size="sm"
              onClick={() => approveLines(pendingAiLines.map((l) => l.id))}
              disabled={bulkApproving}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {bulkApproving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Approve all
            </Button>
          </div>
        )}

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

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Switch checked={aiOnly} onCheckedChange={setAiOnly} />
              <span>Show only AI-classified</span>
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

        <div
          ref={containerRef}
          className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950 overflow-x-auto"
        >
          {/* table-fixed + per-col pixel widths give us a predictable layout.
              Table width = sum of col widths — so resizing any column grows
              the total and lets the container's overflow-x-auto scroll in. */}
          <Table
            ref={tableRef}
            className="table-fixed"
            style={
              colWidthPx
                ? { width: Object.values(colWidthPx).reduce((a, b) => a + b, 0) }
                : { width: "100%" }
            }
          >
            <colgroup>
              {COL_ORDER.map((key) => (
                <col
                  key={key}
                  style={
                    colWidthPx
                      ? { width: `${colWidthPx[key]}px` }
                      : { width: `${COL_INITIAL_PCT[key]}%` }
                  }
                />
              ))}
            </colgroup>
            <TableHeader>
              <TableRow>
                <HeadCell colKey="num" label="#" onResizeStart={handleResizeStart} />
                <HeadCell colKey="qty" label="Qty" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="designator" label="Designator" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="cpc" label="CPC" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="mpn" label="MPN" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="description" label="Description" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="manufacturer" label="Manufacturer" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="m_code" label="M-Code" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} onResizeStart={handleResizeStart} />
                <HeadCell colKey="th_pins" label="TH Pins" onResizeStart={handleResizeStart} />
                <HeadCell colKey="reasoning" label="Reasoning" onResizeStart={handleResizeStart} />
                <HeadCell colKey="confidence" label="Confidence" onResizeStart={handleResizeStart} />
                <HeadCell colKey="actions" label="" srLabel="Actions" align="right" onResizeStart={handleResizeStart} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
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
                      {line.line_number}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-sm">
                      {line.quantity}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs">
                      <CellWithTooltip value={line.reference_designator} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs">
                      <CellWithTooltip value={line.cpc} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0 flex-1">
                          <CellWithTooltip value={line.mpn} />
                        </div>
                        {(() => {
                          // Show a single "+N" pill (never the alts themselves)
                          // so every row stays the same height. Hover the pill
                          // to read the full alternate list with manufacturer
                          // and source labels.
                          const alts = alternatesByLineId?.[line.id];
                          if (!alts || alts.length === 0) return null;
                          return (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="shrink-0 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-400 cursor-default">
                                    +{alts.length}
                                  </span>
                                }
                              />
                              <TooltipContent side="top" align="start" sideOffset={6} className="max-w-xs break-words whitespace-pre-wrap">
                                {alts
                                  .map(
                                    (a) =>
                                      `${a.mpn}${a.manufacturer ? ` (${a.manufacturer})` : ""} — ${sourceLabel(a.source)}`,
                                  )
                                  .join("\n")}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs">
                      <CellWithTooltip value={line.description} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs">
                      <CellWithTooltip value={line.manufacturer} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      {/* Qty=0 rows are "not installed" placeholders kept in
                          the table for visibility only — they don't need a
                          classification, so hide the dropdown.
                          On every other row the M-Code dropdown is editable
                          (including PCB rows: picking a non-APCB code there
                          clears is_pcb so misclassified PCBs can be rescued).
                          The PCB badge sits beside the dropdown so the row
                          still reads as "PCB" at a glance. */}
                      {/* PCB-ness is already conveyed by the row's blue
                          background and the APCB value in the dropdown — no
                          need for an extra "PCB" badge here, which used to
                          push the cell wider than its column. */}
                      {line.quantity <= 0 ? (
                        <span className="text-xs italic text-gray-400">
                          not installed
                        </span>
                      ) : (
                        <McodeSelect
                          value={line.m_code}
                          confidence={line.m_code_confidence}
                          source={line.m_code_source}
                          onSelect={(mcode) => handleMcodeChange(line.id, mcode)}
                        />
                      )}
                    </TableCell>
                    {/* TH Pins — editable only for TH lines */}
                    <TableCell className="px-3 py-2.5">
                      {line.is_pcb || line.m_code !== "TH" ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <PinCountInput
                          value={line.pin_count}
                          onCommit={(val) => handlePinCountChange(line.id, val)}
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
                              : line.m_code_source === "ai" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                              : line.m_code_source === "manual" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {line.m_code_source === "database" ? "DB"
                              : line.m_code_source === "rules" ? "Rule"
                              : line.m_code_source === "ai" ? "AI"
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
                          {line.m_code_source === "ai" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveLines([line.id])}
                              disabled={approvingIds.has(line.id) || bulkApproving}
                              className="shrink-0 h-6 gap-1 border-orange-300 bg-orange-50 px-1.5 text-[10px] text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                              title="Approve AI classification — caches m_code globally + per-customer so this CPC won't re-hit AI."
                            >
                              {approvingIds.has(line.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Approve
                            </Button>
                          )}
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
                          onClick={() =>
                            setDeleteTarget({
                              id: line.id,
                              label:
                                line.mpn ||
                                line.cpc ||
                                line.reference_designator ||
                                `line ${line.line_number}`,
                            })
                          }
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

        {/* Single AlertDialog for per-line delete — mirrors DeleteBomButton so
            the UX is consistent (replaces the old browser window.confirm). */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open && !deletingLineId) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this row?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently remove <strong>{deleteTarget?.label}</strong> from this BOM.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingLineId !== null}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDeleteLine();
                }}
                disabled={deletingLineId !== null}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingLineId ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/**
 * Inline editor for TH pin count. Commits on blur or Enter.
 * Empty input saves as NULL (missing pin data). Highlights amber when empty
 * so TH lines needing attention are visually obvious.
 */
function PinCountInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (rawValue: string) => void;
}) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));

  useEffect(() => {
    setLocal(value == null ? "" : String(value));
  }, [value]);

  function commit() {
    const normalized = local.trim();
    const current = value == null ? "" : String(value);
    if (normalized !== current) {
      onCommit(normalized);
    }
  }

  const isEmpty = local.trim() === "";

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={9999}
      step={1}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="—"
      aria-label="TH pin count"
      className={`h-7 w-16 px-2 text-xs font-mono ${
        isEmpty
          ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30"
          : ""
      }`}
    />
  );
}

/**
 * Unified column header. Sort button is rendered when the column's key maps to
 * a SortField (passed in via `sortField`/`onToggle`); resize handle is rendered
 * on every column except the last. The handle is a 4px-wide strip on the
 * cell's right edge, absolutely positioned so it doesn't affect the header's
 * flex layout.
 */
function HeadCell({
  colKey,
  label,
  srLabel,
  align,
  sortField,
  sortDir,
  onToggle,
  onResizeStart,
}: {
  colKey: ColKey;
  label: string;
  srLabel?: string;
  align?: "right";
  sortField?: SortField;
  sortDir?: SortDir;
  onToggle?: (f: SortField) => void;
  onResizeStart?: (col: ColKey, e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  // Only columns whose ColKey matches a SortField value are sortable.
  const sortableMap: Partial<Record<ColKey, Exclude<SortField, null>>> = {
    qty: "qty",
    designator: "designator",
    cpc: "cpc",
    description: "description",
    mpn: "mpn",
    manufacturer: "manufacturer",
    m_code: "m_code",
  };
  const sortKey = sortableMap[colKey];
  const isSortable = Boolean(sortKey && onToggle);
  const active = isSortable && sortField === sortKey;

  // Every column is resizable now that the table can overflow horizontally —
  // dragging the last column just lets the user widen Actions for clearer
  // delete icons, triggering the container's horizontal scroll as needed.
  const showResize = Boolean(onResizeStart);

  return (
    <TableHead
      className={`px-3 py-2.5 relative ${align === "right" ? "text-right" : ""}`}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={() => sortKey && onToggle?.(sortKey)}
          className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <span className="truncate">{label}</span>
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3 shrink-0" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />
          )}
        </button>
      ) : (
        <span className="truncate">
          {label}
          {srLabel && <span className="sr-only">{srLabel}</span>}
        </span>
      )}
      {showResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => onResizeStart?.(colKey, e)}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-400/60 active:bg-blue-500/80 transition-colors"
          title="Drag to resize"
        />
      )}
    </TableHead>
  );
}
