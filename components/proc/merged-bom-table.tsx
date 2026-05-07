"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  PackageCheck,
} from "lucide-react";
import { BUILT_IN_SUPPLIER_NAMES } from "@/lib/supplier-metadata";

export interface MergedBomRow {
  // CPC is the row identity across the table — aggregation, sort/filter
  // memoisation, optimistic state maps all key on this. MPN is purely the
  // displayed "winning" MPN for the CPC group (may be null on legacy data
  // where neither was supplied).
  cpc: string;
  mpn: string | null;
  // Other MPNs that aggregated under this CPC (alternates / rotated parts).
  // Only used for display/context; aggregation has already happened.
  mpns_seen?: string[];
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  total_qty: number;
  extras: number;
  total_with_extras: number;
  gmp_names_joined: string;
  qty_per_board_joined: string;
  supplier: string | null;
  supplier_pn: string | null;
  stock: number | null;
  unit_price: number | null;
  ext_price: number | null;
  place_to_buy: string | null;
  is_customer_supplied?: boolean;
  designators?: string | null;
  customer_ref?: string | null;
  package_case?: string | null;
  is_apcb?: boolean;
  apcb_order_status?: string | null;
  apcb_order_external_id?: string | null;
  apcb_multiple_boards?: boolean;
}

// Per-CPC BG / Safety stock allocation summary, keyed by uppercased CPC.
// Drives the "Stock" badge column. Computed server-side from
// inventory_allocations + inventory_parts for this PROC. CPC is the business
// identity at RS — every BOM line carries one (the parser falls back to MPN
// when the customer didn't supply one), and the inventory pool is keyed on it.
export interface StockAllocationBadge {
  pool: "bg" | "safety";
  qty: number;
  status: "reserved" | "consumed" | "released";
}

interface Props {
  rows: MergedBomRow[];
  procId: string;
  // Seeded server-side so we skip the initial client-fetch loading state.
  // Keyed by uppercased CPC (the row identity).
  initialQuotesByCpc?: Record<string, MpnQuoteData>;
  // BG / Safety stock allocations indexed by uppercased CPC. Empty object
  // when nothing is allocated — column still renders, just with em dashes.
  allocationsByCpc?: Record<string, StockAllocationBadge>;
  // Operator-overridden buy quantities per CPC (uppercased). NULL = no
  // override; the table falls back to the computed default. Persisted via
  // PATCH /api/proc/[id]/selections/buy-qty.
  buyQtyOverridesByCpc?: Record<string, number | null>;
}

interface RankedQuote {
  source: string;
  supplier_pn: string | null;
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  lead_time_days: number | null;
  effective_qty: number;
  effective_unit_price_cad: number | null;
  extended_cost_cad: number | null;
  in_stock: boolean;
  currency: string | null;
  fetched_at?: string | null;
  for_mpn?: string | null;
  package_case?: string | null;
}

interface MpnQuoteData {
  qty_needed: number;
  // Winning MPN within the CPC group — what the distributor APIs actually
  // queried. `selection.mpn` mirrors this for backward compatibility.
  winning_mpn?: string | null;
  ranked: RankedQuote[];
  winner: RankedQuote | null;
  fallback_because_no_stock: boolean;
  selection: {
    chosen_supplier: string;
    chosen_supplier_pn: string | null;
    chosen_unit_price_cad: number | null;
    chosen_effective_qty: number | null;
    cpc?: string | null;
    mpn?: string;
    order_status?: string | null;
    order_external_id?: string | null;
    ordered_at?: string | null;
    manual_unit_price_cad?: number | null;
    manual_price_note?: string | null;
    effective_unit_price_cad?: number | null;
  } | null;
  alt_mpns?: string[];
  is_customer_supplied?: boolean;
  is_apcb?: boolean;
}

interface Col {
  key:
    | keyof MergedBomRow
    | "__expand"
    | "order_status"
    | "stock_alloc"
    | "buy_qty"
    | "actions";
  label: string;
  initialWidth: number;
  align?: "left" | "right";
  mono?: boolean;
  fixed?: boolean;
}

const COLS: Col[] = [
  { key: "qty_per_board_joined", label: "Qty/Board", initialWidth: 85, align: "right" },
  { key: "designators", label: "Designator", initialWidth: 140 },
  { key: "customer_ref", label: "Customer Ref", initialWidth: 150, mono: true },
  { key: "cpc", label: "CPC", initialWidth: 110, mono: true },
  { key: "mpn", label: "MPN", initialWidth: 160, mono: true },
  { key: "description", label: "Description", initialWidth: 240 },
  { key: "manufacturer", label: "Manufacturer", initialWidth: 120 },
  { key: "m_code", label: "M-Code", initialWidth: 70 },
  { key: "package_case", label: "Package", initialWidth: 95 },
  // BG / Safety stock allocation badge — populated when a row's effective MPN
  // is present in this PROC's inventory_allocations.
  { key: "stock_alloc", label: "Stock", initialWidth: 80 },
  { key: "total_qty", label: "Qty Needed", initialWidth: 85, align: "right" },
  { key: "extras", label: "Extras", initialWidth: 65, align: "right" },
  { key: "total_with_extras", label: "Total to Buy", initialWidth: 95, align: "right" },
  // Editable per-row override. Default = shortfall for BG-short rows,
  // total_with_extras for non-BG, 0 for BG-fully-covered.
  { key: "buy_qty", label: "Buy Qty", initialWidth: 90, align: "right" },
  { key: "gmp_names_joined", label: "GMP Name", initialWidth: 150 },
  { key: "supplier", label: "Distributor", initialWidth: 110 },
  { key: "supplier_pn", label: "Distributor PN", initialWidth: 150, mono: true },
  { key: "stock", label: "Stock", initialWidth: 75, align: "right" },
  { key: "unit_price", label: "Unit Price", initialWidth: 85, align: "right" },
  { key: "ext_price", label: "Ext Price", initialWidth: 95, align: "right" },
  { key: "place_to_buy", label: "Place to Buy", initialWidth: 130 },
  { key: "order_status", label: "Order Status", initialWidth: 130 },
  // Per-row actions (Mark Received, etc.).
  { key: "actions", label: "Actions", initialWidth: 110, fixed: true },
  { key: "__expand", label: "", initialWidth: 30, fixed: true },
];

