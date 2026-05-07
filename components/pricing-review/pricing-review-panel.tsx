"use client";

import { memo, useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Check, AlertCircle, X, Info, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { BUILT_IN_SUPPLIER_NAMES, SUPPLIER_METADATA } from "@/lib/supplier-metadata";
import type { BuiltInSupplierName } from "@/lib/supplier-metadata";
import type { SupplierQuote, OverageTier } from "@/lib/pricing/types";
import { getOverage } from "@/lib/pricing/overage";

// ---------------------------------------------------------------------------
// Component Pricing Review — top-to-bottom workflow:
//   1. CEO picks which suppliers to query (global checkbox grid)
//   2. Sets the tier quantities they want prices for (default 1/10/100/500/1000)
//   3. Clicks "Fetch Prices" — all BOM lines × selected suppliers fire in
//      parallel, results populate the table below
//   4. For each BOM line × tier, a radio group lets the user pick which
//      supplier's price wins — persisted in `bom_line_pricing`.
// ---------------------------------------------------------------------------

interface BomLine {
  id: string;
  line_number: number;
  quantity: number;
  reference_designator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  m_code: string | null;
  pin_count: number | null;
}

type QuoteWithCad = SupplierQuote & {
  unit_price_cad: number | null;
  fx_rate_applied: number | null;
  from_cache?: boolean;
  cache_age_hours?: number | null;
  fetched_at?: string | null;
};

type FetchMode = "cache_only" | "cache_first" | "live";

interface LineCachedStats {
  cache_hits: number;
  live_hits: number;
  skipped: number;
}

interface Selection {
  bom_line_id: string;
  tier_qty: number;
  supplier: string;
  supplier_part_number: string | null;
  selected_unit_price: number;
  selected_currency: string;
  selected_unit_price_cad: number | null;
  fx_rate: number | null;
  selected_lead_time_days: number | null;
  selected_stock_qty: number | null;
  warehouse_code: string | null;
  notes: string | null;
  selected_at: string;
}

interface CachedQuoteRow {
  source: string;
  search_key: string;
  unit_price: number | null;
  currency: string | null;
  stock_qty: number | null;
  manufacturer: string | null;
  supplier_part_number: string | null;
  price_breaks: unknown;
  lead_time_days: number | null;
  moq: number | null;
  order_multiple: number | null;
  lifecycle_status: string | null;
  ncnr: boolean | null;
  franchised: boolean | null;
  warehouse_code: string | null;
  fetched_at: string;
}

interface FxRateRow {
  from_currency: string;
  to_currency: string;
  rate: number;
  source: "live" | "manual";
  fetched_at: string;
}

interface Alternate {
  id: string;
  bom_line_id: string;
  mpn: string;
  manufacturer: string | null;
  source: "primary" | "customer" | "rs_alt" | "operator" | string;
  rank: number;
  notes: string | null;
}

interface PricingPreference {
  id: string;
  name: string;
  rule: string;
  config: Record<string, unknown>;
  is_system: boolean;
}

interface Props {
  bomId: string;
  lines: BomLine[];
  initialSelections: Selection[];
  initialCachedQuotes: CachedQuoteRow[];
  initialFxRates: FxRateRow[];
  /** Overage rows from the `overage_table` — drives qty/extras/order-qty math. */
  overages: OverageTier[];
  credentialStatus: Record<string, boolean>;
  /**
   * Wizard context (optional). When present the panel exposes auto-pick +
   * customer-supplied features tied to this quote. When null the page is in
   * "standalone BOM review" mode and those features are hidden.
   */
  quoteId?: string | null;
  tiersFromQuote?: number[];
  initialPreferences?: PricingPreference[];
  pinnedPreferenceId?: string | null;
  initialCustomerSupplied?: string[];   // list of bom_line_ids
  /**
   * Map from a line id on THIS BOM to every prior quote (for the same
   * customer) where a bom_line with matching CPC or MPN was flagged as
   * customer-supplied. Renders as a small reminder badge on each affected
   * line so the operator knows the part was historically CS without
   * auto-flagging it on this quote.
   */
  priorCustomerSuppliedByLineId?: Record<
    string,
    Array<{
      quote_number: string;
      gmp_number: string | null;
      board_name: string | null;
      marked_at: string | null;
      bom_id: string;
    }>
  >;
  initialAlternates?: Alternate[];
}

const DEFAULT_TIERS = [1, 10, 100, 500, 1000];
const FX_CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY"];

export function PricingReviewPanel(props: Props) {
  const {
    bomId,
    lines,
    initialSelections,
    initialCachedQuotes,
    initialFxRates,
    overages,
    credentialStatus,
    quoteId = null,
    tiersFromQuote,
    initialPreferences = [],
    pinnedPreferenceId = null,
    initialCustomerSupplied = [],
    priorCustomerSuppliedByLineId = {},
    initialAlternates = [],
  } = props;
  const wizardMode = Boolean(quoteId);
  const router = useRouter();

  // ---- Supplier selection ----
  // Start with no distributors pre-selected — the operator picks which
  // APIs to query on each visit.
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<BuiltInSupplierName>>(
    new Set()
  );

  // Display filter — separate from `selectedSuppliers` (which gates the fetch
  // / auto-pick scope). The toolbar dropdown writes to this set so the
  // operator can hide a distributor's quotes from the panel and Excel export
  // without losing them from the fetch scope. Empty = show all.
  const [displayedSuppliers, setDisplayedSuppliers] = useState<Set<BuiltInSupplierName>>(
    new Set()
  );

  // ---- Tier configuration ----
  // In wizard mode the tiers are locked to whatever Step 1 saved and come in
  // as a prop on every render — deriving them directly from the prop keeps us
  // in sync if the server re-fetches after a save. Standalone mode still
  // has an editable local-state version (user types tier list + Apply).
  const [localTiers, setLocalTiers] = useState<number[]>(
    tiersFromQuote && tiersFromQuote.length > 0 ? tiersFromQuote : DEFAULT_TIERS
  );
  // Wizard mode: always trust tiersFromQuote (even when empty). An empty
  // prop means step 1 hasn't been saved yet — showing DEFAULT_TIERS in the
  // meantime flashed "1, 10, 100, 500, 1000" for a beat before the real
  // values arrived via router.refresh(). Standalone mode still falls back
  // to localTiers for the local editable list.
  const tiers = quoteId
    ? (tiersFromQuote ?? [])
    : localTiers;
  const [tierInputRaw, setTierInputRaw] = useState<string>(
    (tiersFromQuote && tiersFromQuote.length > 0 ? tiersFromQuote : DEFAULT_TIERS).join(", ")
  );

  // ---- Pricing preferences (wizard mode) ----
  const [preferences, setPreferences] = useState<PricingPreference[]>(initialPreferences);
  const [pickedPreferenceId, setPickedPreferenceId] = useState<string | null>(pinnedPreferenceId);
  const [applyingPref, setApplyingPref] = useState(false);

  // ---- Customer-supplied parts (wizard mode) ----
  const [customerSupplied, setCustomerSupplied] = useState<Set<string>>(
    () => new Set(initialCustomerSupplied)
  );
  const [togglingSupplied, setTogglingSupplied] = useState<string | null>(null);

  // After router.refresh() the server page re-fetches selections + customer-
  // supplied; these effects copy the new props into local state so the UI
  // reflects server-side changes (auto-pick, etc.) without a full reload.
  useEffect(() => {
    const m = new Map<string, Selection>();
    for (const s of initialSelections) m.set(`${s.bom_line_id}|${s.tier_qty}`, s);
    setSelectionsMap(m);
  }, [initialSelections]);

  useEffect(() => {
    setCustomerSupplied(new Set(initialCustomerSupplied));
  }, [initialCustomerSupplied]);

  // ---- Fetch state ----
  const [fetching, setFetching] = useState(false);
  const [supplierProgress, setSupplierProgress] = useState<
    Record<string, { done: number; total: number }>
  >({});
  const [overallDone, setOverallDone] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);
  // AbortController for the in-flight streaming fetch. Set when fetchPrices
  // starts, cleared in finally. `stopAll()` calls .abort() on this AND POSTs
  // /pricing-review/cancel so the server tears down work too.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Stable identifier for the current fetch — generated client-side and sent
  // in the body. Used as the key the server's cancel-registry tracks so the
  // /cancel endpoint can abort the right request.
  const requestIdRef = useRef<string | null>(null);
  // Suppliers the user has clicked "X" on during the current fetch. We POST
  // /cancel for each so the server stops issuing API calls / cache writes,
  // and we also drop any straggling events that arrive after the abort
  // propagates. The ref is for synchronous access inside handleEvent.
  const [stoppedSuppliers, setStoppedSuppliers] = useState<Set<string>>(new Set());
  const stoppedSuppliersRef = useRef<Set<string>>(new Set());

  // ---- Fetch-mode selector ----
  const [fetchMode, setFetchMode] = useState<FetchMode>("cache_first");
  const [maxCacheAgeHours, setMaxCacheAgeHours] = useState(24);
  // Per-line cache/live/skipped tallies from `line_cached` SSE events.
  const [lineCacheStats, setLineCacheStats] = useState<Map<string, LineCachedStats>>(
    new Map()
  );
  // Per-line supplier errors from the `line_done` event payload. Surfaces
  // 429 / timeout / parse errors that would otherwise be swallowed and make
  // the line look like it simply had "no quotes" when the real problem is
  // rate-limit or connectivity.
  const [lineErrors, setLineErrors] = useState<
    Map<string, Array<{ supplier: string; mpn: string; error: string }>>
  >(new Map());

  // ---- Alternates state (per line) ----
  const [alternatesMap, setAlternatesMap] = useState<Map<string, Alternate[]>>(() => {
    const m = new Map<string, Alternate[]>();
    for (const a of initialAlternates) {
      const arr = m.get(a.bom_line_id) ?? [];
      arr.push(a);
      m.set(a.bom_line_id, arr);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => a.rank - b.rank);
      m.set(k, arr);
    }
    return m;
  });
  const [addingAlt, setAddingAlt] = useState<string | null>(null);
  // bom_line_id -> quotes[]
  const [quotesMap, setQuotesMap] = useState<Map<string, QuoteWithCad[]>>(() => {
    const m = new Map<string, QuoteWithCad[]>();
    // Hydrate from cached rows. Multi-warehouse suppliers (Arrow, Newark)
    // write keys like "MPN#VM5"; strip the "#WAREHOUSE" suffix to match the
    // line's plain MPN lookup below so those rows aren't lost on reload.
    const byKey = new Map<string, CachedQuoteRow[]>();
    for (const row of initialCachedQuotes) {
      const baseKey = row.search_key.split("#")[0];
      const arr = byKey.get(baseKey) ?? [];
      arr.push(row);
      byKey.set(baseKey, arr);
    }
    for (const line of lines) {
      // Collect every upstream key that might carry quotes for this line:
      // primary MPN, CPC, AND every alternate MPN (bom_line_alternates —
      // customer-supplied, rs_alt replacement, operator-added). Auto-pick
      // searches by the same broadened set, so without this the UI would
      // be missing rows the picker could still pin → blue highlights for
      // "invisible" suppliers and the operator-visible badge count off.
      const keys = new Set<string>();
      if (line.mpn) keys.add(line.mpn.toUpperCase());
      if (line.cpc) keys.add(line.cpc.toUpperCase());
      const alts = initialAlternates.filter((a) => a.bom_line_id === line.id);
      for (const a of alts) {
        if (a.mpn && a.mpn.trim()) keys.add(a.mpn.trim().toUpperCase());
      }
      if (keys.size === 0) continue;

      const merged: QuoteWithCad[] = [];
      const seen = new Set<string>();
      for (const k of keys) {
        const cached = byKey.get(k);
        if (!cached) continue;
        for (const r of cached) {
          if (r.unit_price == null || r.unit_price <= 0) continue;
          // Dedupe by (source, supplier_part_number, warehouse_code) since
          // the same cached row will usually match under multiple keys
          // (e.g. mpn + cpc + alt all point to the same real part).
          const dedupe = `${r.source}|${r.supplier_part_number ?? ""}|${r.warehouse_code ?? ""}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          merged.push({
            source: r.source,
            mpn: k,
            manufacturer: r.manufacturer,
            supplier_part_number: r.supplier_part_number,
            unit_price: r.unit_price!,
            currency: r.currency ?? "USD",
            price_breaks: Array.isArray(r.price_breaks) ? (r.price_breaks as SupplierQuote["price_breaks"]) : [],
            stock_qty: r.stock_qty,
            moq: r.moq,
            order_multiple: r.order_multiple,
            lead_time_days: r.lead_time_days,
            warehouse_code: r.warehouse_code,
            ncnr: r.ncnr,
            franchised: r.franchised,
            lifecycle_status: r.lifecycle_status,
            datasheet_url: null,
            product_url: null,
            unit_price_cad: null,
            fx_rate_applied: null,
          });
        }
      }
      if (merged.length > 0) {
        // Future Electronics' API returns many rows per MPN (different
        // SKU / packaging / stocking location), most with stock=0. Prune
        // to in-stock only when any exist; otherwise keep one row so the
        // supplier is still represented. Applied per-line so only Future
        // is affected.
        const futureRows = merged.filter((q) => q.source === "future");
        if (futureRows.length > 1) {
          const futureInStock = futureRows.filter(
            (q) => q.stock_qty != null && q.stock_qty > 0
          );
          const keptFuture =
            futureInStock.length > 0 ? futureInStock : [futureRows[0]];
          const pruned = merged
            .filter((q) => q.source !== "future")
            .concat(keptFuture);
          m.set(line.id, pruned);
        } else {
          m.set(line.id, merged);
        }
      }
    }
    return m;
  });

  // ---- Selections state ----
  // key format: `${bom_line_id}|${tier_qty}`
  const [selectionsMap, setSelectionsMap] = useState<Map<string, Selection>>(() => {
    const m = new Map<string, Selection>();
    for (const s of initialSelections) {
      m.set(`${s.bom_line_id}|${s.tier_qty}`, s);
    }
    return m;
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // ---- FX rates ----
  const [fxRates, setFxRates] = useState<Map<string, FxRateRow>>(() => {
    const m = new Map<string, FxRateRow>();
    for (const r of initialFxRates) m.set(`${r.from_currency}→${r.to_currency}`, r);
    return m;
  });
  const [fxFetching, setFxFetching] = useState(false);

  // ---- Expanded rows ----
  // Only one row is expanded at a time — opening another collapses the prior.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ---- Selected rows (for bulk refresh) ----
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const toggleLineSelected = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  // ---- Per-line refresh in flight ----
  // Tracks lines whose price fetch is currently running so the per-row Refresh
  // button can disable itself instead of letting the user fire duplicate
  // requests against the same line.
  const [refreshingLines, setRefreshingLines] = useState<Set<string>>(new Set());

  // ---- Search ----
  // Free-text filter applied alongside the summary chip. Matches against
  // CPC / MPN / manufacturer / description / reference designator (case
  // insensitive). When a search is active, "Refresh visible" still works
  // against whatever the user is currently looking at.
  const [searchQuery, setSearchQuery] = useState("");

  // -------- Handlers --------

  const toggleSupplier = (s: BuiltInSupplierName) => {
    setSelectedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const applyTierInput = () => {
    const parsed = tierInputRaw
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (parsed.length === 0) {
      toast.error("Enter at least one positive integer for tier qty");
      return;
    }
    setLocalTiers([...new Set(parsed)].sort((a, b) => a - b));
  };

  const fetchLiveFx = useCallback(async () => {
    setFxFetching(true);
    try {
      const res = await fetch("/api/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_live", currencies: FX_CURRENCIES, to: "CAD" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const newMap = new Map(fxRates);
      for (const r of (data.rates as FxRateRow[]) ?? []) {
        newMap.set(`${r.from_currency}→${r.to_currency}`, r);
      }
      setFxRates(newMap);
      toast.success("FX rates refreshed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to fetch live rates", { description: msg });
    } finally {
      setFxFetching(false);
    }
  }, [fxRates]);

  const saveFxManual = async (from: string, rate: number) => {
    try {
      const res = await fetch("/api/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", from, to: "CAD", rate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const newMap = new Map(fxRates);
      newMap.set(`${from}→CAD`, data.rate);
      setFxRates(newMap);
      toast.success(`Saved manual rate ${from} → CAD: ${rate}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to save manual rate", { description: msg });
    }
  };

  // Per-line order-qty table: for each BOM line, the list of order qtys that
  // correspond 1:1 with `tiers`. order_qty = qty_per_board × tier + extras.
  // Memoized so the tier columns, the "Fetch Prices" payload, and the
  // priceAtTier lookup all use the same numbers.
  const orderQtysByLine = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const line of lines) {
      const qtyPerBoard = line.quantity ?? 0;
      // Overage thresholds are PART counts, not board counts — pass the
      // base part qty (qty_per_board × tier) into getOverage. Passing the
      // tier directly would only ever match the smallest threshold for
      // common tier sizes (50/100/250/500), making CP/IP overage way too
      // low for almost every quote.
      m[line.id] = tiers.map((t) => {
        const base = qtyPerBoard * t;
        return base + getOverage(line.m_code, base, overages);
      });
    }
    return m;
  }, [lines, tiers, overages]);

  const fetchPrices = async (lineIds?: string[]) => {
    if (selectedSuppliers.size === 0) {
      toast.error("Select at least one distributor");
      return;
    }
    // Mark the targeted lines as in-flight so the per-row Refresh button
    // disables itself while their fetch runs. When `lineIds` is omitted (top
    // "Fetch Prices" hits the full BOM), the global `fetching` flag already
    // covers the per-row buttons, so no need to populate this set with every
    // line id.
    if (lineIds && lineIds.length > 0) {
      setRefreshingLines((prev) => {
        const next = new Set(prev);
        for (const id of lineIds) next.add(id);
        return next;
      });
    }
    setFetching(true);
    setSupplierProgress({});
    setOverallDone(0);
    setOverallTotal(0);
    setStoppedSuppliers(new Set());
    stoppedSuppliersRef.current = new Set();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = requestId;
    const linesWithQuotes: string[] = [];
    let quotesCount = 0;
    let apiCalls = 0;
    let cacheHitsTotal = 0;
    let linesSkippedTotal = 0;
    try {
      const targetLineIds = lineIds ?? lines.map((l) => l.id);
      const tierOrderQtys: Record<string, number[]> = {};
      for (const id of targetLineIds) {
        if (orderQtysByLine[id]) tierOrderQtys[id] = orderQtysByLine[id];
      }

      const res = await fetch(`/api/bom/${bomId}/pricing-review/fetch`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suppliers: Array.from(selectedSuppliers),
          bom_line_ids: lineIds,
          tier_order_qtys: tierOrderQtys,
          mode: fetchMode,
          request_id: requestId,
          // Send max-age for BOTH cache-consulting modes — "cache_only" users
          // also want the "never show me anything older than N hours" guard,
          // not just the default 7-day expires_at TTL.
          max_cache_age_hours:
            fetchMode === "cache_first" || fetchMode === "cache_only"
              ? Number.isFinite(maxCacheAgeHours) && maxCacheAgeHours > 0
                ? maxCacheAgeHours
                : 24
              : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Batch stream events and flush all accumulated state changes once per
      // animation frame. At 13 suppliers × 64 lines we were emitting ~1700
      // individual setState calls, each triggering a full re-render of the
      // (large) pricing panel — that's the source of the typing/expand lag.
      // Coalescing into one setState per frame keeps the UI responsive.
      const pendingSupplierProgress: Record<string, { done: number; total: number }> = {};
      const pendingLineCacheStats = new Map<string, LineCachedStats>();
      const pendingAppendQuotes = new Map<string, QuoteWithCad[]>();
      const pendingLineDone = new Map<string, {
        quotes: QuoteWithCad[];
        errors: Array<{ supplier: string; mpn: string; error: string }>;
      }>();
      let flushScheduled = false;
      let doneFlushResolve: (() => void) | null = null;

      const flush = () => {
        flushScheduled = false;

        if (Object.keys(pendingSupplierProgress).length > 0) {
          const snapshot = { ...pendingSupplierProgress };
          for (const k of Object.keys(pendingSupplierProgress)) delete pendingSupplierProgress[k];
          setSupplierProgress((prev) => {
            const next = { ...prev, ...snapshot };
            let sum = 0;
            for (const k of Object.keys(next)) sum += next[k].done;
            setOverallDone(sum);
            return next;
          });
        }

        if (pendingLineCacheStats.size > 0) {
          const snapshot = new Map(pendingLineCacheStats);
          pendingLineCacheStats.clear();
          setLineCacheStats((prev) => {
            const next = new Map(prev);
            for (const [k, v] of snapshot) next.set(k, v);
            return next;
          });
        }

        if (pendingAppendQuotes.size > 0 || pendingLineDone.size > 0) {
          const appendSnap = new Map(pendingAppendQuotes);
          pendingAppendQuotes.clear();
          const doneSnap = new Map(pendingLineDone);
          pendingLineDone.clear();
          setQuotesMap((prev) => {
            const next = new Map(prev);
            // Append events arrive per-supplier mid-fetch; merge them onto
            // what's already there.
            for (const [lineId, quotes] of appendSnap) {
              if (doneSnap.has(lineId)) continue; // done handles this line below
              const existing = next.get(lineId) ?? [];
              next.set(lineId, [...existing, ...quotes]);
            }
            // line_done is PARTIALLY authoritative — only for the suppliers
            // the fetch actually processed. Replacing the whole line wipes
            // cache-hydrated rows from suppliers the user didn't select this
            // time (e.g. they fetched Mouser only but LCSC cache rows had
            // been loaded at page-init). Merge per-source instead: drop
            // existing rows for sources that appear in the new result, then
            // prepend the new rows.
            for (const [lineId, { quotes: newQuotes }] of doneSnap) {
              const existing = next.get(lineId) ?? [];
              const sourcesTouched = new Set(newQuotes.map((q) => q.source));
              const surviving = existing.filter((q) => !sourcesTouched.has(q.source));
              // Dedupe the merged list against surviving entries.
              const seen = new Set(
                surviving.map(
                  (q) => `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`
                )
              );
              const merged: QuoteWithCad[] = [...surviving];
              for (const q of newQuotes) {
                const sig = `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
                if (seen.has(sig)) continue;
                seen.add(sig);
                merged.push(q);
              }
              next.set(lineId, merged);
            }
            return next;
          });
          if (doneSnap.size > 0) {
            setLineErrors((prev) => {
              const next = new Map(prev);
              for (const [lineId, { errors }] of doneSnap) {
                if (errors.length === 0) next.delete(lineId);
                else next.set(lineId, errors);
              }
              return next;
            });
          }
        }

        if (doneFlushResolve) {
          const r = doneFlushResolve;
          doneFlushResolve = null;
          r();
        }
      };

      const scheduleFlush = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        // rAF keeps flushes aligned with paint; on hidden tabs it falls back
        // to setTimeout so state still progresses during backgrounded fetch.
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(flush);
        } else {
          setTimeout(flush, 16);
        }
      };

      const handleEvent = (evt: Record<string, unknown>) => {
        const type = evt.type as string;
        // Drop any event tied to a supplier the user has clicked "X" on.
        // The server keeps emitting them; the client just ignores so the
        // stopped supplier's progress freezes and no quotes get added.
        const evtSupplier = evt.supplier as string | undefined;
        if (evtSupplier && stoppedSuppliersRef.current.has(evtSupplier)) return;
        if (type === "init") {
          const suppliers = (evt.suppliers as string[]) ?? [];
          const linesTotal = (evt.lines_total as number) ?? 0;
          const seed: Record<string, { done: number; total: number }> = {};
          for (const s of suppliers) seed[s] = { done: 0, total: linesTotal };
          // init is a one-shot reset — apply immediately, don't batch.
          setSupplierProgress(seed);
          setOverallTotal(suppliers.length * linesTotal);
          setOverallDone(0);
        } else if (type === "supplier_progress") {
          const supplier = evt.supplier as string;
          const done = (evt.lines_done as number) ?? 0;
          const total = (evt.lines_total as number) ?? 0;
          pendingSupplierProgress[supplier] = { done, total };
          scheduleFlush();
        } else if (type === "line_cached") {
          const lineId = evt.bom_line_id as string;
          pendingLineCacheStats.set(lineId, {
            cache_hits: (evt.cache_hits as number) ?? 0,
            live_hits: (evt.live_hits as number) ?? 0,
            skipped: (evt.skipped as number) ?? 0,
          });
          scheduleFlush();
        } else if (type === "line_quotes_append") {
          const lineId = evt.bom_line_id as string;
          const allQuotes = (evt.quotes as QuoteWithCad[]) ?? [];
          // Drop quotes whose source the user stopped mid-fetch.
          const quotes = stoppedSuppliersRef.current.size === 0
            ? allQuotes
            : allQuotes.filter((q) => !stoppedSuppliersRef.current.has(q.source));
          if (quotes.length > 0) {
            // Dedupe against what's already pending for this line — protects
            // against the rare case where the server emits the same cached
            // row under multiple search keys (line.mpn, line.cpc, mpn_to_use).
            const existing = pendingAppendQuotes.get(lineId) ?? [];
            const seen = new Set(
              existing.map(
                (q) =>
                  `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`
              )
            );
            for (const q of quotes) {
              const sig = `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
              if (seen.has(sig)) continue;
              seen.add(sig);
              existing.push(q);
            }
            pendingAppendQuotes.set(lineId, existing);
            scheduleFlush();
          }
        } else if (type === "line_done") {
          const lineId = evt.bom_line_id as string;
          const allQuotes = (evt.quotes as QuoteWithCad[]) ?? [];
          const allErrors = (evt.errors as Array<{ supplier: string; mpn: string; error: string }>) ?? [];
          const quotes = stoppedSuppliersRef.current.size === 0
            ? allQuotes
            : allQuotes.filter((q) => !stoppedSuppliersRef.current.has(q.source));
          const errors = stoppedSuppliersRef.current.size === 0
            ? allErrors
            : allErrors.filter((e) => !stoppedSuppliersRef.current.has(e.supplier));
          pendingLineDone.set(lineId, { quotes, errors });
          if (quotes.length > 0) {
            linesWithQuotes.push(lineId);
            quotesCount += quotes.length;
          }
          scheduleFlush();
        } else if (type === "supplier_cancelled") {
          // Server confirmed it tore down the supplier's work. Mark stopped
          // in case the X was triggered by something other than the per-row
          // button (e.g. master Stop All cascading down).
          const s = evt.supplier as string | undefined;
          if (s) {
            setStoppedSuppliers((prev) => {
              if (prev.has(s)) return prev;
              const next = new Set(prev);
              next.add(s);
              stoppedSuppliersRef.current = next;
              return next;
            });
          }
        } else if (type === "done") {
          apiCalls = (evt.api_calls as number) ?? 0;
          cacheHitsTotal = (evt.cache_hits as number) ?? 0;
          linesSkippedTotal = (evt.lines_skipped as number) ?? 0;
        } else if (type === "error") {
          throw new Error((evt.error as string) ?? "Stream error");
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            handleEvent(evt);
          } catch {
            // ignore unparseable fragment
          }
        }
      }

      toast.success(
        `Fetched ${quotesCount} quote${quotesCount === 1 ? "" : "s"} — ${apiCalls} live API call${apiCalls === 1 ? "" : "s"}, ${cacheHitsTotal} cache hit${cacheHitsTotal === 1 ? "" : "s"}, ${linesSkippedTotal} line${linesSkippedTotal === 1 ? "" : "s"} skipped`,
        { description: `${linesWithQuotes.length} line${linesWithQuotes.length === 1 ? "" : "s"} with quotes` }
      );
    } catch (e) {
      const isAbort =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (isAbort) {
        toast.message("Price fetch stopped");
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("Price fetch failed", { description: msg });
      }
    } finally {
      setFetching(false);
      abortControllerRef.current = null;
      if (lineIds && lineIds.length > 0) {
        setRefreshingLines((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          for (const id of lineIds) next.delete(id);
          return next;
        });
      }
    }
  };

  // ---- Stop handlers ----
  // Both call the server-side /pricing-review/cancel endpoint to abort the
  // in-flight work for the request. The server stops scheduling new lines
  // / API calls for the cancelled supplier(s) and emits `supplier_cancelled`.
  // We also keep `stoppedSuppliers` updated immediately for UI feedback —
  // the server response can lag a second behind.
  const stopAll = useCallback(async () => {
    const reqId = requestIdRef.current;
    // Abort the local stream first so the user sees the spinner stop, even
    // if the cancel POST takes a moment.
    abortControllerRef.current?.abort();
    if (!reqId) return;
    try {
      await fetch(`/api/bom/${bomId}/pricing-review/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: reqId }),
      });
    } catch {
      // Best-effort — the local abort already gave the user feedback.
    }
  }, [bomId]);

  const stopSupplier = useCallback(async (supplier: string) => {
    const reqId = requestIdRef.current;
    setStoppedSuppliers((prev) => {
      if (prev.has(supplier)) return prev;
      const next = new Set(prev);
      next.add(supplier);
      stoppedSuppliersRef.current = next;
      return next;
    });
    if (!reqId) return;
    try {
      await fetch(`/api/bom/${bomId}/pricing-review/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: reqId, supplier }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to stop ${supplier}`, { description: msg });
    }
  }, [bomId]);

  // ---- Alternate MPN handlers ----
  const addAlternate = async (lineId: string, mpn: string, manufacturer: string) => {
    if (!mpn.trim()) {
      toast.error("MPN required");
      return;
    }
    setAddingAlt(lineId);
    try {
      const res = await fetch(`/api/bom-lines/${lineId}/alternates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mpn: mpn.trim(),
          manufacturer: manufacturer.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.error(data.error ?? "MPN already on this line");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAlternatesMap((prev) => {
        const next = new Map(prev);
        const arr = [...(next.get(lineId) ?? []), data as Alternate];
        arr.sort((a, b) => a.rank - b.rank);
        next.set(lineId, arr);
        return next;
      });
      toast.success("Alternate added");
      // Refresh this line's prices
      fetchPrices([lineId]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to add alternate", { description: msg });
    } finally {
      setAddingAlt(null);
    }
  };

  const deleteAlternate = async (lineId: string, alt: Alternate) => {
    try {
      const res = await fetch(`/api/bom-lines/${lineId}/alternates/${alt.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setAlternatesMap((prev) => {
        const next = new Map(prev);
        const arr = (next.get(lineId) ?? []).filter((a) => a.id !== alt.id);
        next.set(lineId, arr);
        return next;
      });
      // Remove quotes whose MPN matches the removed alternate
      const removedMpn = alt.mpn.toUpperCase();
      setQuotesMap((prev) => {
        const next = new Map(prev);
        const arr = next.get(lineId);
        if (arr) {
          next.set(
            lineId,
            arr.filter((q) => (q.mpn ?? "").toUpperCase() !== removedMpn)
          );
        }
        return next;
      });
      toast.success("Alternate removed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to remove alternate", { description: msg });
    }
  };

  const saveSelection = async (
    line: BomLine,
    tier: number,
    quote: QuoteWithCad
  ) => {
    const key = `${line.id}|${tier}`;
    const tierIdx = tiers.indexOf(tier);
    const orderQty = tierIdx >= 0 ? orderQtysByLine[line.id]?.[tierIdx] ?? tier : tier;
    setSavingKey(key);
    try {
      const res = await fetch(`/api/bom/lines/${line.id}/pricing-selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier_qty: tier,
          supplier: quote.source,
          supplier_part_number: quote.supplier_part_number,
          // Price snapshot is for the actual ORDER qty (board qty × per-board +
          // overage extras), not the raw tier qty — that's what matches the
          // break tables we fetched from the suppliers.
          selected_unit_price: priceAtTier(quote, orderQty),
          selected_currency: quote.currency,
          selected_lead_time_days: quote.lead_time_days,
          selected_stock_qty: quote.stock_qty,
          warehouse_code: quote.warehouse_code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const newMap = new Map(selectionsMap);
      newMap.set(key, data.selection);
      setSelectionsMap(newMap);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to save selection", { description: msg });
    } finally {
      setSavingKey(null);
    }
  };

  const clearSelection = async (lineId: string, tier: number) => {
    const key = `${lineId}|${tier}`;
    try {
      const res = await fetch(
        `/api/bom/lines/${lineId}/pricing-selection?tier_qty=${tier}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const newMap = new Map(selectionsMap);
      newMap.delete(key);
      setSelectionsMap(newMap);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to clear selection", { description: msg });
    }
  };

  // Single-row expansion: clicking a row collapses any other expanded row
  // and opens this one. Clicking the same row collapses it.
  const toggleExpand = (lineId: string) => {
    setExpanded((prev) => {
      if (prev.has(lineId)) return new Set();
      return new Set([lineId]);
    });
  };

  // ---- Wizard-only: apply preference rule to every line on this quote ----
  const applyPreference = async () => {
    if (!quoteId || !pickedPreferenceId) return;
    setApplyingPref(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/auto-pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preference_id: pickedPreferenceId,
          // Scope the pick to the distributors the operator currently has
          // selected on the left rail. Previously auto-pick considered every
          // cached quote regardless of whether that supplier was active,
          // producing blue picks for rows that weren't even on screen.
          suppliers: Array.from(selectedSuppliers),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(
        `Applied preference — ${data.picks_applied} picks`,
        data.unresolved_lines > 0
          ? {
              description: `${data.unresolved_lines} line${
                data.unresolved_lines === 1 ? "" : "s"
              } couldn't be matched. Likely reasons: quotes only exist for distributors you've unchecked, or the MPN/CPC on the BOM line doesn't match any cached search key.`,
            }
          : undefined
      );
      // Ask the server page to re-fetch bom_line_pricing; the updated prop
      // flows back in and the useEffect below syncs it into local state.
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Preference apply failed", { description: msg });
    } finally {
      setApplyingPref(false);
    }
  };

  // ---- Wizard-only: toggle customer-supplied flag on a BOM line ----
  const toggleCustomerSupplied = async (lineId: string) => {
    if (!quoteId) return;
    const isSupplied = customerSupplied.has(lineId);
    setTogglingSupplied(lineId);
    try {
      const res = isSupplied
        ? await fetch(
            `/api/quotes/${quoteId}/customer-supplied?bom_line_id=${lineId}`,
            { method: "DELETE" }
          )
        : await fetch(`/api/quotes/${quoteId}/customer-supplied`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bom_line_id: lineId }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setCustomerSupplied((prev) => {
        const next = new Set(prev);
        if (isSupplied) next.delete(lineId);
        else next.add(lineId);
        return next;
      });

      // Marking as supplied clears any pinned selections server-side; reflect
      // that in the local selections map so tier cells update immediately.
      if (!isSupplied) {
        setSelectionsMap((prev) => {
          const next = new Map(prev);
          for (const key of Array.from(next.keys())) {
            if (key.startsWith(`${lineId}|`)) next.delete(key);
          }
          return next;
        });
      }
      toast.success(isSupplied ? "Marked as RS-procured" : "Marked as customer-supplied");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to toggle customer-supplied", { description: msg });
    } finally {
      setTogglingSupplied(null);
    }
  };

  // -------- Excel export --------

  const exportQuotesToExcel = () => {
    const maxTier = tiers.length > 0 ? Math.max(...tiers) : 0;

    // First pass: figure out which suppliers ever had an in-stock quote across
    // the BOM. Only those suppliers get a column — keeps the sheet narrow.
    // Honors the operator's distributor selection: deselected suppliers are
    // omitted from both column generation and the per-line lookups below.
    const supplierKeys = new Set<string>();
    for (const line of lines) {
      const qs = visibleQuotesByLine.get(line.id) ?? [];
      for (const q of qs) {
        if (q.stock_qty != null && q.stock_qty > 0) supplierKeys.add(q.source);
      }
    }
    const supplierOrder = BUILT_IN_SUPPLIER_NAMES.filter((s) => supplierKeys.has(s));
    for (const s of supplierKeys) {
      if (!supplierOrder.includes(s as BuiltInSupplierName)) supplierOrder.push(s as BuiltInSupplierName);
    }

    const cadPrice = (q: QuoteWithCad, atQty: number): number | null => {
      const native = priceAtTier(q, atQty);
      if (q.fx_rate_applied != null) return native * q.fx_rate_applied;
      if (q.currency === "CAD") return native;
      return null;
    };

    const rows: Record<string, string | number | null>[] = [];
    for (const line of lines) {
      const allQuotes = visibleQuotesByLine.get(line.id) ?? [];
      const inStock = allQuotes.filter((q) => q.stock_qty != null && q.stock_qty > 0);
      const orderQtys = orderQtysByLine[line.id] ?? tiers;
      const requiredQty = orderQtys.length > 0 ? Math.max(...orderQtys) : 0;
      const picked = maxTier > 0 ? selectionsMap.get(`${line.id}|${maxTier}`) ?? null : null;

      // For each supplier column on this row, pick the cheapest in-stock quote
      // for that supplier. Multiple SKUs from the same supplier (e.g. Newark's
      // 34R4560 / 35AH4828 / 01AM0319) collapse to whichever offers the best
      // CAD extended price at the required qty (matches what the panel's
      // ranking does — a low unit price with a punishing MOQ shouldn't beat a
      // higher unit with no minimum).
      type SupplierCell = {
        cad: number | null;
        stock: number | null;
        moq: number | null;
        order_multiple: number | null;
        ext_cad: number | null;
        lead_time_days: number | null;
        lifecycle_status: string | null;
        mpn: string | null;
      };
      const effectiveQtyFor = (q: QuoteWithCad): number => {
        const moq = q.moq ?? 0;
        const mult = q.order_multiple ?? 1;
        let eff = Math.max(requiredQty, moq);
        if (mult > 1) eff = Math.ceil(eff / mult) * mult;
        return eff;
      };
      const perSupplier: Record<string, SupplierCell> = {};
      for (const s of supplierOrder) {
        const supplierQuotes = inStock.filter((q) => q.source === s);
        if (supplierQuotes.length === 0) {
          perSupplier[s] = {
            cad: null,
            stock: null,
            moq: null,
            order_multiple: null,
            ext_cad: null,
            lead_time_days: null,
            lifecycle_status: null,
            mpn: null,
          };
          continue;
        }
        let best: { q: QuoteWithCad; cad: number; ext: number; eff: number } | null = null;
        for (const q of supplierQuotes) {
          const eff = effectiveQtyFor(q);
          const cad = cadPrice(q, eff);
          if (cad == null) continue;
          const ext = cad * eff;
          if (!best || ext < best.ext) best = { q, cad, ext, eff };
        }
        if (best) {
          perSupplier[s] = {
            cad: best.cad,
            stock: best.q.stock_qty,
            moq: best.q.moq,
            order_multiple: best.q.order_multiple,
            ext_cad: best.ext,
            lead_time_days: best.q.lead_time_days,
            lifecycle_status: best.q.lifecycle_status,
            mpn: best.q.mpn ?? null,
          };
        } else {
          // Has stock but no CAD price (missing FX) — show stock + MOQ only.
          const fallback = supplierQuotes[0];
          perSupplier[s] = {
            cad: null,
            stock: fallback.stock_qty,
            moq: fallback.moq,
            order_multiple: fallback.order_multiple,
            ext_cad: null,
            lead_time_days: fallback.lead_time_days,
            lifecycle_status: fallback.lifecycle_status,
            mpn: fallback.mpn ?? null,
          };
        }
      }

      const pickedMeta = picked
        ? SUPPLIER_METADATA[picked.supplier as BuiltInSupplierName]
        : null;
      // Find the picked quote in the candidate pool so we can read MOQ /
      // order_multiple and bump the buy qty up to the next packaging tier.
      // selected_unit_price_cad is stored at the raw order qty without the
      // MOQ/multi bump, so multiplying by required qty alone understates the
      // extended cost when the supplier has packaging minimums.
      const pickedQuote = picked
        ? allQuotes.find(
            (q) =>
              q.source === picked.supplier &&
              (q.supplier_part_number ?? "") === (picked.supplier_part_number ?? "") &&
              (q.warehouse_code ?? "") === (picked.warehouse_code ?? "")
          ) ?? null
        : null;
      let pickedUnitCad = picked?.selected_unit_price_cad ?? null;
      let pickedEffQty = requiredQty;
      if (pickedQuote) {
        const moq = pickedQuote.moq ?? 0;
        const mult = pickedQuote.order_multiple ?? 1;
        pickedEffQty = Math.max(requiredQty, moq);
        if (mult > 1) pickedEffQty = Math.ceil(pickedEffQty / mult) * mult;
        const reCad = cadPrice(pickedQuote, pickedEffQty);
        if (reCad != null) pickedUnitCad = reCad;
      }
      const pickedExtCad = pickedUnitCad != null ? pickedUnitCad * pickedEffQty : null;

      // Total stock across distributors. When the same supplier has multiple
      // SKUs (e.g. Newark with 3 variants), only count the SKU that won the
      // per-supplier cheapest-in-stock pick — that's the one shown in the
      // supplier column, so summing those keeps the columns and the total in
      // sync.
      let totalStock = 0;
      let anyStock = false;
      for (const s of supplierOrder) {
        const cell = perSupplier[s];
        if (cell?.stock != null) {
          totalStock += cell.stock;
          anyStock = true;
        }
      }

      const row: Record<string, string | number | null> = {
        "Line #": line.line_number,
        "Reference Designator": line.reference_designator ?? "",
        "CPC": line.cpc ?? "",
        "MPN": line.mpn ?? "",
        "Manufacturer": line.manufacturer ?? "",
        "Description": line.description ?? "",
        "M-Code": line.m_code ?? "",
        "Required Qty": requiredQty,
        "Total Stock": anyStock ? totalStock : null,
      };
      for (const s of supplierOrder) {
        const meta = SUPPLIER_METADATA[s];
        const name = meta?.display_name ?? s;
        const cell = perSupplier[s];
        row[`${name} MPN`] = cell?.mpn ?? "";
        row[`${name} Stock`] = cell?.stock ?? null;
        row[`${name} Lead (days)`] = cell?.lead_time_days ?? null;
        row[`${name} Lifecycle`] = cell?.lifecycle_status ?? "";
        row[`${name} MOQ`] = cell?.moq ?? null;
        row[`${name} Multi Qty`] = cell?.order_multiple ?? null;
        row[`${name} Unit (CAD)`] = cell?.cad ?? null;
        row[`${name} Ext (CAD)`] = cell?.ext_cad ?? null;
      }
      row["Picked Supplier"] = pickedMeta?.display_name ?? picked?.supplier ?? "";
      row["Picked MPN"] = pickedQuote?.mpn ?? "";
      row["Picked Stock"] = picked?.selected_stock_qty ?? null;
      row["Picked Unit Price (CAD)"] = pickedUnitCad;
      row["Picked Extended (CAD)"] = pickedExtCad;
      rows.push(row);
    }

    if (rows.length === 0) {
      toast.error("Nothing to export — fetch prices first");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Quotes");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `pricing-quotes-${stamp}.xlsx`);
    toast.success(`Exported ${rows.length} line${rows.length === 1 ? "" : "s"}`);
  };

  // -------- Derived --------

  // Classify every line into mutually useful buckets. Memoized so badge
  // counts, the badge-as-filter buttons, and the rendered line list all use
  // the same source of truth.
  type LineBucket = "unquoted" | "quoted" | "fully_picked" | "partial_picks" | "no_picks" | "customer_supplied" | "out_of_stock" | "short_stock";
  // Quotes filtered by the toolbar dropdown's display filter — separate
  // from `selectedSuppliers` (the fetch-scope state). Empty set means "show
  // all" so the page isn't blank on first paint before any supplier is
  // actively chosen as a display filter.
  const visibleQuotesByLine = useMemo(() => {
    const m = new Map<string, QuoteWithCad[]>();
    if (displayedSuppliers.size === 0) {
      for (const [lineId, quotes] of quotesMap) m.set(lineId, quotes);
      return m;
    }
    for (const [lineId, quotes] of quotesMap) {
      m.set(
        lineId,
        quotes.filter((q) => displayedSuppliers.has(q.source as BuiltInSupplierName))
      );
    }
    return m;
  }, [quotesMap, displayedSuppliers]);

  const classifyLine = useCallback(
    (lineId: string): Set<LineBucket> => {
      const set = new Set<LineBucket>();
      if (customerSupplied.has(lineId)) {
        set.add("customer_supplied");
        return set;
      }
      const q = visibleQuotesByLine.get(lineId);
      if (q && q.length > 0) set.add("quoted");
      else set.add("unquoted");
      // Out-of-stock: every cached quote (across distributors + alts) has
      // stock_qty of 0 or null. Only meaningful for "quoted" lines.
      if (q && q.length > 0 && q.every((qq) => !qq.stock_qty || qq.stock_qty <= 0)) {
        set.add("out_of_stock");
      }
      // Short stock: at least one supplier has stock, but the best stock
      // available cannot fulfill the largest tier's order qty. Mutually
      // exclusive with out_of_stock.
      if (q && q.length > 0 && !set.has("out_of_stock")) {
        const orderQtys = orderQtysByLine[lineId] ?? [];
        const maxOrderQty = orderQtys.length > 0 ? Math.max(...orderQtys) : 0;
        if (maxOrderQty > 0) {
          let bestStock = 0;
          for (const qq of q) {
            if (qq.stock_qty != null && qq.stock_qty > bestStock) bestStock = qq.stock_qty;
          }
          if (bestStock > 0 && bestStock < maxOrderQty) set.add("short_stock");
        }
      }
      const pickCount = tiers.reduce(
        (n, t) => n + (selectionsMap.has(`${lineId}|${t}`) ? 1 : 0),
        0
      );
      if (pickCount === 0) set.add("no_picks");
      else if (pickCount === tiers.length) set.add("fully_picked");
      else set.add("partial_picks");
      return set;
    },
    [customerSupplied, visibleQuotesByLine, selectionsMap, tiers, orderQtysByLine]
  );

  const summary = useMemo(() => {
    let total = 0;
    let quoted = 0;
    let unquoted = 0;
    let fullyPicked = 0;
    let partialPicks = 0;
    let noPicks = 0;
    let customerSuppliedCount = 0;
    let outOfStock = 0;
    let shortStock = 0;
    for (const line of lines) {
      total++;
      const b = classifyLine(line.id);
      if (b.has("customer_supplied")) customerSuppliedCount++;
      if (b.has("quoted")) quoted++;
      if (b.has("unquoted")) unquoted++;
      if (b.has("fully_picked")) fullyPicked++;
      if (b.has("partial_picks")) partialPicks++;
      if (b.has("no_picks")) noPicks++;
      if (b.has("out_of_stock")) outOfStock++;
      if (b.has("short_stock")) shortStock++;
    }
    return { total, quoted, unquoted, fullyPicked, partialPicks, noPicks, customerSuppliedCount, outOfStock, shortStock };
  }, [lines, classifyLine]);

  // Badge-as-filter. Clicking a badge toggles the matching filter; clicking
  // again (same bucket) clears it. null = show all.
  const [summaryFilter, setSummaryFilter] = useState<LineBucket | null>(null);

  const visibleLines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let pool = lines;
    if (summaryFilter) pool = pool.filter((l) => classifyLine(l.id).has(summaryFilter));
    if (q) {
      pool = pool.filter((l) => {
        const parts: (string | null | undefined)[] = [
          l.cpc,
          l.mpn,
          l.manufacturer,
          l.description,
          l.reference_designator,
          l.m_code,
        ];
        // Alternate MPNs (customer-supplied alts, RS substitutes,
        // operator-added alts) and the SPN/MPN/manufacturer of every cached
        // distributor quote — so searching "C456093" finds the LCSC SKU,
        // searching for an alternate MPN finds the line, etc.
        for (const a of alternatesMap.get(l.id) ?? []) {
          parts.push(a.mpn, a.manufacturer);
        }
        for (const qq of quotesMap.get(l.id) ?? []) {
          parts.push(qq.mpn, qq.supplier_part_number, qq.manufacturer, qq.source);
        }
        const haystack = parts
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return pool;
  }, [lines, summaryFilter, classifyLine, searchQuery, alternatesMap, quotesMap]);

  // Stable per-line selections arrays. Computing `tiers.map(...)` inline in
  // the JSX rebuilt a new array for every line on every render, which broke
  // React.memo's shallow compare even when nothing about that line changed —
  // so every row re-rendered on every expand toggle. By keying into this
  // memoized Map the child receives the same reference whenever the
  // underlying selectionsMap hasn't changed.
  const selectionsByLine = useMemo(() => {
    const m = new Map<string, (Selection | null)[]>();
    for (const line of lines) {
      m.set(
        line.id,
        tiers.map((t) => selectionsMap.get(`${line.id}|${t}`) ?? null)
      );
    }
    return m;
  }, [lines, tiers, selectionsMap]);
  const EMPTY_SELECTIONS = useMemo(() => [] as (Selection | null)[], []);

  return (
    <div className="space-y-6">
      {/* Top controls: distributors + tiers + FX + fetch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select Distributors</CardTitle>
          <CardDescription>
            Choose which supplier APIs to query. Greyed-out rows have no credentials configured yet — visit{" "}
            <a href="/settings/api-config" className="underline">Settings → API Config</a> to add keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const configuredSuppliers = BUILT_IN_SUPPLIER_NAMES.filter(
              (s) => credentialStatus[s]
            );
            const selectedConfigured = configuredSuppliers.filter((s) =>
              selectedSuppliers.has(s)
            ).length;
            const allSelected =
              configuredSuppliers.length > 0 &&
              selectedConfigured === configuredSuppliers.length;
            const someSelected =
              selectedConfigured > 0 && !allSelected;
            return (
              <label
                className="mb-3 inline-flex items-center gap-2 text-sm cursor-pointer select-none"
                title={
                  configuredSuppliers.length === 0
                    ? "No distributors configured"
                    : allSelected
                      ? "Deselect all distributors"
                      : "Select every configured distributor"
                }
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  disabled={configuredSuppliers.length === 0}
                  onChange={() => {
                    setSelectedSuppliers(
                      allSelected ? new Set() : new Set(configuredSuppliers)
                    );
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">
                  {allSelected ? "Deselect all" : "Select all"}
                </span>
                <span className="text-xs text-gray-500">
                  ({selectedConfigured} / {configuredSuppliers.length})
                </span>
              </label>
            );
          })()}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {BUILT_IN_SUPPLIER_NAMES.map((s) => {
              const meta = SUPPLIER_METADATA[s];
              const configured = credentialStatus[s] ?? false;
              const checked = selectedSuppliers.has(s);
              return (
                <label
                  key={s}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition ${
                    configured
                      ? checked
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      : "opacity-50 cursor-not-allowed border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!configured}
                    onChange={() => configured && toggleSupplier(s)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium">{meta.display_name}</span>
                  {!configured && (
                    <span className="text-xs text-gray-500 ml-auto">no creds</span>
                  )}
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tier editor — standalone BOM review only. In the wizard, tiers are
          locked to whatever step 1 captured and shown read-only. */}
      {wizardMode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Tier Quantities</CardTitle>
            <CardDescription>
              Set on step 1. Go back to change them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tiers.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {tiers.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No tiers set yet — complete step 1 first.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Tier Quantities</CardTitle>
            <CardDescription>
              Comma-separated board quantities you want per-tier supplier picks for.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                value={tierInputRaw}
                onChange={(e) => setTierInputRaw(e.target.value)}
                placeholder="1, 10, 100, 500, 1000"
                className="max-w-md"
              />
              <Button variant="secondary" onClick={applyTierInput}>Apply</Button>
              <div className="flex gap-1 flex-wrap ml-2">
                {tiers.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Foreign Exchange Rates</CardTitle>
          <CardDescription>
            All non-CAD supplier prices are converted to CAD for side-by-side comparison.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center flex-wrap mb-3">
            <Button
              variant="secondary"
              onClick={fetchLiveFx}
              disabled={fxFetching}
            >
              {fxFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Fetch Live Rates
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {FX_CURRENCIES.map((ccy) => {
              const rate = fxRates.get(`${ccy}→CAD`);
              return <FxRow key={ccy} ccy={ccy} rate={rate} onSave={(r) => saveFxManual(ccy, r)} />;
            })}
          </div>
        </CardContent>
      </Card>

      {/* Preference picker — wizard only. Applies a rule across every line
          that has quotes and writes winners into bom_line_pricing. */}
      {wizardMode && preferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Apply Distributor Preference</CardTitle>
            <CardDescription>
              Auto-pick a winning supplier per line + tier using a rule. System presets are marked ★.
              You can still override any pick manually after applying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center flex-wrap">
              <Select
                value={pickedPreferenceId ?? "__none__"}
                onValueChange={(v) =>
                  setPickedPreferenceId(v == null || v === "__none__" ? null : v)
                }
              >
                <SelectTrigger className="h-9 min-w-[280px]">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__none__") return "Select a preference…";
                      const p = preferences.find((p) => p.id === v);
                      if (!p) return "";
                      return `${p.is_system ? "★ " : ""}${p.name}`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a preference…</SelectItem>
                  {preferences.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.is_system ? "★ " : ""}
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={applyPreference}
                disabled={!pickedPreferenceId || applyingPref}
              >
                {applyingPref ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Applying…</>
                ) : (
                  "Apply to all lines"
                )}
              </Button>
              {pinnedPreferenceId && (
                <span className="text-xs text-gray-500">
                  Pinned: {preferences.find((p) => p.id === pinnedPreferenceId)?.name ?? "(deleted)"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="sticky top-0 z-20 -mx-2 px-2 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          <SummaryPill
            label={`${summary.total} components`}
            active={summaryFilter === null}
            onClick={() => setSummaryFilter(null)}
            tone="neutral"
          />
          <SummaryPill
            label={`${summary.quoted} quoted`}
            active={summaryFilter === "quoted"}
            onClick={() =>
              setSummaryFilter((f) => (f === "quoted" ? null : "quoted"))
            }
            tone="default"
          />
          {summary.unquoted > 0 && (
            <SummaryPill
              label={`${summary.unquoted} unquoted`}
              active={summaryFilter === "unquoted"}
              onClick={() =>
                setSummaryFilter((f) => (f === "unquoted" ? null : "unquoted"))
              }
              tone="warning"
            />
          )}
          <SummaryPill
            label={`${summary.fullyPicked} with all picks`}
            active={summaryFilter === "fully_picked"}
            onClick={() =>
              setSummaryFilter((f) => (f === "fully_picked" ? null : "fully_picked"))
            }
            tone={summary.fullyPicked === summary.total ? "default" : "neutral"}
          />
          {summary.partialPicks > 0 && (
            <SummaryPill
              label={`${summary.partialPicks} partial`}
              active={summaryFilter === "partial_picks"}
              onClick={() =>
                setSummaryFilter((f) => (f === "partial_picks" ? null : "partial_picks"))
              }
              tone="warning"
            />
          )}
          {summary.noPicks > 0 && (
            <SummaryPill
              label={`${summary.noPicks} no picks yet`}
              active={summaryFilter === "no_picks"}
              onClick={() =>
                setSummaryFilter((f) => (f === "no_picks" ? null : "no_picks"))
              }
              tone="destructive"
            />
          )}
          {summary.outOfStock > 0 && (
            <SummaryPill
              label={`${summary.outOfStock} out of stock`}
              active={summaryFilter === "out_of_stock"}
              onClick={() =>
                setSummaryFilter((f) =>
                  f === "out_of_stock" ? null : "out_of_stock"
                )
              }
              tone="destructive"
            />
          )}
          {summary.shortStock > 0 && (
            <SummaryPill
              label={`${summary.shortStock} short stock`}
              active={summaryFilter === "short_stock"}
              onClick={() =>
                setSummaryFilter((f) =>
                  f === "short_stock" ? null : "short_stock"
                )
              }
              tone="warning"
            />
          )}
          {summary.customerSuppliedCount > 0 && (
            <SummaryPill
              label={`${summary.customerSuppliedCount} customer supplied`}
              active={summaryFilter === "customer_supplied"}
              onClick={() =>
                setSummaryFilter((f) =>
                  f === "customer_supplied" ? null : "customer_supplied"
                )
              }
              tone="amber"
            />
          )}
          {summaryFilter !== null && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={fetching || visibleLines.length === 0}
                onClick={() => fetchPrices(visibleLines.map((l) => l.id))}
                className="h-7 text-xs"
                title="Re-fetch prices for the lines currently shown by this filter"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh visible ({visibleLines.length})
              </Button>
              <button
                type="button"
                onClick={() => setSummaryFilter(null)}
                className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
              >
                Clear filter
              </button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportQuotesToExcel}
            className="h-7 text-xs ml-auto"
            title="Export every supplier quote on every BOM line to an Excel file"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Export to Excel
          </Button>
        </div>
        <div className="flex gap-2 items-center justify-between flex-wrap">
          <div className="flex gap-2 items-center flex-wrap">
          <div
            className="inline-flex items-center gap-0.5 rounded-md border bg-gray-100 dark:bg-gray-900 dark:border-gray-800 p-0.5 h-7"
            role="group"
            aria-label="Fetch mode"
          >
            {(() => {
              const opts = [
                { k: "cache_only" as FetchMode, label: "Cache only", tip: "Use cached quotes only. Lines with no cached pricing are skipped — no API calls fire." },
                { k: "cache_first" as FetchMode, label: "Cache first", tip: "Use cached quotes when fresh (under N hours). Fall back to live API for missing or stale lines." },
                { k: "live" as FetchMode, label: "Live", tip: "Ignore cache. Fire live API calls for every line and refresh the cache." },
              ];
              return opts.map((opt) => {
                const active = fetchMode === opt.k;
                return (
                  <button
                    key={opt.k}
                    type="button"
                    title={opt.tip}
                    onClick={() => setFetchMode(opt.k)}
                    disabled={fetching}
                    className={`px-2 h-full text-xs rounded transition ${
                      active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              });
            })()}
          </div>
          <label
            className={`flex items-center gap-1 text-[11px] ${
              fetchMode === "cache_first" || fetchMode === "cache_only"
                ? "text-gray-600 dark:text-gray-400"
                : "text-gray-300 dark:text-gray-600"
            }`}
            title="Maximum cache age (hours). Older cached quotes are ignored — cache_only skips them, cache_first falls back to live."
          >
            <span>max age (h)</span>
            <input
              type="number"
              min={1}
              value={maxCacheAgeHours}
              disabled={fetchMode === "live" || fetching}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaxCacheAgeHours(Number.isFinite(v) && v > 0 ? v : 24);
              }}
              className="w-[8ch] h-7 px-1 text-xs border rounded dark:bg-gray-950 dark:border-gray-800 disabled:opacity-50"
            />
          </label>
          {selectedLineIds.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchPrices([...selectedLineIds])}
              disabled={fetching}
              className="h-7 text-xs"
              title="Re-fetch prices for the lines you've ticked"
            >
              {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Refresh selected ({selectedLineIds.size})
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => fetchPrices()}
            disabled={fetching}
            className="h-7 text-xs"
          >
            {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Fetch Prices
          </Button>
          {fetching && (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopAll}
              className="h-7 text-xs"
              title="Cancel the in-flight price fetch for all suppliers"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Stop All
            </Button>
          )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <DistributorMultiSelect
              selected={displayedSuppliers}
              setSelected={setDisplayedSuppliers}
              credentialStatus={credentialStatus}
            />
            <div className="relative">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search CPC, MPN, mfr, distributor…"
                className="h-7 w-[240px] text-xs pr-7"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Streaming progress bar */}
      {fetching && overallTotal > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, (overallDone / overallTotal) * 100)}%` }}
            />
          </div>
          <Popover>
            <PopoverTrigger
              className="text-gray-500 hover:text-gray-800 p-1"
              title="Per-supplier progress"
            >
              <Info className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent className="w-96 p-3">
              <div className="text-xs font-semibold mb-2">Per-supplier progress</div>
              <div className="space-y-2">
                {Object.entries(supplierProgress).map(([supplier, p]) => {
                  const pct = p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : 0;
                  const complete = p.total > 0 && p.done >= p.total;
                  const queued = p.done === 0 && !complete;
                  const stopped = stoppedSuppliers.has(supplier);
                  const meta = SUPPLIER_METADATA[supplier as BuiltInSupplierName];
                  return (
                    <div
                      key={supplier}
                      className={`flex items-center gap-2 text-xs ${stopped ? "opacity-50" : ""}`}
                    >
                      <div className="w-20 truncate font-medium">
                        {meta?.display_name ?? supplier}
                      </div>
                      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            stopped ? "bg-gray-400" : complete ? "bg-green-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="font-mono tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap text-right shrink-0">
                        {p.done} / {p.total}
                      </div>
                      <div className="min-w-[48px] text-[10px] text-right whitespace-nowrap shrink-0">
                        {complete ? (
                          <Check className="h-3 w-3 text-green-600 inline" />
                        ) : stopped ? (
                          <span className="text-gray-500 italic">stopped</span>
                        ) : queued ? (
                          <span className="text-gray-400">queued</span>
                        ) : null}
                      </div>
                      <div className="w-4 shrink-0 flex justify-end">
                        {!complete && !stopped && (
                          <button
                            type="button"
                            onClick={() => stopSupplier(supplier)}
                            className="text-gray-400 hover:text-red-600 p-0.5 rounded"
                            title={`Stop ${meta?.display_name ?? supplier}`}
                            aria-label={`Stop ${meta?.display_name ?? supplier}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Per-line table */}
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950 overflow-hidden">
        {visibleLines.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            No components match the active filter.
          </div>
        )}
        {visibleLines.map((line) => (
          <MemoLineRow
            key={line.id}
            line={line}
            tiers={tiers}
            orderQtys={orderQtysByLine[line.id] ?? tiers}
            overages={overages}
            quotes={visibleQuotesByLine.get(line.id) ?? EMPTY_SELECTIONS as unknown as QuoteWithCad[]}
            selections={selectionsByLine.get(line.id) ?? EMPTY_SELECTIONS}
            expanded={expanded.has(line.id)}
            onToggleExpand={() => toggleExpand(line.id)}
            onSelectQuote={(tier, quote) => saveSelection(line, tier, quote)}
            onClearSelection={(tier) => clearSelection(line.id, tier)}
            onRefreshLine={() => fetchPrices([line.id])}
            cacheStats={lineCacheStats.get(line.id) ?? null}
            errors={lineErrors.get(line.id) ?? []}
            fetchMode={fetchMode}
            savingKey={savingKey}
            wizardMode={wizardMode}
            isCustomerSupplied={customerSupplied.has(line.id)}
            priorCustomerSupplied={priorCustomerSuppliedByLineId[line.id] ?? null}
            onToggleCustomerSupplied={
              wizardMode ? () => toggleCustomerSupplied(line.id) : undefined
            }
            togglingCustomerSupplied={togglingSupplied === line.id}
            alternates={alternatesMap.get(line.id) ?? []}
            onAddAlternate={(mpn, mfr) => addAlternate(line.id, mpn, mfr)}
            onDeleteAlternate={(alt) => deleteAlternate(line.id, alt)}
            addingAlternate={addingAlt === line.id}
            selected={selectedLineIds.has(line.id)}
            onToggleSelect={() => toggleLineSelected(line.id)}
            refreshing={
              refreshingLines.has(line.id) ||
              // Master Fetch Prices (no specific lineIds passed) populates
              // nothing into refreshingLines, so we derive it from "fetching
              // is true AND no specific lines are tagged" → every row
              // disables. Targeted refresh (per-row, Refresh selected,
              // Refresh visible) populates refreshingLines, so untargeted
              // rows stay enabled.
              (fetching && refreshingLines.size === 0)
            }
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

/**
 * Find the unit price at a given ORDER qty using the break table. `orderQty`
 * here is the true quantity we'll buy — qty_per_board × tier + overage extras
 * — not the raw board tier. That's what the supplier break tables are keyed
 * on, so volume discounts resolve correctly.
 */
function priceAtTier(quote: SupplierQuote, tier: number): number {
  const breaks = quote.price_breaks ?? [];
  if (breaks.length === 0) return quote.unit_price;
  // Sort ascending by min_qty
  const sorted = [...breaks].sort((a, b) => a.min_qty - b.min_qty);
  let pick = sorted[0];
  for (const b of sorted) {
    if (tier >= b.min_qty) pick = b;
  }
  return pick.unit_price;
}

function priceAtTierCad(quote: QuoteWithCad, tier: number): number | null {
  const nativePrice = priceAtTier(quote, tier);
  if (quote.fx_rate_applied != null) {
    return nativePrice * quote.fx_rate_applied;
  }
  if (quote.currency === "CAD") return nativePrice;
  return null;
}

type StockStatus =
  | { level: "none" }
  | { level: "green"; best: number }
  | { level: "amber"; best: number }
  | { level: "red" };

/**
 * Stock health for a BOM line, based on the quotes we got back.
 *   green — at least one distributor has enough for the biggest tier.
 *   amber — someone has stock, but nobody covers the full order qty.
 *   red   — every distributor stocks 0.
 *   none  — zero quotes at all (likely customer-supplied / custom part).
 */
function computeStockStatus(quotes: QuoteWithCad[], maxOrderQty: number): StockStatus {
  if (quotes.length === 0) return { level: "none" };
  let best = 0;
  for (const q of quotes) {
    if (q.stock_qty != null && q.stock_qty > best) best = q.stock_qty;
  }
  if (best === 0) return { level: "red" };
  if (maxOrderQty > 0 && best >= maxOrderQty) return { level: "green", best };
  return { level: "amber", best };
}

/**
 * Clickable summary pill used above the per-line table. Doubles as both a
 * count badge and a filter toggle — pressing one narrows the list below to
 * matching lines; pressing again clears the filter.
 */
function SummaryPill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "default" | "warning" | "destructive" | "amber";
}) {
  const base =
    "text-xs rounded-full px-2.5 py-1 border transition cursor-pointer select-none";
  const toneClass =
    tone === "default"
      ? active
        ? "bg-blue-600 text-white border-blue-600"
        : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900"
      : tone === "warning"
        ? active
          ? "bg-orange-500 text-white border-orange-500"
          : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900"
        : tone === "destructive"
          ? active
            ? "bg-red-600 text-white border-red-600"
            : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900"
          : tone === "amber"
            ? active
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900"
            : active
              ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
              : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  return (
    <button type="button" onClick={onClick} className={`${base} ${toneClass}`}>
      {label}
    </button>
  );
}

/**
 * Compact distributor multiselect for the sticky toolbar. Replaces the old
 * "Select Distributors" card. Trigger shows the current selection count;
 * click opens a popover with one checkbox per supplier (greyed out when no
 * credentials are configured), plus a select-all toggle at the top.
 *
 * The `selected` Set is the same state used for fetch scope, auto-pick
 * scope, and the display filter — flipping a checkbox here immediately
 * updates the per-line table, summary chip counts, and Excel export.
 */
function DistributorMultiSelect({
  selected,
  setSelected,
  credentialStatus,
}: {
  selected: Set<BuiltInSupplierName>;
  setSelected: React.Dispatch<React.SetStateAction<Set<BuiltInSupplierName>>>;
  credentialStatus: Record<string, boolean>;
}) {
  const configured = BUILT_IN_SUPPLIER_NAMES.filter((s) => credentialStatus[s]);
  const selectedConfiguredCount = configured.filter((s) => selected.has(s)).length;
  const allSelected =
    configured.length > 0 && selectedConfiguredCount === configured.length;
  const someSelected = selectedConfiguredCount > 0 && !allSelected;
  const toggle = (s: BuiltInSupplierName) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const triggerLabel =
    selectedConfiguredCount === 0
      ? "All distributors"
      : `${selectedConfiguredCount} / ${configured.length} distributors`;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center h-7 px-3 text-xs rounded-md border bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 transition">
        {triggerLabel}
        <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <label
          className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer select-none border-b dark:border-gray-800 mb-1"
          title={
            configured.length === 0
              ? "No distributors configured"
              : allSelected
                ? "Deselect all distributors"
                : "Select every configured distributor"
          }
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            disabled={configured.length === 0}
            onChange={() => {
              setSelected(allSelected ? new Set() : new Set(configured));
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="font-medium">
            {allSelected ? "Deselect all" : "Select all"}
          </span>
          <span className="ml-auto text-gray-500">
            {selectedConfiguredCount}/{configured.length}
          </span>
        </label>
        <div className="max-h-72 overflow-y-auto">
          {BUILT_IN_SUPPLIER_NAMES.map((s) => {
            const meta = SUPPLIER_METADATA[s];
            const isConfigured = credentialStatus[s] ?? false;
            const checked = selected.has(s);
            return (
              <label
                key={s}
                className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer ${
                  isConfigured
                    ? "hover:bg-gray-100 dark:hover:bg-gray-800"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!isConfigured}
                  onChange={() => isConfigured && toggle(s)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">{meta.display_name}</span>
                {!isConfigured && (
                  <span className="ml-auto text-[10px] text-gray-500">no creds</span>
                )}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StockBadge({ status }: { status: StockStatus }) {
  if (status.level === "none") return null;
  if (status.level === "green") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      >
        Stock OK ({status.best.toLocaleString()})
      </Badge>
    );
  }
  if (status.level === "amber") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      >
        Short ({status.best.toLocaleString()} available)
      </Badge>
    );
  }
  // red
  return (
    <Badge
      variant="secondary"
      className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    >
      Out of stock
    </Badge>
  );
}

/**
 * Lifecycle badge for the collapsed line card. Suppresses healthy "Active" /
 * "Production" statuses since those are the default and would otherwise add
 * noise to every line. Anything else (NRND, EOL, Obsolete, Last Time Buy, …)
 * gets a destructive red badge so the operator notices before pricing the
 * BOM around a part that's about to disappear.
 */
function LifecycleBadge({ status }: { status: string }) {
  const trimmed = status.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const healthy =
    lower === "active" ||
    lower === "production" ||
    lower === "new at mouser" ||
    lower === "new product";
  if (healthy) return null;
  return (
    <Badge
      variant="secondary"
      className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      title={`Picked supplier lifecycle status: ${trimmed}`}
    >
      {trimmed}
    </Badge>
  );
}

// ---------- FX rate row ----------

function FxRow({
  ccy,
  rate,
  onSave,
}: {
  ccy: string;
  rate: { rate: number; source: "live" | "manual"; fetched_at: string } | undefined;
  onSave: (rate: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const handleSave = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive number");
      return;
    }
    onSave(n);
    setDraft("");
  };
  return (
    <div className="rounded-md border p-2 text-sm dark:border-gray-700">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{ccy} → CAD</span>
        {rate && (
          <Badge variant="secondary" className="text-[10px]">
            {rate.source}
          </Badge>
        )}
      </div>
      <div className="text-lg font-mono mt-1">
        {rate ? rate.rate.toFixed(4) : <span className="text-gray-400">—</span>}
      </div>
      <div className="flex gap-1 mt-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Manual"
          className="h-7 text-xs"
          type="number"
          step="0.0001"
        />
        <Button size="sm" variant="outline" onClick={handleSave} className="h-7 px-2">
          <Check className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Single BOM line row ----------

// Memoized shell around LineRow. Callback props change identity every
// parent render (inline arrow fns), but they always dispatch to state via
// functional setState — so behavior is unaffected by skipping re-renders
// when only data props are equal. The comparator deliberately ignores all
// function props; anything data-bearing is checked by reference (arrays /
// objects are stabilized upstream via useMemo).
const MemoLineRow = memo(
  (props: React.ComponentProps<typeof LineRow>) => <LineRow {...props} />,
  (prev, next) =>
    prev.line === next.line &&
    prev.tiers === next.tiers &&
    prev.orderQtys === next.orderQtys &&
    prev.overages === next.overages &&
    prev.quotes === next.quotes &&
    prev.selections === next.selections &&
    prev.expanded === next.expanded &&
    prev.cacheStats === next.cacheStats &&
    prev.errors === next.errors &&
    prev.fetchMode === next.fetchMode &&
    prev.savingKey === next.savingKey &&
    prev.wizardMode === next.wizardMode &&
    prev.isCustomerSupplied === next.isCustomerSupplied &&
    prev.priorCustomerSupplied === next.priorCustomerSupplied &&
    prev.togglingCustomerSupplied === next.togglingCustomerSupplied &&
    prev.alternates === next.alternates &&
    prev.addingAlternate === next.addingAlternate &&
    prev.selected === next.selected &&
    prev.refreshing === next.refreshing
);
MemoLineRow.displayName = "MemoLineRow";

function LineRow({
  line,
  tiers,
  orderQtys,
  overages,
  quotes,
  selections,
  expanded,
  onToggleExpand,
  onSelectQuote,
  onClearSelection,
  onRefreshLine,
  cacheStats,
  errors,
  fetchMode,
  savingKey,
  wizardMode,
  isCustomerSupplied,
  priorCustomerSupplied,
  onToggleCustomerSupplied,
  togglingCustomerSupplied,
  alternates,
  onAddAlternate,
  onDeleteAlternate,
  addingAlternate,
  selected,
  onToggleSelect,
  refreshing,
}: {
  line: BomLine;
  tiers: number[];
  /** order_qty per tier, same length & order as `tiers`. */
  orderQtys: number[];
  overages: OverageTier[];
  quotes: QuoteWithCad[];
  selections: (Selection | null)[];
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectQuote: (tier: number, quote: QuoteWithCad) => void;
  onClearSelection: (tier: number) => void;
  onRefreshLine: () => void;
  cacheStats: LineCachedStats | null;
  errors: Array<{ supplier: string; mpn: string; error: string }>;
  fetchMode: FetchMode;
  savingKey: string | null;
  wizardMode: boolean;
  isCustomerSupplied: boolean;
  priorCustomerSupplied: Array<{
    quote_number: string;
    gmp_number: string | null;
    board_name: string | null;
    marked_at: string | null;
    bom_id: string;
  }> | null;
  onToggleCustomerSupplied?: () => void;
  togglingCustomerSupplied: boolean;
  alternates: Alternate[];
  onAddAlternate: (mpn: string, manufacturer: string) => void;
  onDeleteAlternate: (alt: Alternate) => void;
  addingAlternate: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  refreshing: boolean;
}) {
  const [altMpn, setAltMpn] = useState("");
  const [altMfr, setAltMfr] = useState("");
  const submitAlt = () => {
    if (!altMpn.trim()) return;
    onAddAlternate(altMpn, altMfr);
    setAltMpn("");
    setAltMfr("");
  };
  // APCB / is_pcb lines aren't priced via distributor APIs — the PCB fab
  // quote step handles them separately. Render a compact placeholder row so
  // they're visible in the table (for counts + context) but don't show
  // supplier columns, tier pickers, or the Add-alternate input.
  const isPcbRow = line.m_code === "APCB";
  if (isPcbRow) {
    return (
      <div className="border-b last:border-b-0 dark:border-gray-800 bg-sky-50/50 dark:bg-sky-950/20">
        <div className="flex items-start gap-3 p-3">
          <div className="w-4" />
          <div className="text-xs text-gray-400 min-w-[24px] mt-0.5">{line.line_number}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">{line.mpn ?? line.cpc ?? "(PCB)"}</span>
              <Badge variant="secondary" className="text-[10px] bg-sky-200 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200">
                PCB — priced via PCB fab quote
              </Badge>
              {line.manufacturer && (
                <span className="text-xs text-gray-500 truncate">· {line.manufacturer}</span>
              )}
            </div>
            {line.description && (
              <div className="text-xs text-gray-500 truncate mt-0.5">{line.description}</div>
            )}
            <div className="text-xs text-gray-400 mt-0.5">qty/board: {line.quantity}</div>
          </div>
        </div>
      </div>
    );
  }

  // Stock indicator — green when *any* quoted distributor has enough stock
  // for the largest tier's order qty; amber when someone has stock but not
  // enough; red when nobody has any. "Candidate" label triggers when there
  // are zero quotes at all (suggests customer-supplied part).
  const maxOrderQty = orderQtys.length > 0 ? Math.max(...orderQtys) : 0;
  const stockStatus = computeStockStatus(quotes, maxOrderQty);

  // Lifecycle of the picked quote — when the operator has pinned a supplier
  // (any tier), surface that supplier's lifecycle on the collapsed card so
  // EOL/NRND/Obsolete picks are obvious without expanding. We use the quote's
  // current lifecycle from the cache; if the picked supplier is no longer in
  // the candidate pool (cache evicted), the badge silently hides.
  const pickedSelection = selections.find((s) => s != null) ?? null;
  const pickedQuoteForLifecycle = pickedSelection
    ? quotes.find(
        (q) =>
          q.source === pickedSelection.supplier &&
          (q.supplier_part_number ?? "") === (pickedSelection.supplier_part_number ?? "") &&
          (q.warehouse_code ?? "") === (pickedSelection.warehouse_code ?? "")
      ) ?? null
    : null;
  const pickedLifecycle = pickedQuoteForLifecycle?.lifecycle_status ?? null;

  return (
    <div
      className={`border-b last:border-b-0 dark:border-gray-800 ${
        isCustomerSupplied ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
      }`}
    >
      {/* Summary row (always visible) */}
      <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select line ${line.line_number} for bulk refresh`}
          className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <button onClick={onToggleExpand} className="mt-0.5 text-gray-400 hover:text-gray-700">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="text-xs text-gray-400 min-w-[24px] mt-0.5">{line.line_number}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{line.mpn ?? line.cpc ?? "(no MPN)"}</span>
            {line.cpc && line.mpn && line.cpc !== line.mpn && (
              <span
                className="text-[10px] font-mono text-gray-500 rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5"
                title="Customer part code"
              >
                CPC: {line.cpc}
              </span>
            )}
            {line.m_code && <Badge variant="secondary" className="text-[10px]">{line.m_code}</Badge>}
            <StockBadge status={stockStatus} />
            {pickedLifecycle && <LifecycleBadge status={pickedLifecycle} />}
            {isCustomerSupplied && (
              <Badge variant="secondary" className="text-[10px] bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                Customer supplied
              </Badge>
            )}
            {/* Prior-CS reminder — matches a bom_line from an earlier quote
                under the same customer where this exact CPC/MPN was flagged
                customer-supplied. Pure indicator; operator still has to tick
                the checkbox on this quote to actually apply it. Shows the
                most recent matching quote by default with a hover tooltip
                listing all matches when there are several. */}
            {!isCustomerSupplied && priorCustomerSupplied && priorCustomerSupplied.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200 cursor-help"
                title={priorCustomerSupplied
                  .map((p) => {
                    const date = p.marked_at ? formatDate(p.marked_at) : "—";
                    const gmpLabel = p.gmp_number
                      ? p.board_name
                        ? `${p.gmp_number} (${p.board_name})`
                        : p.gmp_number
                      : "—";
                    return `${p.quote_number} · ${gmpLabel} · ${date}`;
                  })
                  .join("\n")}
              >
                Prev. CS: {priorCustomerSupplied[0].quote_number}
                {priorCustomerSupplied[0].gmp_number ? ` / ${priorCustomerSupplied[0].gmp_number}` : ""}
                {priorCustomerSupplied.length > 1 && ` +${priorCustomerSupplied.length - 1}`}
              </Badge>
            )}
            {line.manufacturer && (
              <span className="text-xs text-gray-500 truncate">· {line.manufacturer}</span>
            )}
          </div>
          {line.description && (
            <div className="text-xs text-gray-500 truncate mt-0.5">{line.description}</div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">qty/board: {line.quantity}</div>
        </div>
        <div className="flex flex-col items-end gap-1 min-w-[220px]">
          <Badge variant={quotes.length > 0 ? "default" : "secondary"}>
            {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
          </Badge>
          <div className="flex gap-2 items-center">
            {cacheStats && (cacheStats.cache_hits > 0 || cacheStats.live_hits > 0) && (
              <span
                className="text-[10px] text-gray-400 dark:text-gray-500"
                title="Cache vs live hits on the last fetch."
              >
                {cacheStats.cache_hits} cached · {cacheStats.live_hits} live
              </span>
            )}
            {wizardMode && onToggleCustomerSupplied && (
              <label className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCustomerSupplied}
                  disabled={togglingCustomerSupplied}
                  onChange={onToggleCustomerSupplied}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span>Cust. supplied</span>
              </label>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefreshLine}
              disabled={refreshing}
              className="h-6 px-2 text-xs"
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      {/* Skipped-in-cache-only notice */}
      {fetchMode === "cache_only" &&
        cacheStats &&
        cacheStats.cache_hits === 0 &&
        cacheStats.skipped > 0 && (
          <div className="px-6 pb-2 -mt-1">
            <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1">
              No cached prices — switch to Cache first or Live to fetch.
            </div>
          </div>
        )}

      {/* Supplier errors — shown when at least one supplier call for this
          line failed (rate-limit, timeout, parse error). Distinguishes a
          legitimate "no match" from a silently-swallowed failure. */}
      {/* Per-line supplier-error pill removed — the operator already gets
          the full picture from the terminal logs, and surfacing transient
          timeouts in the UI was noisy. Errors still flow through
          lineErrors state so downstream consumers / tests can inspect
          them; only the visible pill is gone. */}

      {/* No-match notice — suppliers were queried but returned zero matches
          (not a failure; the part simply isn't in their catalog). Distinct
          from what used to be the red error pill. This is the "likely
          customer-supplied" signal: no distributor stocks the MPN. */}
      {errors.length === 0 &&
        quotes.length === 0 &&
        cacheStats &&
        cacheStats.cache_hits === 0 &&
        cacheStats.live_hits === 0 &&
        cacheStats.skipped === 0 && (
          <div className="px-6 pb-2 -mt-1">
            <div className="text-[11px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-2 py-1">
              No distributor returned a match for this MPN. Likely a
              customer-supplied / custom / EOL part. Consider marking it
              Customer supplied or adding an alternate MPN.
            </div>
          </div>
        )}

      {/* Expanded quotes + tier pickers */}
      {expanded && (
        <div className="px-6 pb-4 space-y-3">
          {/* Alternate MPNs list + add form */}
          {alternates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="text-gray-500 self-center">Alternates:</span>
              {alternates.map((alt) => {
                const toneClass =
                  alt.source === "operator"
                    ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300"
                    : alt.source === "customer"
                      ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300"
                      : alt.source === "rs_alt"
                        ? "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300"
                        : "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
                return (
                  <span
                    key={alt.id}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono ${toneClass}`}
                  >
                    <span>{alt.mpn}</span>
                    {alt.manufacturer && (
                      <span className="opacity-60">· {alt.manufacturer}</span>
                    )}
                    <span className="opacity-60 text-[9px] uppercase">{alt.source}</span>
                    {alt.source === "operator" && (
                      <button
                        type="button"
                        onClick={() => onDeleteAlternate(alt)}
                        className="hover:text-red-600"
                        title="Remove alternate"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {quotes.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No quotes yet. Click &quot;Fetch Prices&quot; above, or &quot;Refresh&quot; on this row.
            </p>
          ) : (
            <>
              {/* Quotes table */}
              <div className="rounded-md border overflow-x-auto dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Supplier</th>
                      <th className="text-right px-3 py-2">Stock</th>
                      <th className="text-right px-3 py-2">Lead</th>
                      <th className="text-right px-3 py-2">MOQ</th>
                      <th className="text-right px-3 py-2" title="Order multiple — quantity must round up to a multiple of this number">Multi Qty</th>
                      <th className="text-left px-3 py-2">Flags</th>
                      {tiers.map((t, idx) => {
                        // Same fix as orderQtysByLine — overage table is
                        // keyed on PART qty, not board qty.
                        const baseQty = (line.quantity ?? 0) * t;
                        const extras = getOverage(line.m_code, baseQty, overages);
                        const order = orderQtys[idx];
                        return (
                          <th key={t} className="text-right px-3 py-2">
                            <div className="font-semibold">qty {t}</div>
                            <div className="text-[10px] font-normal normal-case text-gray-500 dark:text-gray-400">
                              {(line.quantity ?? 0)} × {t}
                              {extras > 0 ? ` + ${extras}` : ""}
                            </div>
                            <div className="text-[10px] font-normal normal-case text-blue-700 dark:text-blue-400">
                              order {order}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Pin quotes that have been picked (for any tier) to the
                      // top so the operator's working set is visible without
                      // scanning. Stable within each group — original order
                      // wins for tied entries.
                      const isPicked = (q: QuoteWithCad) =>
                        selections.some(
                          (s) =>
                            s != null &&
                            s.supplier === q.source &&
                            (s.supplier_part_number ?? "") === (q.supplier_part_number ?? "") &&
                            (s.warehouse_code ?? "") === (q.warehouse_code ?? "")
                        );
                      const ordered = [
                        ...quotes.filter((q) => isPicked(q)),
                        ...quotes.filter((q) => !isPicked(q)),
                      ];
                      return ordered.map((q, idx) => (
                        <QuoteRow
                          key={`${q.source}-${q.warehouse_code ?? "default"}-${q.supplier_part_number ?? ""}-${idx}`}
                          quote={q}
                          tiers={tiers}
                          orderQtys={orderQtys}
                          selections={selections}
                          onSelectQuote={onSelectQuote}
                          onClearSelection={onClearSelection}
                          lineId={line.id}
                          savingKey={savingKey}
                        />
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Add alternate MPN form */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={altMpn}
              onChange={(e) => setAltMpn(e.target.value)}
              placeholder="Alternate MPN"
              className="h-7 text-xs max-w-[200px]"
              disabled={addingAlternate}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAlt();
              }}
            />
            <Input
              value={altMfr}
              onChange={(e) => setAltMfr(e.target.value)}
              placeholder="Mfr (optional)"
              className="h-7 text-xs max-w-[180px]"
              disabled={addingAlternate}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAlt();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={submitAlt}
              disabled={addingAlternate || !altMpn.trim()}
              className="h-7 px-3 text-xs"
            >
              {addingAlternate ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Single supplier quote row ----------

function QuoteRow({
  quote,
  tiers,
  orderQtys,
  selections,
  onSelectQuote,
  onClearSelection,
  lineId,
  savingKey,
}: {
  quote: QuoteWithCad;
  tiers: number[];
  /** order_qty per tier, same length & order as `tiers`. Drives priceAtTier. */
  orderQtys: number[];
  selections: (Selection | null)[];
  onSelectQuote: (tier: number, quote: QuoteWithCad) => void;
  onClearSelection: (tier: number) => void;
  lineId: string;
  savingKey: string | null;
}) {
  const meta = SUPPLIER_METADATA[quote.source as BuiltInSupplierName];
  return (
    <tr className="border-t dark:border-gray-800">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {meta?.display_name ?? quote.source}
          </Badge>
          <CacheBadge
            fromCache={quote.from_cache}
            ageHours={quote.cache_age_hours ?? null}
            fetchedAt={quote.fetched_at ?? null}
          />
        </div>
        {quote.supplier_part_number && (
          <div className="text-[10px] text-gray-400 font-mono">{quote.supplier_part_number}</div>
        )}
        {(quote.mpn || quote.manufacturer) && (
          <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
            {quote.mpn && <span className="font-mono">{quote.mpn}</span>}
            {quote.mpn && quote.manufacturer && <span className="text-gray-400"> · </span>}
            {quote.manufacturer && <span>{quote.manufacturer}</span>}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {quote.stock_qty != null ? quote.stock_qty.toLocaleString() : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs">
        {quote.lead_time_days != null ? `${quote.lead_time_days}d` : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {quote.moq ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {quote.order_multiple ?? "—"}
      </td>
      <td className="px-3 py-2 text-xs">
        <div className="flex gap-1 flex-wrap">
          {quote.franchised && <Badge variant="secondary" className="text-[9px] bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Auth</Badge>}
          {quote.ncnr && <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">NCNR</Badge>}
          {quote.lifecycle_status && !["ACTIVE", "Production"].includes(quote.lifecycle_status) && (
            <Badge variant="destructive" className="text-[9px]">{quote.lifecycle_status}</Badge>
          )}
        </div>
      </td>
      {tiers.map((tier, idx) => {
        // Look up the price using the actual ORDER qty (qty_per_board × tier
        // + overage extras), not the raw tier qty — volume pricing resolves
        // against the real buy quantity.
        const orderQty = orderQtys[idx] ?? tier;
        // Effective buy qty — the real number of parts we'd end up paying
        // for, factoring in supplier MOQ and packaging multiples. A line
        // that needs 1270 parts from a vendor with MOQ 8000 costs 8000
        // regardless of how small our tier is. Rounding up to
        // order_multiple handles reel/cut-tape packaging constraints.
        const moq = quote.moq ?? 0;
        const mult = quote.order_multiple ?? 1;
        let effectiveQty = Math.max(orderQty, moq);
        if (mult > 1) {
          effectiveQty = Math.ceil(effectiveQty / mult) * mult;
        }
        const price = priceAtTier(quote, effectiveQty);
        const priceCad = priceAtTierCad(quote, effectiveQty);
        const extendedCad = priceCad != null ? priceCad * effectiveQty : null;
        const mustBuyMore = effectiveQty > orderQty;
        const sel = selections[idx];
        // Match on source + warehouse. ALSO require supplier_part_number
        // equality when both sides have one — that's what disambiguates
        // reel vs cut-tape rows from the same supplier. When either side's
        // SPN is null (older selections stored pre-SPN-fix, or suppliers
        // that don't return one), fall back to source+warehouse alone so
        // we don't silently drop the highlight.
        const sourceMatch =
          sel?.supplier === quote.source &&
          (sel?.warehouse_code ?? null) === (quote.warehouse_code ?? null);
        const spnBothPresent =
          sel?.supplier_part_number != null && quote.supplier_part_number != null;
        const picked =
          sourceMatch &&
          (!spnBothPresent || sel!.supplier_part_number === quote.supplier_part_number);
        const key = `${lineId}|${tier}`;
        const saving = savingKey === key;
        return (
          <td key={tier} className="px-3 py-2 text-right">
            <button
              disabled={saving}
              onClick={() => (picked ? onClearSelection(tier) : onSelectQuote(tier, quote))}
              className={`px-2 py-1 rounded text-xs transition ${
                picked
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              } ${saving ? "opacity-50 cursor-wait" : ""}`}
              title={picked ? "Click to unselect" : "Click to select"}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : (
                <>
                  <div className="font-mono">
                    {priceCad != null ? `$${priceCad.toFixed(4)}` : <AlertCircle className="h-3 w-3 inline text-amber-500" />}
                  </div>
                  <div className="text-[9px] opacity-70 font-mono">
                    {price.toFixed(4)} {quote.currency}
                  </div>
                  {extendedCad != null && (
                    <div
                      className={`text-[10px] font-mono mt-0.5 ${
                        picked
                          ? "text-white/90"
                          : mustBuyMore
                            ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : "text-gray-600 dark:text-gray-400"
                      }`}
                      title={
                        mustBuyMore
                          ? `Must buy ${effectiveQty} (MOQ=${quote.moq ?? 1}, multi=${quote.order_multiple ?? 1}). Extended cost = ${effectiveQty} × $${priceCad?.toFixed(4)}`
                          : `Extended: ${effectiveQty} × $${priceCad?.toFixed(4)}`
                      }
                    >
                      ext ${extendedCad.toFixed(2)}
                      {mustBuyMore && (
                        <span className="ml-1">(×{effectiveQty.toLocaleString()})</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>
            {picked && !saving && (
              <X
                className="inline h-3 w-3 ml-1 text-blue-600 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSelection(tier);
                }}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ---------- Cache-age badge ----------

function CacheBadge({
  fromCache,
  ageHours,
  fetchedAt,
}: {
  fromCache: boolean | undefined;
  ageHours: number | null;
  fetchedAt: string | null;
}) {
  // Legacy/transition quotes: field may be undefined — render nothing.
  if (fromCache === undefined) return null;
  if (fromCache === false) {
    return (
      <span
        className="text-[10px] text-green-700 dark:text-green-400 flex items-center gap-0.5"
        title={fetchedAt ? `Fetched live at ${fetchedAt}` : "Live API result"}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
      </span>
    );
  }
  let label = "cached";
  if (ageHours != null) {
    if (ageHours < 1) label = "< 1h";
    else if (ageHours < 24) label = `${Math.round(ageHours)}h`;
    else label = `${Math.max(1, Math.round(ageHours / 24))}d`;
  }
  return (
    <span
      className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 rounded"
      title={fetchedAt ? `Cached — fetched at ${fetchedAt}` : "Cached quote"}
    >
      {label}
    </span>
  );
}
