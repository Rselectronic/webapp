import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRate } from "@/lib/pricing/fx";
import { getOverage } from "@/lib/pricing/overage";
import type { OverageTier, PriceBreak } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// POST /api/quotes/[id]/auto-pick — body: { preference_id }
//
// Applies a pricing preference rule to every BOM line on this quote (except
// those flagged customer-supplied). For each (line, tier) the rule picks the
// winning cached supplier quote, which gets upserted into bom_line_pricing.
//
// Also writes `pinned_preference = preference_id` on the quotes row so the
// UI remembers which rule was last applied.
//
// The rules:
//   cheapest_overall              — lowest CAD price at this tier's order_qty
//   cheapest_in_stock             — same, but filter quotes with enough stock
//   cheapest_in_stock_franchised  — same, plus franchised=true only
//   shortest_lead_time            — fewest lead_time_days (nulls last)
//   strict_priority               — first supplier hit matching priority list
//   custom                        — JSON config.filters + config.priority
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
  stock_qty: number | null;
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

  let body: { preference_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const preferenceId = typeof body.preference_id === "string" ? body.preference_id : "";
  if (!UUID_RE.test(preferenceId)) {
    return NextResponse.json({ error: "preference_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
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

  // --- Cached quotes for every MPN/CPC used in the BOM ---
  const keys = new Set<string>();
  for (const l of bomLines) {
    if (csSet.has(l.id)) continue;
    if (l.mpn) keys.add(l.mpn.toUpperCase());
    if (l.cpc) keys.add(l.cpc.toUpperCase());
  }
  const { data: cachedRows } = keys.size > 0
    ? await supabase
        .from("api_pricing_cache")
        .select(
          "source, search_key, unit_price, currency, stock_qty, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at"
        )
        .in("search_key", [...keys])
        .gte("expires_at", new Date().toISOString())
    : { data: [] };

  // Group cached quotes by (MPN/CPC key, uppercased).
  const quotesByKey = new Map<string, CachedQuote[]>();
  for (const row of (cachedRows ?? []) as CachedQuote[]) {
    const key = row.search_key;
    const arr = quotesByKey.get(key) ?? [];
    arr.push(row);
    quotesByKey.set(key, arr);
  }

  // --- Cache FX rates we'll need so every quote can be compared in CAD. ---
  const fxCache = new Map<string, number>();
  fxCache.set("CAD", 1.0);
  async function fxToCad(currency: string): Promise<number> {
    if (fxCache.has(currency)) return fxCache.get(currency)!;
    const fx = await getRate(currency, "CAD");
    if (!fx) {
      // No rate cached → treat as 1:1 as a last resort but flag via response.
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

  for (const line of bomLines) {
    if (csSet.has(line.id)) continue;
    const searchKeys = [
      line.mpn?.toUpperCase(),
      line.cpc?.toUpperCase(),
    ].filter(Boolean) as string[];
    const candidates: CachedQuote[] = [];
    for (const k of searchKeys) {
      const hit = quotesByKey.get(k);
      if (hit) candidates.push(...hit);
    }
    if (candidates.length === 0) {
      unresolved++;
      unresolvedLines.push(line.id);
      continue;
    }

    // For each tier, compute order_qty and pick a winner.
    for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
      const tier = tiers[tIdx];
      const extras = getOverage(line.m_code, tier, overages);
      const orderQty = line.quantity * tier + extras;

      // Build per-tier candidate list with CAD-normalized prices.
      const perTier: PickCandidate[] = [];
      for (const q of candidates) {
        if (q.unit_price == null) continue;
        const currency = q.currency ?? "USD";
        const breaks = Array.isArray(q.price_breaks) ? (q.price_breaks as PriceBreak[]) : [];
        const nativePrice = pickPriceAtQty(breaks, orderQty, q.unit_price);
        if (nativePrice <= 0) continue;
        const rate = await fxToCad(currency);
        perTier.push({
          source: q.source,
          supplier_part_number: q.supplier_part_number,
          unit_price_native: nativePrice,
          currency,
          unit_price_cad: nativePrice * rate,
          stock_qty: q.stock_qty,
          lead_time_days: q.lead_time_days,
          warehouse_code: q.warehouse_code,
          ncnr: q.ncnr,
          franchised: q.franchised,
        });
      }
      if (perTier.length === 0) continue;

      const winner = applyPreferenceRule(perTier, orderQty, preference.rule, preference.config);
      if (!winner) continue;

      // Upsert the selection — this is exactly what the manual picker writes.
      const rate = fxCache.get(winner.currency) ?? 1;
      await supabase.from("bom_line_pricing").upsert(
        {
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
        },
        { onConflict: "bom_line_id,tier_qty" }
      );
      picks++;
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
  config: unknown
): PickCandidate | null {
  const r = rule as Rule;
  const cfg = (config ?? {}) as { priority?: string[]; filters?: Record<string, unknown> };

  let pool = [...candidates];

  if (r === "cheapest_in_stock" || r === "cheapest_in_stock_franchised") {
    pool = pool.filter((c) => (c.stock_qty ?? 0) >= orderQty);
  }
  if (r === "cheapest_in_stock_franchised") {
    pool = pool.filter((c) => c.franchised === true);
  }

  if (pool.length === 0) {
    // Fallback: if the strict filters leave nothing, pick from the full set
    // by the same cheapest-CAD rule. Better to have *some* price than none.
    pool = [...candidates];
  }

  if (r === "shortest_lead_time") {
    pool.sort((a, b) => {
      const aL = a.lead_time_days ?? Number.MAX_SAFE_INTEGER;
      const bL = b.lead_time_days ?? Number.MAX_SAFE_INTEGER;
      if (aL !== bL) return aL - bL;
      return a.unit_price_cad - b.unit_price_cad; // tiebreak: cheaper
    });
    return pool[0] ?? null;
  }

  if (r === "strict_priority") {
    const priority = Array.isArray(cfg.priority) ? cfg.priority : [];
    for (const supplier of priority) {
      const hit = pool.find((c) => c.source === supplier);
      if (hit) return hit;
    }
    // Nothing in the priority list had a quote → fall through to cheapest.
    pool.sort((a, b) => a.unit_price_cad - b.unit_price_cad);
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
    pool.sort((a, b) => a.unit_price_cad - b.unit_price_cad);
    return pool[0] ?? null;
  }

  // Default + "cheapest_overall" + "cheapest_in_stock": cheapest CAD wins.
  pool.sort((a, b) => a.unit_price_cad - b.unit_price_cad);
  return pool[0] ?? null;
}

/**
 * Given a sorted price-break array and an order qty, return the unit_price
 * that applies. Mirrors the panel's priceAtTier — pick the highest break
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
