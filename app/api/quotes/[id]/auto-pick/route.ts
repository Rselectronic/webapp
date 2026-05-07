import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRate } from "@/lib/pricing/fx";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier, PriceBreak } from "@/lib/pricing/types";
// ---------------------------------------------------------------------------
// POST /api/quotes/[id]/auto-pick â€” body: { preference_id }
//
// Applies a pricing preference rule to every BOM line on this quote (except
// those flagged customer-supplied). For each (line, tier) the rule picks the
// winning cached supplier quote, which gets upserted into bom_line_pricing.
//
// Also writes `pinned_preference = preference_id` on the quotes row so the
// UI remembers which rule was last applied.
//
// The rules:
//   cheapest_overall              â€” lowest CAD price at this tier's order_qty
//   cheapest_in_stock             â€” same, but filter quotes with enough stock
//   cheapest_in_stock_franchised  â€” same, plus franchised=true only
//   shortest_lead_time            â€” fewest lead_time_days (nulls last)
//   strict_priority               â€” first supplier hit matching priority list
//   custom                        â€” JSON config.filters + config.priority
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CachedQuote {
  source: string;
  search_key: string;
  unit_price: number | null;
  currency: string | null;
  stock_qty: number | null;
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

interface PickCandidate {
  source: string;
  supplier_part_number: string | null;
  unit_price_native: number;
  currency: string;
  unit_price_cad: number;
  /**
   * Real quantity we'd buy if we picked this supplier â€” raw order_qty
   * rounded up to at least MOQ, then up to the next multiple of
   * order_multiple. Cheapest-cost comparisons should use this, not
   * unit_price_cad Ã— order_qty, so a supplier that "looks cheap" but
   * forces a 8000-unit MOQ loses to a supplier with a higher unit price
   * and no packaging minimum.
   */
  effective_qty: number;
  extended_cad: number;
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  lead_time_days: number | null;
  warehouse_code: string | null;
  ncnr: boolean | null;
  franchised: boolean | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  if (!UUID_RE.test(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  let body: { preference_id?: unknown; suppliers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const preferenceId = typeof body.preference_id === "string" ? body.preference_id : "";
  if (!UUID_RE.test(preferenceId)) {
    return NextResponse.json({ error: "preference_id required" }, { status: 400 });
  }
  // Active-supplier scope. When the client sends a non-empty array, auto-pick
  // only considers candidates from those suppliers â€” matches the left-rail
  // checkbox selection so the UI "what you see is what gets picked". When
  // absent or empty, fall back to the legacy behavior (consider all).
  const activeSuppliers = Array.isArray(body.suppliers)
    ? (body.suppliers as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  const activeSupplierSet = activeSuppliers.length > 0 ? new Set(activeSuppliers) : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // --- Load quote + preference in parallel ---
  const [
    { data: quote },
    { data: preference },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, bom_id, quantities")
      .eq("id", quoteId)
      .maybeSingle(),
    supabase
      .from("pricing_preferences")
      .select("id, rule, config")
      .eq("id", preferenceId)
      .maybeSingle(),
  ]);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!preference) return NextResponse.json({ error: "Preference not found" }, { status: 404 });

  const tiers = Array.isArray((quote.quantities as { tiers?: unknown })?.tiers)
    ? (quote.quantities as { tiers: number[] }).tiers
    : [];
  if (tiers.length === 0) {
    return NextResponse.json(
      { error: "Quote has no tier quantities yet. Complete step 1 first." },
      { status: 400 }
    );
  }

  // --- BOM lines + overages + customer-supplied filter ---
  const [
    { data: bomLines },
    { data: overageRows },
    { data: customerSupplied },
  ] = await Promise.all([
    supabase
      .from("bom_lines")
      .select("id, mpn, cpc, m_code, quantity")
      .eq("bom_id", quote.bom_id)
      .eq("is_pcb", false)
      .eq("is_dni", false)
      .gt("quantity", 0),
    supabase
      .from("overage_table")
      .select("m_code, qty_threshold, extras"),
    supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .eq("quote_id", quoteId),
  ]);

  if (!bomLines) {
    return NextResponse.json({ error: "Failed to load BOM lines" }, { status: 500 });
  }
  const overages: OverageTier[] = (overageRows ?? []).map((o) => ({
    m_code: o.m_code,
    qty_threshold: o.qty_threshold,
    extras: o.extras,
  }));
  const csSet = new Set((customerSupplied ?? []).map((r) => r.bom_line_id));

  // --- Load alternates so auto-pick can see customer- and operator-added
  // alt MPNs, not just the line's primary mpn/cpc.
  const lineIdList = bomLines.filter((l) => !csSet.has(l.id)).map((l) => l.id);
  const { data: altRows } = lineIdList.length > 0
    ? await supabase
        .from("bom_line_alternates")
        .select("bom_line_id, mpn")
        .in("bom_line_id", lineIdList)
    : { data: [] };
  const altsByLineId = new Map<string, string[]>();
  for (const a of altRows ?? []) {
    if (!a.mpn) continue;
    const arr = altsByLineId.get(a.bom_line_id) ?? [];
    arr.push(a.mpn.toUpperCase());
    altsByLineId.set(a.bom_line_id, arr);
  }

  // --- Also pull customer_parts.mpn_to_use. When RS has registered a
  //     replacement MPN for a customer's CPC (obsolete part, known crossref,
  //     etc.), auto-pick must see quotes stored under that MPN too. Without
  //     this, CPCs whose original MPN has no quote get skipped even though
  //     the replacement has perfectly good cached pricing.
  const { data: bomRowForPick } = await supabase
    .from("boms")
    .select("customer_id")
    .eq("id", quote.bom_id)
    .maybeSingle();
  if (bomRowForPick?.customer_id) {
    const cpcs = [
      ...new Set(
        bomLines
          .filter((l) => !csSet.has(l.id))
          .map((l) => l.cpc)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
      ),
    ];
    if (cpcs.length > 0) {
      const { data: cpRows } = await supabase
        .from("customer_parts")
        .select("cpc, mpn_to_use")
        .eq("customer_id", bomRowForPick.customer_id)
        .in("cpc", cpcs);
      const byCpc = new Map<string, string>();
      for (const row of cpRows ?? []) {
        if (row.mpn_to_use && row.mpn_to_use.trim()) {
          byCpc.set(row.cpc, row.mpn_to_use.trim().toUpperCase());
        }
      }
      for (const l of bomLines) {
        if (!l.cpc) continue;
        const mpnToUse = byCpc.get(l.cpc);
        if (!mpnToUse) continue;
        if (mpnToUse === (l.mpn ?? "").toUpperCase()) continue;
        const arr = altsByLineId.get(l.id) ?? [];
        if (!arr.includes(mpnToUse)) arr.unshift(mpnToUse);
        altsByLineId.set(l.id, arr);
      }
    }
  }

  // --- Cached quotes for every MPN/CPC/alternate used in the BOM ---
  const keys = new Set<string>();
  for (const l of bomLines) {
    if (csSet.has(l.id)) continue;
    if (l.mpn) keys.add(l.mpn.toUpperCase());
    if (l.cpc) keys.add(l.cpc.toUpperCase());
    for (const altMpn of altsByLineId.get(l.id) ?? []) keys.add(altMpn);
  }
  // Cache lookup goes through the admin (service-role) client. The cache
  // table is shared (not user-specific), so bypassing RLS for reads is safe
  // here — and it sidesteps a PostgREST quirk where bundling many keys
  // into a single `.or()` filter silently drops rows under session-auth
  // when any key contains a slash (`DSPIC33CK1024MP710T-I/PT` was
  // returning 3 of 22 expected rows). Service-role doesn't hit that bug,
  // and one bulk `.or()` query is dramatically faster than per-key
  // queries (a 600-key BOM goes from ~120s of session-auth round-trips
  // down to ~300ms).
  //
  // Auth + admin-role are still validated above — service-role is only
  // used for this read; every WRITE later still goes through the
  // session-auth `supabase` client.
  const adminSupabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const keyArr = [...keys];
  const cachedRows: CachedQuote[] = [];

  if (keyArr.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < keyArr.length; i += CHUNK) {
      const chunk = keyArr.slice(i, i + CHUNK);
      const orParts: string[] = [];
      for (const k of chunk) {
        // Quote values that contain PostgREST .or() reserved chars (,()")
        // so MPNs like "PMEG3020EJ,115" match their cached search_key
        // instead of being silently stripped.
        const needsQuote = /[,()" ]/.test(k);
        const pq = (v: string) =>
          needsQuote ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
        orParts.push(`search_key.eq.${pq(k)}`);
        orParts.push(`search_key.like.${pq(`${k}#%`)}`);
      }
      const { data } = await adminSupabase
        .from("api_pricing_cache")
        .select(
          "source, search_key, unit_price, currency, stock_qty, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at"
        )
        .or(orParts.join(","))
        .gte("expires_at", nowIso)
        .limit(50000);
      if (data) cachedRows.push(...(data as CachedQuote[]));
    }
  }
 
  // Group cached quotes by BARE MPN (uppercase, #warehouse stripped) so a
  // line's `line.mpn` / alt list can look up every matching row regardless
  // of which warehouse they came from.
  const quotesByKey = new Map<string, CachedQuote[]>();
  for (const row of cachedRows) {
    const full = (row.search_key ?? "").toUpperCase();
    if (!full) continue;
    // If the cache row has a warehouse_code, the search_key was written as
    // "MPN#WAREHOUSE" â€” strip only that trailing suffix. MPNs themselves can
    // contain "#" (e.g. Analog Devices' "LT3021EDH#TRPBF"), so a blind
    // split("#") would misindex them and cause auto-pick to miss the row.
    const wh = row.warehouse_code
      ? `#${row.warehouse_code.toUpperCase()}`
      : null;
    const bare = wh && full.endsWith(wh) ? full.slice(0, -wh.length) : full;
    if (!bare) continue;
    const arr = quotesByKey.get(bare) ?? [];
    arr.push(row);
    quotesByKey.set(bare, arr);
  }

  // --- Cache FX rates we'll need so every quote can be compared in CAD. ---
  const fxCache = new Map<string, number>();
  fxCache.set("CAD", 1.0);
  async function fxToCad(currency: string): Promise<number> {
    if (fxCache.has(currency)) return fxCache.get(currency)!;
    const fx = await getRate(currency, "CAD");
    if (!fx) {
      // No rate cached â†’ treat as 1:1 as a last resort but flag via response.
      fxCache.set(currency, 1);
      return 1;
    }
    fxCache.set(currency, fx.rate);
    return fx.rate;
  }

  // --- Apply the rule, one line at a time. ---
  let picks = 0;
  let unresolved = 0;
  const unresolvedLines: string[] = [];
  const expiresAtStamp = new Date().toISOString();
  // Collect every per-tier pick into one array and upsert in a single
  // round-trip after the loop. The previous per-pick upsert scaled linearly
  // with (lines Ã— tiers) and spent most of the time waiting for the DB.
  type SelectionRow = {
    bom_line_id: string;
    tier_qty: number;
    supplier: string;
    supplier_part_number: string | null;
    selected_unit_price: number;
    selected_currency: string;
    selected_unit_price_cad: number;
    fx_rate: number;
    selected_lead_time_days: number | null;
    selected_stock_qty: number | null;
    warehouse_code: string | null;
    selected_by: string;
    selected_at: string;
  };
  const selectionsToWrite: SelectionRow[] = [];

  console.info(
    `[auto-pick/start] quote=${quoteId} bom_lines=${bomLines.length} customer_supplied=${csSet.size} active_suppliers=${activeSupplierSet ? [...activeSupplierSet].join(",") : "ALL"}`
  );
  for (const line of bomLines) {
    if (csSet.has(line.id)) {
      console.info(
        `[auto-pick/skip] line=${line.id} mpn=${line.mpn ?? "—"} reason=customer_supplied`
      );
      continue;
    }
    // Build a search-key list from: primary mpn, cpc, AND every alternate
    // mpn stored on bom_line_alternates (customer-supplied, rs_alt, or
    // operator-added). Dedupe so lines whose primary mpn equals a cpc or
    // an alt don't get double-counted candidates.
    const searchKeySet = new Set<string>();
    if (line.mpn) searchKeySet.add(line.mpn.toUpperCase());
    if (line.cpc) searchKeySet.add(line.cpc.toUpperCase());
    for (const altMpn of altsByLineId.get(line.id) ?? []) searchKeySet.add(altMpn);
    const candidates: CachedQuote[] = [];
    const seenRowIds = new Set<string>();
    for (const k of searchKeySet) {
      const hit = quotesByKey.get(k);
      if (!hit) continue;
      for (const row of hit) {
        // Scope to the active (selected) distributor list when the caller
        // sent one. Cached rows from suppliers the operator currently has
        // unchecked are skipped outright so auto-pick never selects an
        // "invisible" supplier the user can't see on screen.
        if (activeSupplierSet && !activeSupplierSet.has(row.source)) continue;
        // Dedupe by (source, supplier_part_number, warehouse) â€” the same
        // cached row may match under multiple keys when MPN overlaps with
        // CPC or an alt lists the same part.
        const dedupeKey = `${row.source}|${row.supplier_part_number ?? ""}|${row.warehouse_code ?? ""}`;
        if (seenRowIds.has(dedupeKey)) continue;
        seenRowIds.add(dedupeKey);
        candidates.push(row);
      }
    }
    if (candidates.length === 0) {
      unresolved++;
      unresolvedLines.push(line.id);
      console.warn(
        `[auto-pick] line=${line.id} mpn=${line.mpn ?? "â€”"} cpc=${line.cpc ?? "â€”"} NO_CANDIDATES â€” searched keys: ${[...searchKeySet].join(", ")}`
      );
      continue;
    }

    // For each tier, compute order_qty and pick a winner.
    for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
      const tier = tiers[tIdx];
      // Overage thresholds are keyed on PART qty, not board qty â€” pass
      // the base part qty (qty_per_board Ã— tier) so a 30-board / 10-per
      // CP line correctly resolves to its 300-part overage tier.
      const baseQty = line.quantity * tier;
      const extras = getOverage(line.m_code, baseQty, overages);
      const orderQty = baseQty + extras;

      // Build per-tier candidate list with CAD-normalized prices AND the
      // effective-qty / extended-cost pair so the rule can compare suppliers
      // apples-to-apples when MOQ / order_multiple forces the real buy
      // quantity up.
      const perTier: PickCandidate[] = [];
      for (const q of candidates) {
        if (q.unit_price == null) continue;
        const currency = q.currency ?? "USD";
        const breaks = Array.isArray(q.price_breaks) ? (q.price_breaks as PriceBreak[]) : [];
        const moq = q.moq ?? 0;
        const mult = q.order_multiple ?? 1;
        let effectiveQty = Math.max(orderQty, moq);
        if (mult > 1) {
          effectiveQty = Math.ceil(effectiveQty / mult) * mult;
        }
        const nativePrice = pickPriceAtQty(breaks, effectiveQty, q.unit_price);
        if (nativePrice <= 0) continue;
        const rate = await fxToCad(currency);
        const unitCad = nativePrice * rate;
        perTier.push({
          source: q.source,
          supplier_part_number: q.supplier_part_number,
          unit_price_native: nativePrice,
          currency,
          unit_price_cad: unitCad,
          effective_qty: effectiveQty,
          extended_cad: unitCad * effectiveQty,
          stock_qty: q.stock_qty,
          moq: q.moq,
          order_multiple: q.order_multiple,
          lead_time_days: q.lead_time_days,
          warehouse_code: q.warehouse_code,
          ncnr: q.ncnr,
          franchised: q.franchised,
        });
      }
      if (perTier.length === 0) {
        console.warn(
          `[auto-pick] line=${line.id} mpn=${line.mpn ?? "â€”"} tier=${tier} orderQty=${orderQty} NO_PRICE â€” all ${candidates.length} candidate(s) had no usable unit price`
        );
        continue;
      }

      const winner = applyPreferenceRule(
        perTier,
        orderQty,
        preference.rule,
        preference.config,
        `mpn=${line.mpn ?? "—"} tier=${tier}`
      );
      if (!winner) {
        const stockInfo = perTier
          .map((c) => `${c.source}(stock=${c.stock_qty ?? "?"})`)
          .join(", ");
        console.warn(
          `[auto-pick] line=${line.id} mpn=${line.mpn ?? "â€”"} tier=${tier} orderQty=${orderQty} NO_WINNER â€” rule=${preference.rule} excluded all candidates: ${stockInfo}`
        );
        continue;
      }
      console.info(
        `[auto-pick] line=${line.id} mpn=${line.mpn ?? "â€”"} tier=${tier} orderQty=${orderQty} PICK ${winner.source} SPN=${winner.supplier_part_number ?? "â€”"} unit=$${winner.unit_price_cad.toFixed(4)} CAD ext=$${winner.extended_cad.toFixed(2)} (buyQty=${winner.effective_qty}${winner.effective_qty > orderQty ? ` forced by MOQ=${winner.moq ?? 1}/multi=${winner.order_multiple ?? 1}` : ""})`
      );

      // Buffer the selection â€” written in one batch after the loop.
      const rate = fxCache.get(winner.currency) ?? 1;
      selectionsToWrite.push({
        bom_line_id: line.id,
        tier_qty: tier,
        supplier: winner.source,
        supplier_part_number: winner.supplier_part_number,
        selected_unit_price: winner.unit_price_native,
        selected_currency: winner.currency,
        selected_unit_price_cad: winner.unit_price_cad,
        fx_rate: rate,
        selected_lead_time_days: winner.lead_time_days,
        selected_stock_qty: winner.stock_qty,
        warehouse_code: winner.warehouse_code,
        selected_by: user.id,
        selected_at: expiresAtStamp,
      });
      picks++;
    }
  }

  // One-shot batch upsert â€” turns ~192 serial DB round-trips (64 lines Ã—
  // 3 tiers on a typical BOM) into a single call.
  if (selectionsToWrite.length > 0) {
    const { error: upsertErr } = await supabase
      .from("bom_line_pricing")
      .upsert(selectionsToWrite, { onConflict: "bom_line_id,tier_qty" });
    if (upsertErr) {
      return NextResponse.json(
        { error: "Failed to save selections", details: upsertErr.message },
        { status: 500 }
      );
    }
  }

  // Remember which preference was applied so the UI reflects it on reload.
  await supabase
    .from("quotes")
    .update({ pinned_preference: preference.id })
    .eq("id", quoteId);

  return NextResponse.json({
    ok: true,
    picks_applied: picks,
    unresolved_lines: unresolved,
    unresolved_line_ids: unresolvedLines,
  });
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

type Rule =
  | "cheapest_overall"
  | "cheapest_in_stock"
  | "cheapest_in_stock_franchised"
  | "shortest_lead_time"
  | "strict_priority"
  | "custom";

function applyPreferenceRule(
  candidates: PickCandidate[],
  orderQty: number,
  rule: string,
  config: unknown,
  debugTag: string = ""
): PickCandidate | null {
  const r = rule as Rule;
  const cfg = (config ?? {}) as { priority?: string[]; filters?: Record<string, unknown> };

  let pool = [...candidates];
  let stockFilteredEmpty = false;

  if (r === "cheapest_in_stock" || r === "cheapest_in_stock_franchised") {
    const candidateStocks = candidates
      .map((c) => `${c.source}:${c.stock_qty ?? "null"}`)
      .join(", ");
    console.info(
      `[auto-pick/rule]${debugTag ? ` ${debugTag}` : ""} rule=${r} orderQty=${orderQty} candidates=[${candidateStocks}]`
    );
    pool = pool.filter((c) => (c.stock_qty ?? 0) >= orderQty);
    if (pool.length === 0) stockFilteredEmpty = true;
  }
  if (r === "cheapest_in_stock_franchised") {
    pool = pool.filter((c) => c.franchised === true);
  }

  if (pool.length === 0) {
    // Fallback: if the strict filters leave nothing, pick from the full set.
    // For the "in stock" rules, prefer partial-stock suppliers over zero-stock
    // ones — silently picking a 0-stock supplier when at least one supplier
    // has *some* stock surprises the operator (the rule is supposed to bias
    // toward stock). Within the partial-stock pool, rank by stock desc and
    // tiebreak on extended CAD; if every supplier truly stocks zero, fall
    // through to cheapest CAD.
    if (stockFilteredEmpty) {
      const partialStock = candidates.filter((c) => (c.stock_qty ?? 0) > 0);
      if (partialStock.length > 0) {
        partialStock.sort((a, b) => {
          const aS = a.stock_qty ?? 0;
          const bS = b.stock_qty ?? 0;
          if (aS !== bS) return bS - aS;
          return a.extended_cad - b.extended_cad;
        });
        return partialStock[0] ?? null;
      }
    }
    pool = [...candidates];
  }

  if (r === "shortest_lead_time") {
    pool.sort((a, b) => {
      const aL = a.lead_time_days ?? Number.MAX_SAFE_INTEGER;
      const bL = b.lead_time_days ?? Number.MAX_SAFE_INTEGER;
      if (aL !== bL) return aL - bL;
      return a.extended_cad - b.extended_cad; // tiebreak: cheaper extended
    });
    return pool[0] ?? null;
  }

  if (r === "strict_priority") {
    const priority = Array.isArray(cfg.priority) ? cfg.priority : [];
    for (const supplier of priority) {
      const hit = pool.find((c) => c.source === supplier);
      if (hit) return hit;
    }
    // Nothing in the priority list had a quote â†’ fall through to cheapest.
    pool.sort((a, b) => a.extended_cad - b.extended_cad);
    return pool[0] ?? null;
  }

  if (r === "custom") {
    // Current scope: treat custom as a priority list if config.priority exists,
    // otherwise as cheapest_overall. Filters in config.filters are applied
    // as straight equality matches on boolean fields (franchised, ncnr).
    if (cfg.filters) {
      const f = cfg.filters;
      if (typeof f.franchised === "boolean") {
        pool = pool.filter((c) => c.franchised === f.franchised);
      }
      if (typeof f.in_stock === "boolean" && f.in_stock) {
        pool = pool.filter((c) => (c.stock_qty ?? 0) >= orderQty);
      }
      if (pool.length === 0) pool = [...candidates];
    }
    if (Array.isArray(cfg.priority)) {
      for (const supplier of cfg.priority) {
        const hit = pool.find((c) => c.source === supplier);
        if (hit) return hit;
      }
    }
    pool.sort((a, b) => a.extended_cad - b.extended_cad);
    return pool[0] ?? null;
  }

  // Default + "cheapest_overall" + "cheapest_in_stock": cheapest CAD wins.
  pool.sort((a, b) => a.extended_cad - b.extended_cad);
  return pool[0] ?? null;
}

/**
 * Given a sorted price-break array and an order qty, return the unit_price
 * that applies. Mirrors the panel's priceAtTier â€” pick the highest break
 * whose min_qty <= orderQty; fall back to the quote's headline unit_price
 * when the break table is empty.
 */
function pickPriceAtQty(breaks: PriceBreak[], orderQty: number, fallback: number): number {
  if (!Array.isArray(breaks) || breaks.length === 0) return fallback;
  const sorted = [...breaks].sort((a, b) => a.min_qty - b.min_qty);
  let pick = sorted[0];
  for (const b of sorted) {
    if (orderQty >= b.min_qty) pick = b;
  }
  return pick?.unit_price ?? fallback;
}
