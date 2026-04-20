"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Check, AlertCircle, X } from "lucide-react";
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
};

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
  } = props;
  const wizardMode = Boolean(quoteId);
  const router = useRouter();

  // ---- Supplier selection ----
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<BuiltInSupplierName>>(
    // Default to the 3 we know are working (DigiKey, Mouser, LCSC)
    new Set(["digikey", "mouser", "lcsc"] as BuiltInSupplierName[])
  );

  // ---- Tier configuration ----
  // In wizard mode the tiers are locked to whatever Step 1 saved and come in
  // as a prop on every render — deriving them directly from the prop keeps us
  // in sync if the server re-fetches after a save. Standalone mode still
  // has an editable local-state version (user types tier list + Apply).
  const [localTiers, setLocalTiers] = useState<number[]>(
    tiersFromQuote && tiersFromQuote.length > 0 ? tiersFromQuote : DEFAULT_TIERS
  );
  const tiers =
    quoteId && tiersFromQuote && tiersFromQuote.length > 0
      ? tiersFromQuote
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
      const key = (line.mpn ?? line.cpc ?? "").toUpperCase();
      if (!key) continue;
      const cached = byKey.get(key);
      if (!cached) continue;
      const quotes: QuoteWithCad[] = cached
        .filter((r) => r.unit_price !== null && r.unit_price > 0)
        .map((r) => ({
          source: r.source,
          mpn: key,
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
        }));
      if (quotes.length > 0) m.set(line.id, quotes);
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      m[line.id] = tiers.map(
        (t) => qtyPerBoard * t + getOverage(line.m_code, t, overages)
      );
    }
    return m;
  }, [lines, tiers, overages]);

  const fetchPrices = async (lineIds?: string[]) => {
    if (selectedSuppliers.size === 0) {
      toast.error("Select at least one distributor");
      return;
    }
    setFetching(true);
    try {
      // Only ship the order qtys for lines we're actually about to query.
      // The route uses them to drive per-tier Avnet calls; break-table
      // suppliers ignore them and return their full ladders as usual.
      const targetLineIds = lineIds ?? lines.map((l) => l.id);
      const tierOrderQtys: Record<string, number[]> = {};
      for (const id of targetLineIds) {
        if (orderQtysByLine[id]) tierOrderQtys[id] = orderQtysByLine[id];
      }

      const res = await fetch(`/api/bom/${bomId}/pricing-review/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suppliers: Array.from(selectedSuppliers),
          bom_line_ids: lineIds,
          tier_order_qtys: tierOrderQtys,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        results: Array<{ bom_line_id: string; quotes: QuoteWithCad[] }>;
        api_calls: number;
      };
      const nextMap = new Map(quotesMap);
      const linesWithQuotes: string[] = [];
      for (const r of data.results) {
        nextMap.set(r.bom_line_id, r.quotes);
        if (r.quotes.length > 0) linesWithQuotes.push(r.bom_line_id);
      }
      setQuotesMap(nextMap);

      // Auto-expand every row that got a quote so the user actually sees the
      // new data instead of hunting for the chevron on each line.
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of linesWithQuotes) next.add(id);
        return next;
      });

      const quotesCount = data.results.reduce((n, r) => n + r.quotes.length, 0);
      const linesCount = linesWithQuotes.length;
      toast.success(
        `Got ${quotesCount} quote${quotesCount === 1 ? "" : "s"} across ${linesCount} line${linesCount === 1 ? "" : "s"}`,
        { description: `${data.api_calls} API calls fired` }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Price fetch failed", { description: msg });
    } finally {
      setFetching(false);
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

  const toggleExpand = (lineId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
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
        body: JSON.stringify({ preference_id: pickedPreferenceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(
        `Applied preference — ${data.picks_applied} picks`,
        data.unresolved_lines > 0
          ? { description: `${data.unresolved_lines} line${data.unresolved_lines === 1 ? "" : "s"} had no quotes — fetch prices first.` }
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

  // -------- Derived --------

  // Classify every line into mutually useful buckets. Memoized so badge
  // counts, the badge-as-filter buttons, and the rendered line list all use
  // the same source of truth.
  type LineBucket = "unquoted" | "quoted" | "fully_picked" | "partial_picks" | "no_picks" | "customer_supplied";
  const classifyLine = useCallback(
    (lineId: string): Set<LineBucket> => {
      const set = new Set<LineBucket>();
      if (customerSupplied.has(lineId)) {
        set.add("customer_supplied");
        return set;
      }
      const q = quotesMap.get(lineId);
      if (q && q.length > 0) set.add("quoted");
      else set.add("unquoted");
      const pickCount = tiers.reduce(
        (n, t) => n + (selectionsMap.has(`${lineId}|${t}`) ? 1 : 0),
        0
      );
      if (pickCount === 0) set.add("no_picks");
      else if (pickCount === tiers.length) set.add("fully_picked");
      else set.add("partial_picks");
      return set;
    },
    [customerSupplied, quotesMap, selectionsMap, tiers]
  );

  const summary = useMemo(() => {
    let total = 0;
    let quoted = 0;
    let unquoted = 0;
    let fullyPicked = 0;
    let partialPicks = 0;
    let noPicks = 0;
    let customerSuppliedCount = 0;
    for (const line of lines) {
      total++;
      const b = classifyLine(line.id);
      if (b.has("customer_supplied")) customerSuppliedCount++;
      if (b.has("quoted")) quoted++;
      if (b.has("unquoted")) unquoted++;
      if (b.has("fully_picked")) fullyPicked++;
      if (b.has("partial_picks")) partialPicks++;
      if (b.has("no_picks")) noPicks++;
    }
    return { total, quoted, unquoted, fullyPicked, partialPicks, noPicks, customerSuppliedCount };
  }, [lines, classifyLine]);

  // Badge-as-filter. Clicking a badge toggles the matching filter; clicking
  // again (same bucket) clears it. null = show all.
  const [summaryFilter, setSummaryFilter] = useState<LineBucket | null>(null);

  const visibleLines = useMemo(() => {
    if (!summaryFilter) return lines;
    return lines.filter((l) => classifyLine(l.id).has(summaryFilter));
  }, [lines, summaryFilter, classifyLine]);

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
            <div className="flex gap-1 flex-wrap">
              {tiers.map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </div>
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
              <select
                value={pickedPreferenceId ?? ""}
                onChange={(e) => setPickedPreferenceId(e.target.value || null)}
                className="h-9 rounded-md border bg-white dark:bg-gray-950 dark:border-gray-700 px-3 text-sm min-w-[280px]"
              >
                <option value="">Select a preference…</option>
                {preferences.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.is_system ? "★ " : ""}
                    {p.name}
                  </option>
                ))}
              </select>
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

      <div className="flex items-center justify-between flex-wrap gap-3">
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
            <button
              type="button"
              onClick={() => setSummaryFilter(null)}
              className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (expanded.size === lines.length) setExpanded(new Set());
              else setExpanded(new Set(lines.map((l) => l.id)));
            }}
          >
            {expanded.size === lines.length ? "Collapse all" : "Expand all"}
          </Button>
          <Button size="lg" onClick={() => fetchPrices()} disabled={fetching}>
            {fetching ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <RefreshCw className="h-5 w-5 mr-2" />}
            Fetch Prices
          </Button>
        </div>
      </div>

      {/* Per-line table */}
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950 overflow-hidden">
        {visibleLines.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            No components match the active filter.
          </div>
        )}
        {visibleLines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            tiers={tiers}
            orderQtys={orderQtysByLine[line.id] ?? tiers}
            overages={overages}
            quotes={quotesMap.get(line.id) ?? []}
            selections={tiers.map((t) => selectionsMap.get(`${line.id}|${t}`) ?? null)}
            expanded={expanded.has(line.id)}
            onToggleExpand={() => toggleExpand(line.id)}
            onSelectQuote={(tier, quote) => saveSelection(line, tier, quote)}
            onClearSelection={(tier) => clearSelection(line.id, tier)}
            onRefreshLine={() => fetchPrices([line.id])}
            savingKey={savingKey}
            wizardMode={wizardMode}
            isCustomerSupplied={customerSupplied.has(line.id)}
            onToggleCustomerSupplied={
              wizardMode ? () => toggleCustomerSupplied(line.id) : undefined
            }
            togglingCustomerSupplied={togglingSupplied === line.id}
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
  savingKey,
  wizardMode,
  isCustomerSupplied,
  onToggleCustomerSupplied,
  togglingCustomerSupplied,
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
  savingKey: string | null;
  wizardMode: boolean;
  isCustomerSupplied: boolean;
  onToggleCustomerSupplied?: () => void;
  togglingCustomerSupplied: boolean;
}) {
  // Stock indicator — green when *any* quoted distributor has enough stock
  // for the largest tier's order qty; amber when someone has stock but not
  // enough; red when nobody has any. "Candidate" label triggers when there
  // are zero quotes at all (suggests customer-supplied part).
  const maxOrderQty = orderQtys.length > 0 ? Math.max(...orderQtys) : 0;
  const stockStatus = computeStockStatus(quotes, maxOrderQty);
  const allPicked = selections.every(Boolean);
  const anyPicked = selections.some(Boolean);

  return (
    <div
      className={`border-b last:border-b-0 dark:border-gray-800 ${
        isCustomerSupplied ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
      }`}
    >
      {/* Summary row (always visible) */}
      <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50">
        <button onClick={onToggleExpand} className="mt-0.5 text-gray-400 hover:text-gray-700">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="text-xs text-gray-400 min-w-[24px] mt-0.5">{line.line_number}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{line.mpn ?? line.cpc ?? "(no MPN)"}</span>
            {line.m_code && <Badge variant="secondary" className="text-[10px]">{line.m_code}</Badge>}
            <StockBadge status={stockStatus} />
            {isCustomerSupplied && (
              <Badge variant="secondary" className="text-[10px] bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                Customer supplied
              </Badge>
            )}
            {stockStatus.level === "none" && !isCustomerSupplied && wizardMode && (
              <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                Candidate for customer-supplied
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
          {!isCustomerSupplied && (() => {
            const picks = selections.filter(Boolean).length;
            // If selections exist but we can't see the underlying quotes on
            // this page load, the picks are stale (cache expired / earlier
            // session). Surface that instead of silently showing "N/M picked"
            // against an empty quotes table.
            const stale = picks > 0 && quotes.length === 0;
            return (
              <Badge
                variant={stale ? "secondary" : allPicked ? "default" : anyPicked ? "secondary" : "destructive"}
                className={stale ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : undefined}
              >
                {picks}/{tiers.length} picked{stale ? " (stale)" : ""}
              </Badge>
            );
          })()}
          <div className="flex gap-2 items-center">
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
            <Button variant="ghost" size="sm" onClick={onRefreshLine} className="h-6 px-2 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded quotes + tier pickers */}
      {expanded && (
        <div className="px-6 pb-4 space-y-3">
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
                      <th className="text-left px-3 py-2">Flags</th>
                      {tiers.map((t, idx) => {
                        const extras = getOverage(line.m_code, t, overages);
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
                    {quotes.map((q, idx) => (
                      <QuoteRow
                        key={`${q.source}-${q.warehouse_code ?? "default"}-${idx}`}
                        quote={q}
                        tiers={tiers}
                        orderQtys={orderQtys}
                        selections={selections}
                        onSelectQuote={onSelectQuote}
                        onClearSelection={onClearSelection}
                        lineId={line.id}
                        savingKey={savingKey}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
        </div>
        {quote.supplier_part_number && (
          <div className="text-[10px] text-gray-400 font-mono">{quote.supplier_part_number}</div>
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
        const price = priceAtTier(quote, orderQty);
        const priceCad = priceAtTierCad(quote, orderQty);
        const sel = selections[idx];
        const picked = sel?.supplier === quote.source && (sel?.warehouse_code ?? null) === (quote.warehouse_code ?? null);
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