function fmtCurrency(n: number | null | undefined, digits = 4): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(digits)}`;
}

function fmtCacheAge(iso: string | null): { label: string; stale: boolean } {
  if (!iso) return { label: "never", stale: true };
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  const stale = ms > 24 * 3600 * 1000;
  if (mins < 1) return { label: "just now", stale };
  if (mins < 60) return { label: `${mins} min${mins === 1 ? "" : "s"} ago`, stale };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `${hours}h ago`, stale };
  const days = Math.floor(hours / 24);
  return { label: `${days}d ago`, stale };
}

export function MergedBomTable({
  rows,
  procId,
  initialQuotesByCpc,
  allocationsByCpc,
  buyQtyOverridesByCpc,
}: Props) {
  const allocMap = allocationsByCpc ?? {};
  // Operator-overridden buy quantities by uppercased CPC. Initialised from the
  // server-rendered map and updated optimistically on edit. We never refetch
  // the whole table — the input commits via PATCH and the local map advances.
  const [buyQtyOverrides, setBuyQtyOverrides] = useState<Record<string, number | null>>(
    () => ({ ...(buyQtyOverridesByCpc ?? {}) })
  );
  // Per-row "saving" indicator for the Buy Qty input.
  const [buyQtySaving, setBuyQtySaving] = useState<Record<string, boolean>>({});
  // Per-row Mark Received state.
  const [receivingByCpc, setReceivingByCpc] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const [refreshing, setRefreshing] = useState<null | "winner" | "all">(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [widths, setWidths] = useState<number[]>(() => COLS.map((c) => c.initialWidth));
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(
    () => new Set<string>(BUILT_IN_SUPPLIER_NAMES as readonly string[])
  );

  // Phase 3: keyed by uppercased CPC (the row identity). Backend API now
  // returns { cpcs: ... } — the field rename is reflected in fetchQuotes().
  const [quotesByCpc, setQuotesByCpc] = useState<Record<string, MpnQuoteData>>(
    () => initialQuotesByCpc ?? {}
  );
  const [quotesLoading, setQuotesLoading] = useState(!initialQuotesByCpc);
  const [initialLoaded, setInitialLoaded] = useState(!!initialQuotesByCpc);
  // Both expanded and rowError keyed by uppercased CPC to match quotesByCpc.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});

  // Client-side search + sort state.
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const NUMERIC_KEYS = new Set<string>([
    "qty_per_board_joined",
    "total_qty",
    "extras",
    "total_with_extras",
    "stock",
    "unit_price",
    "ext_price",
  ]);

  const SEARCH_FIELDS: (keyof MergedBomRow)[] = [
    "cpc",
    "mpn",
    "description",
    "manufacturer",
    "m_code",
    "supplier",
    "supplier_pn",
    "gmp_names_joined",
    "customer_ref",
    "designators",
    "package_case",
  ];

  // Row identity is the uppercased CPC. State maps (quotesByCpc, expanded,
  // rowError) all key on this. Provided as a helper so the call sites stay
  // readable even when rows have null MPNs.
  function rowKey(row: MergedBomRow): string {
    return row.cpc.toUpperCase();
  }

  function handleHeaderSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    // Cycle asc -> desc -> none.
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir("asc");
    }
  }

  // Bulk order-status toolbar state.
  const [bulkDistributor, setBulkDistributor] = useState<string>("");
  const [bulkStatus, setBulkStatus] = useState<string>("ordered");
  const [bulkExtId, setBulkExtId] = useState<string>("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Export / Create PO toolbar state.
  const [orderSupplier, setOrderSupplier] = useState<string>("");
  const [exportBusy, setExportBusy] = useState(false);
  const [poBusy, setPoBusy] = useState(false);
  const [poResult, setPoResult] = useState<{ po_number: string; pdf_url: string } | null>(null);
  const [poError, setPoError] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch(`/api/proc/${procId}/distributor-quotes`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load distributor quotes");
      const data = (await res.json()) as { cpcs: Record<string, MpnQuoteData> };
      setQuotesByCpc(data.cpcs ?? {});
      setInitialLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setQuotesLoading(false);
    }
  }, [procId]);

  useEffect(() => {
    // Skip the initial fetch when server passed seed data; fetchQuotes stays
    // available for manual refresh after selections/refresh button.
    if (!initialQuotesByCpc) fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when sibling components (e.g. supplier-quotes-panel's accept flow)
  // dispatch a po-created event for this same PROC. The accept route upserts
  // procurement_line_selections (supplier code, manual unit price CAD,
  // order_status='ordered'), so re-reading distributor-quotes picks them up.
  useEffect(() => {
    function onCreated(e: Event) {
      const ce = e as CustomEvent<{ procId?: string }>;
      if (!ce.detail?.procId || ce.detail.procId === procId) {
        fetchQuotes();
      }
    }
    window.addEventListener("proc:po-created", onCreated);
    return () => window.removeEventListener("proc:po-created", onCreated);
  }, [procId, fetchQuotes]);

  // Newest fetched_at for cache-age indicator.
  let newestFetched: string | null = null;
  for (const m of Object.values(quotesByCpc)) {
    for (const q of m.ranked) {
      if (q.fetched_at && (!newestFetched || q.fetched_at > newestFetched)) {
        newestFetched = q.fetched_at;
      }
    }
  }
  const cacheAge = fmtCacheAge(newestFetched);

  function onPointerDown(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = widthsRef.current[idx];

    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(40, startW + delta);
      setWidths((prev) => {
        if (prev[idx] === next) return prev;
        const arr = [...prev];
        arr[idx] = next;
        return arr;
      });
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    document.body.style.cursor = "col-resize";
  }

  const totalWidth = widths.reduce((s, w) => s + w, 0);

  async function runRefreshStream(endpoint: string, kind: "winner" | "all") {
    setRefreshing(kind);
    setRefreshMsg(null);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppliers: Array.from(selectedSuppliers) }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Refresh failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let summary: { updated?: number; failed?: number; skipped?: number; total?: number } | null =
        null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          const type = evt.type ?? (evt.total !== undefined && evt.done === undefined ? "init" : null);
          if (type === "init" || (evt.total !== undefined && evt.done === undefined && evt.updated === undefined)) {
            setProgress({ done: 0, total: evt.total });
          } else if (type === "progress" || evt.done !== undefined) {
            if (evt.updated === undefined) {
              setProgress({ done: evt.done, total: evt.total });
            } else {
              summary = evt;
            }
          } else if (type === "done" || evt.updated !== undefined) {
            summary = evt;
          }
        }
      }
      if (summary) {
        const parts = [`Refreshed ${summary.updated ?? 0} of ${summary.total ?? 0}`];
        if (summary.failed) parts.push(`${summary.failed} failed`);
        if (summary.skipped) parts.push(`${summary.skipped} skipped`);
        setRefreshMsg(parts.join(", ") + ".");
      }
      await fetchQuotes();
      router.refresh();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(null);
      setTimeout(() => setProgress(null), 2000);
    }
  }

  async function selectRadio(cpc: string, rq: RankedQuote) {
    const prev = quotesByCpc[cpc];
    if (!prev) return;
    // The supplier-facing MPN is whichever MPN the selected quote was bound
    // to (rq.for_mpn — could be the winner or an alternate). Falls back to
    // winning_mpn (or CPC as last resort) so the selections payload always
    // has a non-empty mpn for the (currently MPN-keyed) selections API.
    const effectiveMpn = rq.for_mpn ?? prev.winning_mpn ?? cpc;
    // Optimistic
    setQuotesByCpc((s) => ({
      ...s,
      [cpc]: {
        ...prev,
        selection: {
          chosen_supplier: rq.source,
          chosen_supplier_pn: rq.supplier_pn,
          chosen_unit_price_cad: rq.effective_unit_price_cad,
          chosen_effective_qty: rq.effective_qty,
          cpc,
          mpn: effectiveMpn,
        },
      },
    }));
    setRowError((s) => ({ ...s, [cpc]: null }));
    try {
      const res = await fetch(`/api/proc/${procId}/selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send both cpc and mpn — Phase 2 owns the selections API and will
          // switch the upsert key from mpn to cpc; in the meantime sending
          // both is forward-compatible with either implementation.
          cpc,
          mpn: effectiveMpn,
          chosen_supplier: rq.source,
          chosen_supplier_pn: rq.supplier_pn,
          chosen_unit_price_cad: rq.effective_unit_price_cad,
          chosen_effective_qty: rq.effective_qty,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (e) {
      setQuotesByCpc((s) => ({ ...s, [cpc]: prev }));
      setRowError((s) => ({
        ...s,
        [cpc]: e instanceof Error ? e.message : "Save failed",
      }));
    }
  }

  async function updateOrderStatus(cpc: string, newStatus: string) {
    const prev = quotesByCpc[cpc];
    if (!prev) return;
    const sel = prev.selection;
    const winner = prev.winner;
    // Lock-winner path: no selection yet but we have an auto-winner.
    const lockWinner = !sel && !!winner;
    if (!sel && !winner) return;

    const fallbackMpn = prev.winning_mpn ?? cpc;
    const effectiveMpn = sel
      ? (sel.mpn ?? fallbackMpn)
      : (winner!.for_mpn ?? fallbackMpn);

    let newExternalId: string | null | undefined = undefined; // undefined = don't change
    if (newStatus === "not_ordered") {
      newExternalId = null;
    } else if (newStatus === "ordered" && !sel?.order_external_id) {
      const entered = typeof window !== "undefined" ? window.prompt("External order ID?") : null;
      newExternalId = entered && entered.trim() ? entered.trim() : null;
    }

    // Build next selection (lock winner or mutate existing).
    const nextSelection = lockWinner
      ? {
          chosen_supplier: winner!.source,
          chosen_supplier_pn: winner!.supplier_pn,
          chosen_unit_price_cad: winner!.effective_unit_price_cad,
          chosen_effective_qty: winner!.effective_qty,
          cpc,
          mpn: effectiveMpn,
          order_status: newStatus,
          order_external_id: newExternalId ?? null,
        }
      : {
          ...sel!,
          order_status: newStatus,
          ...(newExternalId !== undefined ? { order_external_id: newExternalId } : {}),
        };

    setQuotesByCpc((s) => ({
      ...s,
      [cpc]: { ...prev, selection: nextSelection },
    }));
    setRowError((s) => ({ ...s, [cpc]: null }));
    try {
      const body: Record<string, unknown> = {
        cpc,
        mpn: effectiveMpn,
        chosen_supplier: lockWinner ? winner!.source : sel!.chosen_supplier,
        order_status: newStatus,
      };
      if (lockWinner) {
        body.chosen_supplier_pn = winner!.supplier_pn;
        body.chosen_unit_price_cad = winner!.effective_unit_price_cad;
        body.chosen_effective_qty = winner!.effective_qty;
      }
      if (newExternalId !== undefined) body.order_external_id = newExternalId;
      const res = await fetch(`/api/proc/${procId}/selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (e) {
      setQuotesByCpc((s) => ({ ...s, [cpc]: prev }));
      setRowError((s) => ({
        ...s,
        [cpc]: e instanceof Error ? e.message : "Save failed",
      }));
    }
  }

  // Manual price override save (null clears).
  async function saveManualPrice(
    cpc: string,
    manual_unit_price_cad: number | null,
    manual_price_note: string | null,
  ): Promise<boolean> {
    const prev = quotesByCpc[cpc];
    if (!prev || !prev.selection) return false;
    const sel = prev.selection;
    const effective =
      manual_unit_price_cad ?? sel.chosen_unit_price_cad ?? null;
    // Optimistic
    setQuotesByCpc((s) => ({
      ...s,
      [cpc]: {
        ...prev,
        selection: {
          ...sel,
          manual_unit_price_cad,
          manual_price_note,
          effective_unit_price_cad: effective,
        },
      },
    }));
    setRowError((s) => ({ ...s, [cpc]: null }));
    try {
      const res = await fetch(`/api/proc/${procId}/selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpc,
          mpn: sel.mpn ?? prev.winning_mpn ?? cpc,
          chosen_supplier: sel.chosen_supplier,
          manual_unit_price_cad,
          manual_price_note,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return true;
    } catch (e) {
      setQuotesByCpc((s) => ({ ...s, [cpc]: prev }));
      setRowError((s) => ({
        ...s,
        [cpc]: e instanceof Error ? e.message : "Save failed",
      }));
      return false;
    }
  }

  async function clearSelection(cpc: string) {
    const prev = quotesByCpc[cpc];
    if (!prev) return;
    setQuotesByCpc((s) => ({ ...s, [cpc]: { ...prev, selection: null } }));
    setRowError((s) => ({ ...s, [cpc]: null }));
    try {
      // Send both cpc and the selection's MPN so Phase 2's API can match
      // against either key during the migration window.
      const mpn = prev.selection?.mpn ?? prev.winning_mpn ?? cpc;
      const res = await fetch(`/api/proc/${procId}/selections`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpc, mpn }),
      });
      if (!res.ok) throw new Error("Clear failed");
    } catch (e) {
      setQuotesByCpc((s) => ({ ...s, [cpc]: prev }));
      setRowError((s) => ({
        ...s,
        [cpc]: e instanceof Error ? e.message : "Clear failed",
      }));
    }
  }

  // BG / Safety state for a row, derived from the allocations map. Used by
  // multiple downstream calculators (effective distributor, place-to-buy, buy
  // qty default).
  function bgStateForRow(row: MergedBomRow): {
    isBg: boolean;
    pool: "bg" | "safety" | null;
    reserved: number;
    need: number;
    shortfall: number;
    fullyCovered: boolean;
  } {
    const alloc = allocMap[rowKey(row)];
    const isBg = !!alloc && (alloc.pool === "bg" || alloc.pool === "safety");
    const pool = alloc ? alloc.pool : null;
    const reserved = alloc ? alloc.qty : 0;
    const need = row.total_with_extras;
    const shortfall = Math.max(0, need - reserved);
    const fullyCovered = isBg && shortfall === 0 && reserved >= need;
    return { isBg, pool, reserved, need, shortfall, fullyCovered };
  }

  // Default buy qty before operator override:
  //   • BG row, fully covered → 0  (nothing to purchase)
  //   • BG row, partial cover → shortfall
  //   • Non-BG row → total_with_extras
  function defaultBuyQtyForRow(row: MergedBomRow): number {
    const bg = bgStateForRow(row);
    if (bg.fullyCovered) return 0;
    if (bg.isBg) return bg.shortfall;
    return row.total_with_extras;
  }

  function displayedBuyQtyForRow(row: MergedBomRow): number {
    const k = rowKey(row);
    const override = buyQtyOverrides[k];
    if (override !== undefined && override !== null) return override;
    return defaultBuyQtyForRow(row);
  }

  // PATCH manual_buy_qty optimistically. NULL clears the override.
  async function commitBuyQty(row: MergedBomRow, raw: string): Promise<void> {
    const k = rowKey(row);
    const trimmed = raw.trim();
    let next: number | null;
    if (trimmed === "") {
      next = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        // Invalid input — revert silently to whatever was there before.
        setBuyQtyOverrides((s) => ({ ...s }));
        return;
      }
      // If the value matches the computed default, treat it as a clear so the
      // table goes back to auto-tracking.
      next = n === defaultBuyQtyForRow(row) ? null : n;
    }
    const prev = buyQtyOverrides[k];
    if (prev === next || (prev == null && next == null)) return;

    setBuyQtyOverrides((s) => ({ ...s, [k]: next }));
    setBuyQtySaving((s) => ({ ...s, [k]: true }));
    try {
      const res = await fetch(`/api/proc/${procId}/selections/buy-qty`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpc: k,
          mpn: row.mpn ?? quotesByCpc[k]?.winning_mpn ?? null,
          manual_buy_qty: next,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (e) {
      // Roll back on failure.
      setBuyQtyOverrides((s) => ({ ...s, [k]: prev ?? null }));
      setRowError((s) => ({
        ...s,
        [k]: e instanceof Error ? e.message : "Save failed",
      }));
    } finally {
      setBuyQtySaving((s) => {
        const next = { ...s };
        delete next[k];
        return next;
      });
    }
  }

  // Mark a row received. POSTs to /api/proc/[id]/lines/receive — the endpoint
  // writes a positive inventory_movement when the part is BG / Safety (which
  // auto-tops-up reservations) and flips order_status to 'received'.
  async function markRowReceived(row: MergedBomRow): Promise<void> {
    const k = rowKey(row);
    if (receivingByCpc[k]) return;
    const eff = effectiveForRow(row);
    const buyQty = displayedBuyQtyForRow(row);
    if (buyQty <= 0) return;

    setReceivingByCpc((s) => ({ ...s, [k]: true }));
    setRowError((s) => ({ ...s, [k]: null }));
    try {
      const res = await fetch(`/api/proc/${procId}/lines/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpc: k,
          qty_received: buyQty,
          supplier: eff.supplier ?? undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to mark received");
      }
      // Optimistically reflect 'received' status. The server already flipped
      // it; this avoids a round-trip back through fetchQuotes.
      setQuotesByCpc((s) => {
        const prev = s[k];
        if (!prev) return s;
        const sel = prev.selection;
        const winner = prev.winner;
        if (!sel && !winner) return s;
        const fallbackMpn = prev.winning_mpn ?? row.mpn ?? k;
        const nextSel = sel
          ? { ...sel, order_status: "received" }
          : {
              chosen_supplier: winner!.source,
              chosen_supplier_pn: winner!.supplier_pn,
              chosen_unit_price_cad: winner!.effective_unit_price_cad,
              chosen_effective_qty: winner!.effective_qty,
              cpc: k,
              mpn: winner!.for_mpn ?? fallbackMpn,
              order_status: "received",
              order_external_id: null,
            };
        return { ...s, [k]: { ...prev, selection: nextSel } };
      });
      // Refetch in the background so allocation badges + reservation deltas
      // reflect the inventory write. Don't block the UI on it.
      void fetchQuotes();
      router.refresh();
    } catch (e) {
      setRowError((s) => ({
        ...s,
        [k]: e instanceof Error ? e.message : "Failed to mark received",
      }));
    } finally {
      setReceivingByCpc((s) => {
        const next = { ...s };
        delete next[k];
        return next;
      });
    }
  }

  // Effective distributor for bulk filtering: selection.chosen_supplier OR winner.source.
  // BG-fully-covered rows are excluded from bulk distributor flows — there's
  // nothing to buy from a distributor for those rows.
  function rowEffectiveDistributor(row: MergedBomRow): string | null {
    if (row.is_customer_supplied || row.is_apcb) return null;
    if (bgStateForRow(row).fullyCovered) return null;
    const d = quotesByCpc[rowKey(row)];
    if (!d) return null;
    if (d.selection) return d.selection.chosen_supplier;
    if (d.winner) return d.winner.source;
    return null;
  }

  const bulkDistributorOptions = Array.from(
    new Set(
      rows
        .map((r) => rowEffectiveDistributor(r))
        .filter((s): s is string => !!s)
    )
  ).sort();

  const bulkTargetRows = rows.filter(
    (r) => !r.is_customer_supplied && !r.is_apcb && rowEffectiveDistributor(r) === bulkDistributor
  );

  async function applyBulk() {
    if (!bulkDistributor || bulkTargetRows.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: bulkTargetRows.length });

    const extId = bulkExtId.trim() ? bulkExtId.trim() : null;

    // Snapshot for rollback. Keyed by uppercased CPC (the row identity).
    const snapshot: Record<string, MpnQuoteData | undefined> = {};
    for (const row of bulkTargetRows) {
      const k = rowKey(row);
      snapshot[k] = quotesByCpc[k];
    }

    // Optimistic update for all targets.
    setQuotesByCpc((s) => {
      const next = { ...s };
      for (const row of bulkTargetRows) {
        const k = rowKey(row);
        const prev = next[k];
        if (!prev) continue;
        if (prev.selection) {
          next[k] = {
            ...prev,
            selection: {
              ...prev.selection,
              order_status: bulkStatus,
              ...(extId !== null ? { order_external_id: extId } : {}),
            },
          };
        } else if (prev.winner) {
          const w = prev.winner;
          next[k] = {
            ...prev,
            selection: {
              chosen_supplier: w.source,
              chosen_supplier_pn: w.supplier_pn,
              chosen_unit_price_cad: w.effective_unit_price_cad,
              chosen_effective_qty: w.effective_qty,
              cpc: k,
              mpn: w.for_mpn ?? prev.winning_mpn ?? row.mpn ?? k,
              order_status: bulkStatus,
              order_external_id: extId,
            },
          };
        }
      }
      return next;
    });

    // Build payload from snapshot (not optimistic state). Phase 2 owns the
    // bulk-update API; we send both cpc and mpn so its switch from MPN-keyed
    // to CPC-keyed upserts is forward-compatible.
    const payloadRows = bulkTargetRows
      .map((row) => {
        const k = rowKey(row);
        const data = snapshot[k];
        const sel = data?.selection;
        const winner = data?.winner;
        if (!sel && !winner) return null;
        const fallbackMpn = data?.winning_mpn ?? row.mpn ?? k;
        const effectiveMpn = sel?.mpn ?? winner?.for_mpn ?? fallbackMpn;
        return {
          cpc: k,
          mpn: effectiveMpn,
          chosen_supplier: sel?.chosen_supplier ?? winner!.source,
          chosen_supplier_pn: sel?.chosen_supplier_pn ?? winner?.supplier_pn ?? null,
          chosen_unit_price_cad:
            sel?.chosen_unit_price_cad ?? winner?.effective_unit_price_cad ?? null,
          chosen_effective_qty:
            sel?.chosen_effective_qty ?? winner?.effective_qty ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    try {
      const res = await fetch(`/api/proc/${procId}/selections/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: bulkStatus,
          external_order_id: extId !== null ? extId : undefined,
          rows: payloadRows,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Bulk update failed");
      }
      const j = (await res.json()) as { updated: number; failed?: number };
      setBulkResult(`Updated ${j.updated} line${j.updated === 1 ? "" : "s"}`);
      await fetchQuotes();
    } catch (e) {
      // Rollback all optimistic updates.
      setQuotesByCpc((s) => {
        const next = { ...s };
        for (const row of bulkTargetRows) {
          const k = rowKey(row);
          const prev = snapshot[k];
          if (prev) next[k] = prev;
        }
        return next;
      });
      setBulkResult(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBulkRunning(false);
      setBulkProgress(null);
    }
  }

  // Export Excel for chosen supplier.
  function doExportExcel() {
    if (!orderSupplier || exportBusy) return;
    setExportBusy(true);
    try {
      const url = `/api/proc/${procId}/export-excel?supplier=${encodeURIComponent(orderSupplier)}`;
      window.open(url, "_blank");
    } finally {
      // Brief spinner; no way to know when browser finished download.
      setTimeout(() => setExportBusy(false), 1200);
    }
  }

  // Create PO PDF for chosen supplier.
  async function doCreatePO() {
    if (!orderSupplier || poBusy) return;
    setPoBusy(true);
    setPoError(null);
    setPoResult(null);
    try {
      const res = await fetch(`/api/proc/${procId}/purchase-order-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier: orderSupplier }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "PO creation failed");
      }
      const j = (await res.json()) as { po_number: string; pdf_url: string };
      setPoResult(j);
      // Notify siblings (PurchaseOrdersList) that a new PO was created so
      // they can refetch without a page refresh.
      window.dispatchEvent(
        new CustomEvent("proc:po-created", { detail: { procId } })
      );
    } catch (e) {
      setPoError(e instanceof Error ? e.message : "PO creation failed");
    } finally {
      setPoBusy(false);
    }
  }

  // Compute effective display values for a row's last 5 columns.
  function effectiveForRow(row: MergedBomRow): {
    supplier: string | null;
    supplier_pn: string | null;
    stock: number | null;
    unit_price: number | null;
    ext_price: number | null;
    place_to_buy: string | null;
    mode: "picked" | "auto" | "none";
    fallbackWarn: boolean;
    manualOverride: boolean;
  } {
    if (row.is_customer_supplied) {
      return {
        supplier: "Customer Supplied",
        supplier_pn: "Customer Supplied",
        stock: null,
        unit_price: null,
        ext_price: null,
        place_to_buy: "Customer Supplied",
        mode: "none",
        fallbackWarn: false,
        manualOverride: false,
      };
    }
    // BG / Safety fully-covered: distributor flow is bypassed entirely. The
    // row is sourced from internal stock, not a supplier order.
    if (bgStateForRow(row).fullyCovered) {
      return {
        supplier: "BG Stock",
        supplier_pn: null,
        stock: null,
        unit_price: null,
        ext_price: null,
        place_to_buy: "BG Stock",
        mode: "none",
        fallbackWarn: false,
        manualOverride: false,
      };
    }
    if (row.is_apcb) {
      // APCB: display values already synthesized server-side from pcb_orders.
      return {
        supplier: row.supplier,
        supplier_pn: row.supplier_pn,
        stock: null,
        unit_price: row.unit_price,
        ext_price: row.ext_price,
        place_to_buy: row.supplier,
        mode: "none",
        fallbackWarn: false,
        manualOverride: false,
      };
    }
    const data = quotesByCpc[rowKey(row)];
    if (!data) {
      return {
        supplier: null,
        supplier_pn: null,
        stock: null,
        unit_price: null,
        ext_price: null,
        place_to_buy: null,
        mode: "none",
        fallbackWarn: false,
        manualOverride: false,
      };
    }
    const fallbackWarn = data.fallback_because_no_stock;
    if (data.selection) {
      const sel = data.selection;
      // When the selection captured an MPN, prefer the matching ranked row;
      // otherwise fall back to source-only matching (pre-Phase-3 selections).
      const fallbackMpn = data.winning_mpn ?? row.mpn;
      const supporting =
        (sel.mpn
          ? data.ranked.find(
              (r) => r.source === sel.chosen_supplier && (r.for_mpn ?? fallbackMpn) === sel.mpn
            )
          : undefined) ?? data.ranked.find((r) => r.source === sel.chosen_supplier);
      const cachedUnit =
        data.selection.chosen_unit_price_cad ?? supporting?.effective_unit_price_cad ?? null;
      // Manual override takes precedence over cached price.
      const manual = data.selection.manual_unit_price_cad ?? null;
      const unit = manual ?? cachedUnit;
      const effQty =
        data.selection.chosen_effective_qty ?? supporting?.effective_qty ?? row.total_with_extras;
      // Manual override uses total_with_extras for extension, not effective_qty.
      const ext =
        manual != null
          ? manual * row.total_with_extras
          : unit != null
            ? unit * effQty
            : null;
      return {
        supplier: data.selection.chosen_supplier,
        supplier_pn: data.selection.chosen_supplier_pn ?? supporting?.supplier_pn ?? null,
        stock: supporting?.stock_qty ?? null,
        unit_price: unit,
        ext_price: ext,
        place_to_buy: data.selection.chosen_supplier,
        mode: "picked",
        fallbackWarn,
        manualOverride: manual != null,
      };
    }
    if (data.winner) {
      const w = data.winner;
      return {
        supplier: w.source,
        supplier_pn: w.supplier_pn,
        stock: w.stock_qty,
        unit_price: w.effective_unit_price_cad,
        ext_price: w.extended_cost_cad,
        place_to_buy: w.source,
        mode: "auto",
        fallbackWarn,
        manualOverride: false,
      };
    }
    return {
      supplier: null,
      supplier_pn: null,
      stock: null,
      unit_price: null,
      ext_price: null,
      place_to_buy: null,
      mode: "none",
      fallbackWarn,
      manualOverride: false,
    };
  }

  // Filtered + sorted rows for render. Filter first, then sort.
  const displayedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          SEARCH_FIELDS.some((f) => {
            const v = r[f];
            return typeof v === "string" && v.toLowerCase().includes(q);
          }),
        )
      : rows;

    if (!sortKey || !sortDir) return filtered;

    const isNumeric = NUMERIC_KEYS.has(sortKey);
    const dir = sortDir === "asc" ? 1 : -1;

    // Effective numeric value, respecting customer-supplied (always null for stock/unit/ext)
    // and using `eff` for the last-5 columns when applicable.
    function getNumeric(r: MergedBomRow): number | null {
      if (
        r.is_customer_supplied &&
        (sortKey === "stock" || sortKey === "unit_price" || sortKey === "ext_price")
      ) {
        return null;
      }
      if (sortKey === "stock" || sortKey === "unit_price" || sortKey === "ext_price") {
        const eff = effectiveForRow(r);
        const v =
          sortKey === "stock"
            ? eff.stock
            : sortKey === "unit_price"
              ? eff.unit_price
              : eff.ext_price;
        return v == null || Number.isNaN(Number(v)) ? null : Number(v);
      }
      const raw = r[sortKey as keyof MergedBomRow];
      if (raw == null || raw === "") return null;
      const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      return Number.isFinite(n) ? n : null;
    }

    function getString(r: MergedBomRow): string | null {
      if (sortKey === "supplier" || sortKey === "supplier_pn" || sortKey === "place_to_buy") {
        const eff = effectiveForRow(r);
        const v =
          sortKey === "supplier"
            ? eff.supplier
            : sortKey === "supplier_pn"
              ? eff.supplier_pn
              : eff.place_to_buy;
        if (!v || v === "—") return null;
        return String(v);
      }
      if (sortKey === "order_status") {
        // Order status lives in quotesByCpc[].selection.order_status (priced
        // rows) or row.apcb_order_status (PCB rows). CS rows have no status.
        if (r.is_customer_supplied) return null;
        if (r.is_apcb) return r.apcb_order_status ?? "not_ordered";
        const status = quotesByCpc[rowKey(r)]?.selection?.order_status;
        return status ?? "not_ordered";
      }
      const raw = r[sortKey as keyof MergedBomRow];
      if (raw == null || raw === "" || raw === "—") return null;
      return String(raw);
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
      if (isNumeric) {
        const av = getNumeric(a);
        const bv = getNumeric(b);
        // nulls sink regardless of direction
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      const as = getString(a);
      const bs = getString(b);
      if (as == null && bs == null) return 0;
      if (as == null) return 1;
      if (bs == null) return -1;
      return as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return copy;
    // effectiveForRow depends on quotesByCpc; include that for reactivity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, searchQuery, sortKey, sortDir, quotesByCpc]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <DistributorPicker
          selected={selectedSuppliers}
          onChange={setSelectedSuppliers}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => runRefreshStream(`/api/proc/${procId}/refresh-prices`, "winner")}
            disabled={refreshing !== null || selectedSuppliers.size === 0}
            size="sm"
            title={selectedSuppliers.size === 0 ? "Select at least one distributor" : undefined}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing === "winner" ? "animate-spin" : ""}`}
            />
            {refreshing === "winner" ? "Refreshing…" : "Refresh Winner Only"}
          </Button>
          <Button
            onClick={() =>
              runRefreshStream(`/api/proc/${procId}/refresh-all-distributors`, "all")
            }
            disabled={refreshing !== null || selectedSuppliers.size === 0}
            size="sm"
            variant="outline"
            title={selectedSuppliers.size === 0 ? "Select at least one distributor" : undefined}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing === "all" ? "animate-spin" : ""}`}
            />
            {refreshing === "all" ? "Refreshing…" : "Refresh All Distributors"}
            <span className="ml-2 text-xs text-gray-500">(~2-3 min)</span>
          </Button>
          {selectedSuppliers.size === 0 && (
            <span className="text-xs text-amber-600">Select at least one distributor</span>
          )}
          {refreshMsg && <span className="text-xs text-gray-500">{refreshMsg}</span>}
        </div>
        {/* Bulk order-status toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Bulk update:</span>
          <label className="flex items-center gap-1">
            <span className="text-gray-600 dark:text-gray-400">Distributor</span>
            <Select
              value={bulkDistributor || "__none__"}
              onValueChange={(v) =>
                setBulkDistributor(v == null || v === "__none__" ? "" : v)
              }
              disabled={bulkRunning || bulkDistributorOptions.length === 0}
            >
              <SelectTrigger size="sm" className="h-6 px-1 text-xs min-w-[7rem]">
                <SelectValue>
                  {(v: string) => (v === "__none__" || !v ? "— select —" : v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— select —</SelectItem>
                {bulkDistributorOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-gray-600 dark:text-gray-400">Status</span>
            <Select
              value={bulkStatus}
              onValueChange={(v) => v && setBulkStatus(v)}
              disabled={bulkRunning}
            >
              <SelectTrigger size="sm" className="h-6 px-1 text-xs min-w-[7rem]">
                <SelectValue>
                  {(v: string) =>
                    ORDER_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? ""
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-gray-600 dark:text-gray-400">External Order ID</span>
            <input
              type="text"
              value={bulkExtId}
              onChange={(e) => setBulkExtId(e.target.value)}
              disabled={bulkRunning}
              placeholder="(optional)"
              className="w-36 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <Button
            size="sm"
            onClick={applyBulk}
            disabled={
              bulkRunning ||
              !bulkDistributor ||
              bulkTargetRows.length === 0 ||
              bulkDistributorOptions.length === 0
            }
          >
            {bulkRunning ? (
              <>
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                Applying…
              </>
            ) : (
              `Apply to ${bulkTargetRows.length} line${bulkTargetRows.length === 1 ? "" : "s"}`
            )}
          </Button>
          {bulkResult && <span className="text-gray-500">{bulkResult}</span>}
          {bulkDistributorOptions.length === 0 && (
            <span className="text-gray-400">No eligible rows</span>
          )}
        </div>
        {/* Orders: Export Excel / Create PO PDF */}
        <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Orders:</span>
          <label className="flex items-center gap-1">
            <span className="text-gray-600 dark:text-gray-400">Supplier</span>
            <Select
              value={orderSupplier || "__none__"}
              onValueChange={(v) => {
                setOrderSupplier(v == null || v === "__none__" ? "" : v);
                setPoResult(null);
                setPoError(null);
              }}
              disabled={bulkDistributorOptions.length === 0 || exportBusy || poBusy}
            >
              <SelectTrigger size="sm" className="h-6 px-1 text-xs min-w-[7rem]">
                <SelectValue>
                  {(v: string) => (v === "__none__" || !v ? "— select —" : v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— select —</SelectItem>
                {bulkDistributorOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={doExportExcel}
            disabled={!orderSupplier || exportBusy || poBusy || bulkDistributorOptions.length === 0}
            title={bulkDistributorOptions.length === 0 ? "Pick distributors first" : undefined}
          >
            {exportBusy && <RefreshCw className="mr-1 h-3 w-3 animate-spin" />}
            Export Excel
          </Button>
          <Button
            size="sm"
            onClick={doCreatePO}
            disabled={!orderSupplier || exportBusy || poBusy || bulkDistributorOptions.length === 0}
            title={bulkDistributorOptions.length === 0 ? "Pick distributors first" : undefined}
          >
            {poBusy && <RefreshCw className="mr-1 h-3 w-3 animate-spin" />}
            Create Purchase Order PDF
          </Button>
          {poResult && (
            <span className="text-gray-600 dark:text-gray-300">
              {poResult.po_number} created —{" "}
              <a
                href={poResult.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open PDF
              </a>
            </span>
          )}
          {poError && <span className="text-red-600">{poError}</span>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={cacheAge.stale ? "text-amber-600" : "text-gray-500"}>
            Cache last refreshed: {cacheAge.label}
          </span>
          {quotesLoading && (
            <span className="text-gray-500">Loading distributor quotes…</span>
          )}
        </div>
        {progress && progress.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>
                {progress.done} / {progress.total} parts
              </span>
              <span>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{
                  width: `${Math.min(100, (progress.done / progress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search CPC / MPN / Description / Manufacturer / …"
          className="w-full max-w-md rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
        />
        {searchQuery.trim() && (
          <span className="text-xs text-gray-500">
            showing {displayedRows.length} of {rows.length}
          </span>
        )}
      </div>
      {!initialLoaded ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-gray-200 bg-gray-50 py-12 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading distributor quotes & pricing…</span>
          <span className="text-xs">
            Assembling {rows.length} line{rows.length === 1 ? "" : "s"} — will display once complete.
          </span>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table
          className="border-collapse text-sm"
          style={{ tableLayout: "fixed", width: `${totalWidth}px` }}
        >
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: `${w}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-gray-50 dark:bg-gray-900">
              {COLS.map((c, i) => {
                const keyStr = String(c.key);
                const sortable = c.key !== "__expand";
                const isActive = sortable && sortKey === keyStr && sortDir !== null;
                return (
                  <th
                    key={keyStr}
                    className={`relative select-none border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-300 ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                    style={{ overflow: "hidden" }}
                  >
                    {sortable ? (
                      <span
                        onClick={() => handleHeaderSort(keyStr)}
                        className={`flex cursor-pointer items-center gap-1 truncate pr-3 ${
                          c.align === "right" ? "justify-end" : ""
                        }`}
                        title="Click to sort"
                      >
                        <span className="truncate">{c.label}</span>
                        {isActive ? (
                          sortDir === "asc" ? (
                            <ArrowUp size={10} className="shrink-0" />
                          ) : (
                            <ArrowDown size={10} className="shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown
                            size={10}
                            className="shrink-0"
                            style={{ opacity: 0.3 }}
                          />
                        )}
                      </span>
                    ) : (
                      <span className="block truncate pr-3">{c.label}</span>
                    )}
                    {!c.fixed && (
                      <div
                        onPointerDown={(e) => onPointerDown(i, e)}
                        className="absolute right-0 top-0 z-20 w-1.5 cursor-col-resize bg-transparent hover:bg-blue-500"
                        style={{ touchAction: "none", bottom: 0, height: "auto" }}
                        title="Drag to resize"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => {
              const eff = effectiveForRow(row);
              const k = rowKey(row);
              const isOpen = !!expanded[k];
              const data = quotesByCpc[k];
              const err = rowError[k];
              return (
                <Fragment key={k}>
                  <tr
                    className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    {COLS.map((c) => {
                      if (c.key === "order_status") {
                        const bg = bgStateForRow(row);
                        return (
                          <td
                            key="order_status"
                            className="overflow-hidden border-r border-gray-100 px-2 py-1.5 dark:border-gray-800"
                            style={{ whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                          >
                            {bg.fullyCovered ? (
                              <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                                covered
                              </span>
                            ) : (
                              <OrderStatusCell
                                row={row}
                                data={data}
                                onChange={(v) => updateOrderStatus(k, v)}
                              />
                            )}
                          </td>
                        );
                      }
                      if (c.key === "stock_alloc") {
                        // Look up by uppercased CPC — CPC is the business
                        // identity, and inventory_parts is keyed on it.
                        const alloc = allocMap[k];
                        const bg = bgStateForRow(row);
                        return (
                          <td
                            key="stock_alloc"
                            className="overflow-hidden border-r border-gray-100 px-2 py-1.5 dark:border-gray-800"
                            style={{ whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                          >
                            {alloc ? (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    alloc.pool === "bg"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                      : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  }`}
                                  title={`${alloc.pool === "bg" ? "BG" : "Safety"} stock — ${alloc.qty} ${alloc.status}`}
                                >
                                  {alloc.pool === "bg" ? "BG" : "SS"} ✓ {alloc.qty}
                                </span>
                                {bg.shortfall > 0 && (
                                  <span
                                    className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                                    title={`Need ${bg.need}, reserved ${bg.reserved}`}
                                  >
                                    short {bg.shortfall}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        );
                      }
                      if (c.key === "buy_qty") {
                        const buyQty = displayedBuyQtyForRow(row);
                        const bg = bgStateForRow(row);
                        const saving = !!buyQtySaving[k];
                        const disabled =
                          row.is_customer_supplied || row.is_apcb;
                        return (
                          <td
                            key="buy_qty"
                            className="overflow-hidden border-r border-gray-100 px-2 py-1.5 text-right dark:border-gray-800"
                          >
                            {disabled ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span className="inline-flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  defaultValue={buyQty}
                                  key={`${k}-${buyQty}`}
                                  disabled={saving}
                                  onBlur={(e) => commitBuyQty(row, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-right text-xs dark:border-gray-700 dark:bg-gray-950"
                                  title={
                                    bg.fullyCovered
                                      ? "BG fully covers — set above 0 to buy reel"
                                      : bg.isBg
                                        ? `Default = shortfall (${bg.shortfall})`
                                        : "Default = total to buy"
                                  }
                                />
                                {saving && (
                                  <RefreshCw className="h-3 w-3 animate-spin text-gray-400" />
                                )}
                              </span>
                            )}
                          </td>
                        );
                      }
                      if (c.key === "actions") {
                        const bg = bgStateForRow(row);
                        const buyQty = displayedBuyQtyForRow(row);
                        const isReceiving = !!receivingByCpc[k];
                        const eff = effectiveForRow(row);
                        const status = quotesByCpc[k]?.selection?.order_status;
                        const alreadyReceived = status === "received";
                        // Disable when: CS row, APCB (use PCB tab), buy qty 0
                        // (nothing to receive — applies to BG-fully-covered),
                        // or no selection/winner (no supplier picked yet, and
                        // not a BG-fully-covered case which uses internal stock).
                        const noSupplier =
                          !eff.supplier && !bg.fullyCovered;
                        const disabled =
                          row.is_customer_supplied ||
                          row.is_apcb ||
                          buyQty <= 0 ||
                          noSupplier ||
                          alreadyReceived ||
                          isReceiving;
                        const title = row.is_apcb
                          ? "Use PCB Orders tab"
                          : row.is_customer_supplied
                            ? "Customer-supplied — nothing to receive"
                            : buyQty <= 0
                              ? "Nothing to buy / receive"
                              : noSupplier
                                ? "Pick a distributor first"
                                : alreadyReceived
                                  ? "Already received"
                                  : bg.isBg
                                    ? `Mark ${buyQty} received and add to ${bg.pool === "bg" ? "BG" : "Safety"} stock`
                                    : `Mark ${buyQty} received`;
                        return (
                          <td
                            key="actions"
                            className="overflow-hidden border-r border-gray-100 px-1 py-1.5 dark:border-gray-800"
                          >
                            <Button
                              size="sm"
                              variant={alreadyReceived ? "ghost" : "outline"}
                              disabled={disabled}
                              onClick={() => markRowReceived(row)}
                              title={title}
                              className="h-6 px-2 text-[10px]"
                            >
                              {isReceiving ? (
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <PackageCheck className="mr-1 h-3 w-3" />
                              )}
                              {alreadyReceived ? "Received" : "Receive"}
                            </Button>
                          </td>
                        );
                      }
                      if (c.key === "__expand") {
                        const bg = bgStateForRow(row);
                        const disabled =
                          !!row.is_customer_supplied || !!row.is_apcb || bg.fullyCovered;
                        const disabledTitle = row.is_apcb
                          ? "Edit PCB order in PCB Orders tab"
                          : bg.fullyCovered
                            ? "Sourced from BG stock — no distributor selection needed"
                            : undefined;
                        return (
                          <td
                            key="__expand"
                            className="overflow-hidden border-r border-gray-100 px-1 py-1.5 text-center dark:border-gray-800"
                          >
                            <button
                              type="button"
                              disabled={disabled}
                              title={disabledTitle}
                              onClick={() =>
                                !disabled &&
                                setExpanded((s) => ({ ...s, [k]: !s[k] }))
                              }
                              className={`rounded p-0.5 ${
                                disabled
                                  ? "cursor-not-allowed text-gray-300 dark:text-gray-600"
                                  : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                              }`}
                              aria-label={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        );
                      }

                      const key = c.key as keyof MergedBomRow;
                      let display: string;
                      let extra: React.ReactNode = null;

                      // Last 5 columns come from `eff` when available.
                      const useEff =
                        key === "supplier" ||
                        key === "supplier_pn" ||
                        key === "stock" ||
                        key === "unit_price" ||
                        key === "ext_price" ||
                        key === "place_to_buy";

                      let raw: string | number | null = null;
                      if (useEff) {
                        if (key === "supplier") raw = eff.supplier;
                        else if (key === "supplier_pn") raw = eff.supplier_pn;
                        else if (key === "stock") raw = eff.stock;
                        else if (key === "unit_price") raw = eff.unit_price;
                        else if (key === "ext_price") raw = eff.ext_price;
                        else if (key === "place_to_buy") raw = eff.place_to_buy;
                      } else {
                        const v = row[key];
                        raw = (v as string | number | null) ?? null;
                      }

                      if (key === "extras") {
                        display = row.extras > 0 ? `+${row.extras}` : "—";
                      } else if (raw === null || raw === undefined || raw === "") {
                        display = "—";
                      } else if (key === "unit_price") {
                        display = `$${Number(raw).toFixed(4)}`;
                      } else if (key === "ext_price") {
                        display = `$${Number(raw).toFixed(2)}`;
                      } else if (key === "stock") {
                        display = Number(raw).toLocaleString();
                      } else {
                        display = String(raw);
                      }

                      if (key === "unit_price" && eff.manualOverride) {
                        extra = (
                          <span
                            className="ml-1 inline-block align-middle text-amber-600"
                            title="Manual price override — click row to expand for details"
                          >
                            <Pencil className="inline" size={10} />
                          </span>
                        );
                      }

                      if (key === "place_to_buy" && eff.mode !== "none") {
                        extra = (
                          <span
                            className={`ml-1 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                              eff.mode === "picked"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {eff.mode}
                          </span>
                        );
                      }

                      // BG-fully-covered rows: render "BG Stock" as a green
                      // badge in the Distributor / Place-to-Buy columns.
                      const bgFullyCoveredCell =
                        bgStateForRow(row).fullyCovered &&
                        (key === "supplier" || key === "place_to_buy") &&
                        display === "BG Stock";

                      if (key === "supplier" && eff.fallbackWarn) {
                        extra = (
                          <span
                            className="ml-1 inline-block align-middle"
                            title="No distributor has enough stock — cheapest OOS shown. Refresh or pick manually."
                          >
                            <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500" />
                          </span>
                        );
                      }

                      const csMuted =
                        row.is_customer_supplied &&
                        (key === "supplier" || key === "supplier_pn" || key === "place_to_buy");
                      // APCB multi-board rows: italic muted on the distributor column.
                      const apcbMuted =
                        row.is_apcb &&
                        row.apcb_multiple_boards &&
                        (key === "supplier" || key === "place_to_buy");

                      return (
                        <td
                          key={String(c.key)}
                          className={`overflow-hidden border-r border-gray-100 px-2 py-1.5 dark:border-gray-800 ${
                            c.align === "right" ? "text-right" : "text-left"
                          } ${c.mono ? "font-mono text-xs" : ""} ${
                            key === "total_with_extras" ? "font-semibold" : ""
                          } ${key === "extras" ? "text-gray-500" : ""} ${
                            csMuted || apcbMuted ? "italic text-gray-500 dark:text-gray-400" : ""
                          }`}
                          style={{ whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                          title={display}
                        >
                          {bgFullyCoveredCell ? (
                            <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                              BG Stock
                            </span>
                          ) : (
                            <>
                              {display}
                              {extra}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                      <td colSpan={COLS.length} className="px-4 py-3">
                        <ExpandedQuotes
                          // ExpandedQuotes still labels things by MPN
                          // (distributor PNs are MPN-bound, not CPC-bound) —
                          // pass the winning MPN with CPC fallback so the
                          // header text never shows blank.
                          mpn={row.mpn ?? data?.winning_mpn ?? row.cpc}
                          data={data}
                          err={err}
                          onSelect={(rq) => selectRadio(k, rq)}
                          onClear={() => clearSelection(k)}
                          onSaveManual={(price, note) =>
                            saveManualPrice(k, price, note)
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function DistributorPicker({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const all = BUILT_IN_SUPPLIER_NAMES as readonly string[];

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((name) => {
        const on = selected.has(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              on
                ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-600"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            }`}
          >
            {name}
          </button>
        );
      })}
      <span className="ml-2 flex gap-2 text-xs">
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => onChange(new Set(all))}
        >
          All
        </button>
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => onChange(new Set())}
        >
          None
        </button>
      </span>
    </div>
  );
}

const ORDER_STATUS_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "not_ordered", label: "Not Ordered", dot: "bg-gray-400" },
  { value: "ordered", label: "Ordered", dot: "bg-blue-500" },
  { value: "shipped", label: "Shipped", dot: "bg-amber-500" },
  { value: "received", label: "Received", dot: "bg-green-500" },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-500" },
];

function OrderStatusCell({
  row,
  data,
  onChange,
}: {
  row: MergedBomRow;
  data: MpnQuoteData | undefined;
  onChange: (newStatus: string) => void;
}) {
  if (row.is_customer_supplied) {
    return (
      <span className="italic text-gray-500 dark:text-gray-400 text-xs">Customer Supplied</span>
    );
  }
  if (row.is_apcb) {
    // Read-only status reflecting pcb_orders; edits happen in PCB Orders tab.
    const status = row.apcb_order_status ?? "not_ordered";
    const current =
      ORDER_STATUS_OPTIONS.find((o) => o.value === status) ?? ORDER_STATUS_OPTIONS[0];
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${current.dot}`} />
          <span className="text-xs">{current.label}</span>
          {row.apcb_order_external_id && (
            <span
              className="truncate font-mono text-[10px] text-gray-500"
              title={row.apcb_order_external_id}
            >
              {row.apcb_order_external_id}
            </span>
          )}
        </div>
        <span className="text-[10px] italic text-gray-500">PCB Orders tab</span>
      </div>
    );
  }
  if (!data || (!data.selection && !data.winner)) {
    return (
      <span className="text-xs text-gray-400">Pick distributor first</span>
    );
  }
  // Auto-winner mode: no explicit selection but a winner exists. Dropdown enabled;
  // first change will lock winner as selection via updateOrderStatus.
  const status = data.selection?.order_status ?? "not_ordered";
  const current = ORDER_STATUS_OPTIONS.find((o) => o.value === status) ?? ORDER_STATUS_OPTIONS[0];
  const extId = data.selection?.order_external_id;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${current.dot}`} />
      <Select value={status} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger size="sm" className="h-6 px-1 text-xs min-w-[7rem]">
          <SelectValue>
            {(v: string) =>
              ORDER_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? ""
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {extId && (
        <span
          className="truncate font-mono text-[10px] text-gray-500"
          title={extId}
        >
          {extId}
        </span>
      )}
    </div>
  );
}

function ExpandedQuotes({
  mpn,
  data,
  err,
  onSelect,
  onClear,
  onSaveManual,
}: {
  mpn: string;
  data: MpnQuoteData | undefined;
  err: string | null | undefined;
  onSelect: (rq: RankedQuote) => void;
  onClear: () => void;
  onSaveManual: (price: number | null, note: string | null) => Promise<boolean>;
}) {
  if (!data) {
    return (
      <div className="text-xs text-gray-500">
        Loading distributor quotes for {mpn}…
      </div>
    );
  }

  const chosenSource = data.selection?.chosen_supplier ?? null;
  const autoWinnerSource = !chosenSource && data.winner ? data.winner.source : null;

  if (data.ranked.length === 0) {
    return (
      <div className="space-y-2 text-xs">
        <div className="font-semibold text-gray-700 dark:text-gray-300">
          All distributor quotes for this MPN
        </div>
        <div className="text-gray-500">
          No distributor quotes cached for {mpn}. Try{" "}
          <span className="font-medium">Refresh All Distributors</span> above.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          All distributor quotes for this MPN ({data.ranked.length})
        </div>
        <div className="text-xs text-gray-500">Qty needed: {data.qty_needed}</div>
      </div>
      {err && (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {err}
        </div>
      )}
      {data.alt_mpns && data.alt_mpns.length > 0 && (
        <div className="text-xs text-gray-500">
          Alternate MPNs included: {data.alt_mpns.join(", ")}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b bg-gray-100 text-left dark:bg-gray-900">
              <th className="w-8 px-2 py-1"></th>
              <th className="px-2 py-1">For MPN</th>
              <th className="px-2 py-1">Distributor</th>
              <th className="px-2 py-1">Dist PN</th>
              <th className="px-2 py-1">Package</th>
              <th className="px-2 py-1 text-right">Stock</th>
              <th className="px-2 py-1 text-right">MOQ</th>
              <th className="px-2 py-1 text-right">Mult</th>
              <th className="px-2 py-1 text-right">Eff Qty</th>
              <th className="px-2 py-1 text-right">Unit $ (CAD)</th>
              <th className="px-2 py-1 text-right">Ext $ (CAD)</th>
              <th className="px-2 py-1 text-right">Lead</th>
              <th className="px-2 py-1">Fetched</th>
            </tr>
          </thead>
          <tbody>
            {data.ranked.map((rq, i) => {
              const quoteMpn = rq.for_mpn ?? mpn;
              const selectedMpn = data.selection?.mpn ?? null;
              const isPicked =
                chosenSource === rq.source &&
                // When selection stored an mpn, match both. When it didn't
                // (older rows), fall back to source-only match.
                (selectedMpn == null || selectedMpn === quoteMpn);
              const selected =
                isPicked ||
                (!chosenSource && autoWinnerSource === rq.source && i === 0);
              const muted = !rq.in_stock;
              return (
                <tr
                  key={`${rq.source}-${quoteMpn}-${i}`}
                  className={`border-b border-gray-200 dark:border-gray-800 ${
                    muted ? "text-gray-400" : ""
                  } ${selected ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                >
                  <td className="px-2 py-1">
                    <input
                      type="radio"
                      name={`sel-${mpn}`}
                      checked={isPicked}
                      onChange={() => onSelect(rq)}
                    />
                  </td>
                  <td className="px-2 py-1 font-mono">
                    {rq.for_mpn == null ? (
                      mpn
                    ) : rq.for_mpn === mpn ? (
                      <>
                        {mpn}
                        <span className="ml-1 text-[9px] font-sans font-normal text-gray-500">
                          (primary)
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-blue-600 dark:text-blue-400">{rq.for_mpn}</span>
                        <span className="ml-1 text-[9px] font-sans font-normal text-gray-500">
                          (alt)
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1 font-medium">
                    {rq.source}
                    {!rq.in_stock && (
                      <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
                        OOS
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono">{rq.supplier_pn ?? "—"}</td>
                  <td className="px-2 py-1">{rq.package_case ?? "—"}</td>
                  <td className="px-2 py-1 text-right">
                    {rq.stock_qty != null ? rq.stock_qty.toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">{rq.moq ?? "—"}</td>
                  <td className="px-2 py-1 text-right">{rq.order_multiple ?? "—"}</td>
                  <td className="px-2 py-1 text-right">{rq.effective_qty}</td>
                  <td className="px-2 py-1 text-right">
                    {fmtCurrency(rq.effective_unit_price_cad, 4)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {fmtCurrency(rq.extended_cost_cad, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {rq.lead_time_days != null ? `${rq.lead_time_days}d` : "—"}
                  </td>
                  <td className="px-2 py-1">
                    {rq.fetched_at ? fmtCacheAge(rq.fetched_at).label : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="text-gray-500">
          {/* TODO: wire "Refresh just this part" to a per-MPN scoped refresh. */}
        </div>
        {data.selection && (
          <button
            type="button"
            onClick={onClear}
            className="text-blue-600 hover:underline"
          >
            Clear selection (revert to auto-winner)
          </button>
        )}
      </div>
      {data.selection && (
        <ManualOverride
          key={`${data.selection.chosen_supplier}-${data.selection.mpn ?? mpn}`}
          selection={data.selection}
          onSave={onSaveManual}
        />
      )}
    </div>
  );
}

function ManualOverride({
  selection,
  onSave,
}: {
  selection: NonNullable<MpnQuoteData["selection"]>;
  onSave: (price: number | null, note: string | null) => Promise<boolean>;
}) {
  const initPrice =
    selection.manual_unit_price_cad != null
      ? String(selection.manual_unit_price_cad)
      : "";
  const initNote = selection.manual_price_note ?? "";
  const [price, setPrice] = useState<string>(initPrice);
  const [note, setNote] = useState<string>(initNote);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const effective =
    selection.manual_unit_price_cad ?? selection.chosen_unit_price_cad ?? null;

  async function doSave() {
    setBusy(true);
    setSaved(false);
    const parsed = price.trim() ? Number(price) : NaN;
    const priceVal = Number.isFinite(parsed) ? parsed : null;
    const noteVal = note.trim() ? note.trim() : null;
    const ok = await onSave(priceVal, noteVal);
    setBusy(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  async function doClear() {
    setBusy(true);
    setSaved(false);
    setPrice("");
    setNote("");
    const ok = await onSave(null, null);
    setBusy(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs dark:border-amber-900 dark:bg-amber-950">
      <div className="mb-1 font-semibold text-amber-800 dark:text-amber-200">
        Manual price override (CAD)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.0001"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={busy}
          placeholder="0.0000"
          className="w-24 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-950"
        />
        <label className="flex flex-1 items-center gap-1">
          <span className="text-gray-600 dark:text-gray-400">Note:</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder="optional"
            className="min-w-[10rem] flex-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <Button size="sm" onClick={doSave} disabled={busy}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={doClear} disabled={busy}>
          Clear
        </Button>
        {saved && <span className="text-green-600">Saved</span>}
      </div>
      <div className="mt-1 text-gray-600 dark:text-gray-400">
        Effective unit price: {fmtCurrency(effective, 4)}
        {selection.manual_unit_price_cad != null && (
          <span className="ml-1 text-amber-700 dark:text-amber-300">
            (overrides cached supplier price)
          </span>
        )}
      </div>
    </div>
  );
}
