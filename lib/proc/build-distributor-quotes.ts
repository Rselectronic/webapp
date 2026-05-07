import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankDistributors,
  type DistributorQuote,
  type PriceBreak,
  type RankedQuote,
} from "@/lib/proc/rank-distributors";
import { getRate } from "@/lib/pricing/fx";

// Shared helper: builds the `cpcs` payload for a PROC's merged BOM.
// Same shape as GET /api/proc/[id]/distributor-quotes — consumed by both the
// route handler and the PROC detail page (for SSR first paint).
//
// Phase 3 of the CPC-vs-MPN refactor: aggregation key is now CPC, not MPN.
// Multiple BOM lines sharing one CPC but with different MPNs (supplier
// alternates / rotated parts) collapse into a single entry. The
// "winning MPN" used for distributor lookups is whichever MPN had the most
// aggregated qty across the contributing bom_lines (or the
// customer_parts.mpn_to_use override when set). The pricing cache lookup
// stays MPN-keyed because that's what we send to DigiKey/Mouser/etc.

interface CacheRow {
  source: string;
  mpn: string | null;
  search_key: string;
  response: Record<string, unknown> | null;
  unit_price: number | null;
  stock_qty: number | null;
  currency: string | null;
  manufacturer: string | null;
  supplier_part_number: string | null;
  price_breaks: unknown;
  lead_time_days: number | null;
  moq: number | null;
  order_multiple: number | null;
  fetched_at: string;
}

interface RawBreak {
  min_qty?: number;
  quantity?: number;
  unit_price?: number;
  currency?: string;
}

export interface MpnSelection {
  // CPC and MPN both surface here — CPC is the row identity in the UI,
  // MPN is the supplier-facing part number (winning MPN within the CPC group).
  cpc: string | null;
  mpn: string;
  chosen_supplier: string;
  chosen_supplier_pn: string | null;
  chosen_unit_price_cad: number | null;
  chosen_effective_qty: number | null;
  chose_at?: string | null;
  chosen_by?: string | null;
  order_status?: string | null;
  order_external_id?: string | null;
  ordered_at?: string | null;
  manual_unit_price_cad?: number | null;
  manual_price_note?: string | null;
  effective_unit_price_cad: number | null;
  // Operator override on the merged-BOM "Buy Qty" cell. NULL = use the
  // computed default (shortfall for BG-short, total_with_extras otherwise).
  // Persisted via PATCH /api/proc/[id]/selections/buy-qty.
  manual_buy_qty: number | null;
}

export interface MpnQuoteData {
  qty_needed: number;
  // Winning MPN (what was actually sent to the distributor APIs).
  winning_mpn: string | null;
  ranked: (RankedQuote & { for_mpn: string; package_case: string | null })[];
  winner: (RankedQuote & { for_mpn: string; package_case: string | null }) | null;
  fallback_because_no_stock: boolean;
  selection: MpnSelection | null;
  is_customer_supplied: boolean;
  is_apcb: boolean;
  alt_mpns: string[];
}

export interface DistributorQuotesResult {
  // Keyed by uppercased CPC.
  cpcs: Record<string, MpnQuoteData>;
}

function extractPackageFromResponse(resp: Record<string, unknown> | null): string | null {
  if (!resp || typeof resp !== "object") return null;
  const pick = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  };
  const direct =
    pick(resp.package_case) ??
    pick(resp.package) ??
    pick((resp.parameters as Record<string, unknown> | undefined)?.Package) ??
    pick((resp.specs as Record<string, unknown> | undefined)?.Package) ??
    pick((resp.attributes as Record<string, unknown> | undefined)?.Package) ??
    pick(resp.Packaging);
  if (direct) return direct;
  const params = resp.parameters;
  if (Array.isArray(params)) {
    for (const p of params as Array<Record<string, unknown>>) {
      const name = typeof p?.ParameterText === "string" ? p.ParameterText : "";
      if (/package|case/i.test(name)) {
        const val = pick(p.ValueText);
        if (val) return val;
      }
    }
  }
  return null;
}

export async function buildDistributorQuotes(
  supabase: SupabaseClient,
  procurementId: string,
): Promise<DistributorQuotesResult> {
  const id = procurementId;

  // 1. Load member jobs
  const { data: members } = await supabase
    .from("jobs")
    .select("id, quantity, bom_id, source_quote_id")
    .eq("procurement_id", id);
  const bomIds = Array.from(
    new Set((members ?? []).map((m) => m.bom_id).filter((b): b is string => !!b))
  );
  if (bomIds.length === 0) return { cpcs: {} };

  const { data: procRow } = await supabase
    .from("procurements")
    .select("customer_id")
    .eq("id", id)
    .maybeSingle();

  // 2. bom_lines
  const { data: bomLines } = await supabase
    .from("bom_lines")
    .select("id, bom_id, quantity, mpn, m_code, cpc")
    .in("bom_id", bomIds);

  // 2b. customer_parts.mpn_to_use map — when set, this MPN wins for that CPC
  // regardless of which MPN had higher aggregated qty in the bom_lines.
  const cpcToMpnToUse = new Map<string, string>();
  if (procRow?.customer_id) {
    const { data: cpRows } = await supabase
      .from("customer_parts")
      .select("cpc, mpn_to_use")
      .eq("customer_id", procRow.customer_id)
      .not("cpc", "is", null)
      .not("mpn_to_use", "is", null);
    for (const row of cpRows ?? []) {
      const cpc = (row.cpc ?? "").trim();
      const mpnTo = (row.mpn_to_use ?? "").trim();
      if (cpc && mpnTo) cpcToMpnToUse.set(cpc.toUpperCase(), mpnTo);
    }
  }

  // CPC aggregation key for a bom_line: uppercase CPC; falls back to MPN when
  // no CPC (parser convention: blank CPC ⇒ use MPN-as-CPC).
  const cpcKeyFor = (line: { cpc: string | null; mpn: string | null }): string => {
    const c = (line.cpc ?? "").trim();
    if (c) return c.toUpperCase();
    return (line.mpn ?? "").trim().toUpperCase();
  };

  // 2c. alternates
  const bomLineIds = (bomLines ?? []).map((l) => l.id);
  const altsByLineId = new Map<string, { mpn: string; manufacturer: string | null; rank: number | null }[]>();
  if (bomLineIds.length > 0) {
    const { data: altRows } = await supabase
      .from("bom_line_alternates")
      .select("bom_line_id, mpn, manufacturer, rank")
      .in("bom_line_id", bomLineIds);
    for (const a of altRows ?? []) {
      if (!a.mpn) continue;
      const arr = altsByLineId.get(a.bom_line_id) ?? [];
      arr.push({ mpn: a.mpn, manufacturer: a.manufacturer ?? null, rank: a.rank ?? null });
      altsByLineId.set(a.bom_line_id, arr);
    }
  }

  // 2d. CS lines
  const sourceQuoteIds = Array.from(
    new Set((members ?? []).map((m) => m.source_quote_id).filter((q): q is string => !!q))
  );
  const csLineIds = new Set<string>();
  if (sourceQuoteIds.length > 0) {
    const { data: csRows } = await supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .in("quote_id", sourceQuoteIds);
    for (const r of csRows ?? []) {
      if (r.bom_line_id) csLineIds.add(r.bom_line_id);
    }
  }

  const memberQtyByBom = new Map<string, number>();
  for (const m of members ?? []) {
    if (m.bom_id) memberQtyByBom.set(m.bom_id, m.quantity ?? 0);
  }

  // 3. overage
  const { data: overageData } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");
  const overageByMcode = new Map<string, { qty_threshold: number; extras: number }[]>();
  for (const t of overageData ?? []) {
    const arr = overageByMcode.get(t.m_code) ?? [];
    arr.push({ qty_threshold: t.qty_threshold, extras: t.extras });
    overageByMcode.set(t.m_code, arr);
  }
  for (const [, arr] of overageByMcode) arr.sort((a, b) => a.qty_threshold - b.qty_threshold);
  const extrasFor = (mcode: string | null, qty: number): number => {
    if (!mcode) return 0;
    const tiers = overageByMcode.get(mcode);
    if (!tiers) return 0;
    let extras = 0;
    for (const t of tiers) if (qty >= t.qty_threshold) extras = t.extras;
    return extras;
  };

  // 4. rollup per CPC. Each CPC group tracks per-MPN aggregated qty so we can
  // pick the "winning" MPN (highest qty) — that's what gets sent to the
  // distributor APIs and used to look up cached pricing.
  const cpcInfo = new Map<
    string,
    {
      total_qty: number;
      m_code: string | null;
      line_ids: string[];
      qty_by_mpn: Map<string, number>;
      alt_mpns_upper: Set<string>;
      alt_mpns_original: Map<string, string>;
    }
  >();
  for (const line of bomLines ?? []) {
    const key = cpcKeyFor(line);
    if (!key) continue;
    const memberQty = memberQtyByBom.get(line.bom_id) ?? 0;
    const add = (line.quantity ?? 0) * memberQty;
    let existing = cpcInfo.get(key);
    if (!existing) {
      existing = {
        total_qty: 0,
        m_code: null,
        line_ids: [],
        qty_by_mpn: new Map(),
        alt_mpns_upper: new Set(),
        alt_mpns_original: new Map(),
      };
      cpcInfo.set(key, existing);
    }
    existing.total_qty += add;
    existing.m_code ||= line.m_code ?? null;
    existing.line_ids.push(line.id);
    const mpnTrim = (line.mpn ?? "").trim();
    if (mpnTrim) {
      existing.qty_by_mpn.set(mpnTrim, (existing.qty_by_mpn.get(mpnTrim) ?? 0) + add);
    }
    const alts = altsByLineId.get(line.id) ?? [];
    for (const alt of alts) {
      const altTrim = (alt.mpn ?? "").trim();
      if (!altTrim) continue;
      const up = altTrim.toUpperCase();
      if (!existing.alt_mpns_upper.has(up)) {
        existing.alt_mpns_upper.add(up);
        existing.alt_mpns_original.set(up, altTrim);
      }
    }
  }

  // Resolve winning MPN per CPC — customer_parts override wins, otherwise
  // pick highest-qty MPN. Strip the winning MPN from the alternates set.
  const winningMpnByCpc = new Map<string, string>();
  for (const [cpc, info] of cpcInfo) {
    const override = cpcToMpnToUse.get(cpc);
    let winner: string | null = null;
    if (override) {
      winner = override;
    } else {
      const sorted = Array.from(info.qty_by_mpn.entries()).sort((a, b) => b[1] - a[1]);
      winner = sorted[0]?.[0] ?? null;
    }
    if (!winner) continue;
    winningMpnByCpc.set(cpc, winner);
    // Don't include the winner in alt_mpns.
    const winnerUpper = winner.toUpperCase();
    if (info.alt_mpns_upper.has(winnerUpper)) {
      info.alt_mpns_upper.delete(winnerUpper);
      info.alt_mpns_original.delete(winnerUpper);
    }
    // Other contributing MPNs (not the winner) become alternates so the
    // distributor ranking can still consider them.
    for (const otherMpn of info.qty_by_mpn.keys()) {
      const up = otherMpn.toUpperCase();
      if (up === winnerUpper) continue;
      if (!info.alt_mpns_upper.has(up)) {
        info.alt_mpns_upper.add(up);
        info.alt_mpns_original.set(up, otherMpn);
      }
    }
  }

  const cpcQtyNeeded = new Map<string, number>();
  for (const [cpc, info] of cpcInfo) {
    if (info.total_qty <= 0) continue;
    cpcQtyNeeded.set(cpc, info.total_qty + extrasFor(info.m_code, info.total_qty));
  }

  const cpcList = Array.from(cpcQtyNeeded.keys());
  if (cpcList.length === 0) return { cpcs: {} };

  // 5. cache rows. Search keys are the supplier-facing MPNs (winner + alts),
  // not CPCs — api_pricing_cache stores responses keyed on the part number we
  // sent to DigiKey/Mouser/etc.
  const searchKeys = new Set<string>();
  for (const cpc of cpcList) {
    const winner = winningMpnByCpc.get(cpc);
    if (winner) searchKeys.add(winner.toUpperCase());
    const info = cpcInfo.get(cpc);
    if (info) for (const up of info.alt_mpns_upper) searchKeys.add(up);
  }
  const { data: cacheRows } = await supabase
    .from("api_pricing_cache")
    .select(
      "source, mpn, search_key, response, unit_price, stock_qty, currency, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, fetched_at"
    )
    .in("search_key", Array.from(searchKeys));

  const cacheByMpn = new Map<string, CacheRow[]>();
  for (const row of (cacheRows ?? []) as CacheRow[]) {
    const k = row.search_key.toUpperCase();
    const arr = cacheByMpn.get(k) ?? [];
    arr.push(row);
    cacheByMpn.set(k, arr);
  }

  // 6. FX
  const fxCache = new Map<string, number | null>();
  const getFxRate = async (cur: string): Promise<number | null> => {
    if (!cur || cur === "CAD") return 1.0;
    if (fxCache.has(cur)) return fxCache.get(cur)!;
    const rate = await getRate(cur, "CAD");
    const r = rate ? rate.rate : null;
    fxCache.set(cur, r);
    return r;
  };

  // 7. selections — keyed by uppercased CPC. The selections table now has a
  // cpc column (migration 081); we prefer it but fall back to the MPN-derived
  // CPC group when cpc is null on legacy rows. Phase 2 owns the upsert path
  // and will populate cpc going forward.
  const { data: selections } = await supabase
    .from("procurement_line_selections")
    .select(
      "cpc, mpn, chosen_supplier, chosen_supplier_pn, chosen_unit_price_cad, chosen_effective_qty, chose_at, chosen_by, order_status, order_external_id, ordered_at, manual_unit_price_cad, manual_price_note, manual_buy_qty"
    )
    .eq("procurement_id", id);
  const selectionByCpc = new Map<string, MpnSelection>();
  // Reverse lookup: for legacy rows where cpc is null, find the CPC group
  // whose winning MPN equals the row's MPN.
  const cpcByWinningMpn = new Map<string, string>();
  for (const [cpc, mpn] of winningMpnByCpc) {
    cpcByWinningMpn.set(mpn.toUpperCase(), cpc);
  }
  for (const s of (selections ?? []) as {
    cpc: string | null;
    mpn: string;
    chosen_supplier: string;
    chosen_supplier_pn: string | null;
    chosen_unit_price_cad: number | null;
    chosen_effective_qty: number | null;
    chose_at?: string | null;
    chosen_by?: string | null;
    order_status?: string | null;
    order_external_id?: string | null;
    ordered_at?: string | null;
    manual_unit_price_cad: number | null;
    manual_price_note?: string | null;
    manual_buy_qty: number | null;
  }[]) {
    const effective_unit_price_cad =
      s.manual_unit_price_cad ?? s.chosen_unit_price_cad ?? null;
    const cpcKey = s.cpc
      ? s.cpc.toUpperCase()
      : cpcByWinningMpn.get((s.mpn ?? "").toUpperCase()) ?? null;
    if (!cpcKey) continue;
    selectionByCpc.set(cpcKey, {
      ...s,
      effective_unit_price_cad,
      manual_buy_qty: s.manual_buy_qty ?? null,
    });
  }

  const rowToQuote = async (
    row: CacheRow,
    for_mpn: string
  ): Promise<(DistributorQuote & { for_mpn: string; package_case: string | null }) | null> => {
    if (
      row.unit_price == null &&
      (!row.price_breaks || (Array.isArray(row.price_breaks) && row.price_breaks.length === 0))
    ) {
      return null;
    }
    const cur = row.currency ?? "USD";
    const fxRate = await getFxRate(cur);
    const rawBreaks: RawBreak[] = Array.isArray(row.price_breaks)
      ? (row.price_breaks as RawBreak[])
      : [];
    const price_breaks: PriceBreak[] = rawBreaks
      .map((b) => {
        const min_qty = b.min_qty ?? b.quantity ?? 0;
        const unit_price = b.unit_price ?? 0;
        const currency = b.currency ?? cur;
        const unit_price_cad = fxRate != null ? unit_price * fxRate : null;
        return { min_qty, unit_price, unit_price_cad, currency };
      })
      .filter((b) => b.min_qty > 0 && b.unit_price > 0)
      .sort((a, b) => a.min_qty - b.min_qty);

    const unit_price_cad_fallback =
      row.unit_price != null && fxRate != null ? row.unit_price * fxRate : null;

    return {
      source: row.source,
      supplier_pn: row.supplier_part_number,
      manufacturer: row.manufacturer,
      stock_qty: row.stock_qty,
      moq: row.moq,
      order_multiple: row.order_multiple,
      lead_time_days: row.lead_time_days,
      price_breaks,
      unit_price_cad_fallback,
      currency: cur,
      fetched_at: row.fetched_at,
      for_mpn,
      package_case: extractPackageFromResponse(row.response),
    };
  };

  // 8. shape + rank — keyed by CPC.
  const result: Record<string, MpnQuoteData> = {};
  for (const cpc of cpcList) {
    const qty_needed = cpcQtyNeeded.get(cpc) ?? 0;
    const info = cpcInfo.get(cpc);
    const winning_mpn = winningMpnByCpc.get(cpc) ?? null;

    const lineIds = info?.line_ids ?? [];
    const is_customer_supplied = lineIds.some((lid) => csLineIds.has(lid));

    const alt_mpns: string[] = info
      ? Array.from(info.alt_mpns_original.values())
      : [];

    if (is_customer_supplied) {
      result[cpc] = {
        qty_needed,
        winning_mpn,
        ranked: [],
        winner: null,
        fallback_because_no_stock: false,
        selection: selectionByCpc.get(cpc) ?? null,
        is_customer_supplied: true,
        is_apcb: false,
        alt_mpns,
      };
      continue;
    }

    if (info?.m_code === "APCB") {
      result[cpc] = {
        qty_needed,
        winning_mpn,
        ranked: [],
        winner: null,
        fallback_because_no_stock: false,
        selection: null,
        is_customer_supplied: false,
        is_apcb: true,
        alt_mpns: [],
      };
      continue;
    }

    // Search the pricing cache by winning MPN first, then alternates. The
    // `for_mpn` carries through into RankedQuote so the UI can label which
    // MPN each quote is bound to.
    const keysToFetch: { keyUpper: string; for_mpn: string }[] = [];
    if (winning_mpn) {
      keysToFetch.push({ keyUpper: winning_mpn.toUpperCase(), for_mpn: winning_mpn });
    }
    if (info) {
      for (const [up, orig] of info.alt_mpns_original) {
        if (winning_mpn && up === winning_mpn.toUpperCase()) continue;
        keysToFetch.push({ keyUpper: up, for_mpn: orig });
      }
    }

    const quotesWithFor: (DistributorQuote & { for_mpn: string; package_case: string | null })[] = [];
    for (const { keyUpper, for_mpn } of keysToFetch) {
      const rawRows = cacheByMpn.get(keyUpper) ?? [];
      for (const row of rawRows) {
        const q = await rowToQuote(row, for_mpn);
        if (q) quotesWithFor.push(q);
      }
    }

    const ranking = rankDistributors({ qty_needed, quotes: quotesWithFor });
    const ranked = ranking.ranked as (RankedQuote & { for_mpn: string; package_case: string | null })[];
    const winner = ranking.winner as (RankedQuote & { for_mpn: string; package_case: string | null }) | null;

    result[cpc] = {
      qty_needed,
      winning_mpn,
      ranked,
      winner,
      fallback_because_no_stock: ranking.fallback_because_no_stock,
      selection: selectionByCpc.get(cpc) ?? null,
      is_customer_supplied: false,
      is_apcb: false,
      alt_mpns,
    };
  }

  return { cpcs: result };
}
