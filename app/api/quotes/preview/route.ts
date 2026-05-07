import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";
import type { PricingLine, OverageTier, PricingSettings, TierInput } from "@/lib/pricing/types";
// ---------------------------------------------------------------------------
// POST /api/quotes/preview â€” Calculate pricing with live API lookups
// ---------------------------------------------------------------------------

interface PreviewTierInput {
  qty: number;
  pcb_unit_price: number;
  nre_programming: number;
  nre_stencil: number;
  nre_pcb_fab: number;
}

interface PreviewBody {
  bom_id: string;
  /** New per-tier inputs */
  tiers?: PreviewTierInput[];
  /** @deprecated â€” legacy flat fields for backward compat */
  quantities?: number[];
  pcb_unit_price?: number;
  nre_charge?: number;
  shipping_flat: number;
  /** Physical board layout â€” drives single- vs double-sided programming fee.
   *  Sourced from `gmps.board_side`. */
  board_side?: "single" | "double" | null;
  /** Per-quote markup overrides (optional â€” fall back to global settings) */
  component_markup_pct?: number;
  pcb_markup_pct?: number;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only: preview hits the supplier APIs and writes into
  // api_pricing_cache (admin-only RLS). A production caller would either
  // 403 from RLS or get a partially-populated preview â€” gate up-front.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await req.json()) as PreviewBody;
  const { bom_id, tiers: tierInputs, quantities: legacyQuantities, pcb_unit_price: legacyPcbPrice, shipping_flat } =
    body;

  // Support both new per-tier format and legacy flat format
  const hasTiers = Array.isArray(tierInputs) && tierInputs.length > 0;
  const hasLegacy = Array.isArray(legacyQuantities) && legacyQuantities.length > 0;

  if (!bom_id || (!hasTiers && !hasLegacy)) {
    return NextResponse.json(
      { error: "Missing required fields: bom_id, tiers (array) or quantities (array)" },
      { status: 400 }
    );
  }

  // Resolve to the unified TierInput format
  const resolvedTiers: TierInput[] = hasTiers
    ? tierInputs!.map((t) => ({
        qty: t.qty,
        pcb_unit_price: t.pcb_unit_price ?? 0,
        nre_programming: t.nre_programming ?? 0,
        nre_stencil: t.nre_stencil ?? 0,
        nre_pcb_fab: t.nre_pcb_fab ?? 0,
      }))
    : legacyQuantities!.map((qty) => ({
        qty,
        pcb_unit_price: legacyPcbPrice ?? 0,
        nre_programming: 0,
        nre_stencil: 0,
        nre_pcb_fab: 0,
      }));

  // --- Fetch BOM lines (non-PCB only) ---
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, mpn, cpc, description, m_code, quantity")
    .eq("bom_id", bom_id)
    .eq("is_pcb", false)
    .eq("is_dni", false);

  if (bomError) {
    return NextResponse.json(
      { error: "Failed to fetch BOM lines", details: bomError.message },
      { status: 500 }
    );
  }

  if (!bomLines || bomLines.length === 0) {
    return NextResponse.json(
      { error: "No component lines found for this BOM" },
      { status: 400 }
    );
  }

  // --- Step 1: Check cached prices ---
  // Include CPC and bom_line_id as fallback search keys for MPN-less components
  const mpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))] as string[];
  const cpcs = [...new Set(bomLines.map((l) => l.cpc).filter(Boolean))] as string[];
  const fallbackIds = bomLines.filter((l) => !l.mpn && !l.cpc).map((l) => l.id);
  const allSearchKeys = [...new Set([...mpns, ...cpcs, ...fallbackIds, ...mpns.map((m) => m.toUpperCase()), ...cpcs.map((c) => c.toUpperCase()), ...fallbackIds.map((id) => id.toUpperCase())])];
  const { data: priceRows } = allSearchKeys.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("search_key, unit_price, source")
        .in("search_key", allSearchKeys)
        .gte("expires_at", new Date().toISOString())
    : { data: [] };

  const priceMap = new Map<string, { unit_price: number; source: string }>();
  for (const row of priceRows ?? []) {
    if (row.unit_price === null) continue;
    const key = row.search_key.toUpperCase();
    if (!priceMap.has(key) || row.unit_price < priceMap.get(key)!.unit_price) {
      priceMap.set(key, {
        unit_price: row.unit_price,
        source: row.source,
      });
    }
    // Also keep original-case key for backward compat with uncachedMpns check below
    if (!priceMap.has(row.search_key) || row.unit_price < priceMap.get(row.search_key)!.unit_price) {
      priceMap.set(row.search_key, {
        unit_price: row.unit_price,
        source: row.source,
      });
    }
  }

  // --- Step 2: Fetch prices from DigiKey/Mouser/LCSC for uncached MPNs ---
  const uncachedMpns = mpns.filter((mpn) => !priceMap.has(mpn));
  let apiCalls = 0;
  let apiErrors = 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Process in batches of 5 to avoid overwhelming APIs
  for (let i = 0; i < uncachedMpns.length; i += 5) {
    const batch = uncachedMpns.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (mpn) => {
        const [digikey, mouser, lcsc] = await Promise.allSettled([
          searchPartPrice(mpn),
          searchMouserPrice(mpn),
          searchLCSCPrice(mpn),
        ]);
        apiCalls++;

        interface Hit { source: string; unit_price: number; supplier_pn: string; stock_qty: number | null; mpn: string; currency: string; }
        const hits: Hit[] = [];

        if (digikey.status === "fulfilled" && digikey.value) {
          const r = digikey.value;
          hits.push({ source: "digikey", unit_price: r.unit_price, supplier_pn: r.digikey_pn, stock_qty: null, mpn: r.mpn, currency: r.currency });
          await supabase.from("api_pricing_cache").upsert(
            { source: "digikey", mpn: r.mpn, search_key: mpn, response: r as unknown as Record<string, unknown>, unit_price: r.unit_price, stock_qty: null, currency: r.currency, expires_at: expiresAt },
            { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
          );
        }
        if (mouser.status === "fulfilled" && mouser.value) {
          const r = mouser.value;
          hits.push({ source: "mouser", unit_price: r.unit_price, supplier_pn: r.mouser_pn, stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency });
          await supabase.from("api_pricing_cache").upsert(
            { source: "mouser", mpn: r.mpn, search_key: mpn, response: r as unknown as Record<string, unknown>, unit_price: r.unit_price, stock_qty: r.stock_qty, currency: r.currency, expires_at: expiresAt },
            { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
          );
        }
        if (lcsc.status === "fulfilled" && lcsc.value) {
          const r = lcsc.value;
          hits.push({ source: "lcsc", unit_price: r.unit_price, supplier_pn: r.lcsc_pn, stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency });
          await supabase.from("api_pricing_cache").upsert(
            { source: "lcsc", mpn: r.mpn, search_key: mpn, response: r as unknown as Record<string, unknown>, unit_price: r.unit_price, stock_qty: r.stock_qty, currency: r.currency, expires_at: expiresAt },
            { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
          );
        }

        if (hits.length > 0) {
          const best = hits.reduce((a, b) => a.unit_price <= b.unit_price ? a : b);
          priceMap.set(mpn, { unit_price: best.unit_price, source: best.source });
        } else {
          // Fallback: search by description keywords when MPN returns no results
          const bomLine = bomLines.find((l) => l.mpn === mpn);
          const desc = bomLine?.description ?? "";
          if (desc.length > 5) {
            // Extract key terms: package size + value + type (e.g. "0603 10K resistor")
            const descKeywords = desc
              .replace(/[,;()Â±%]/g, " ")
              .split(/\s+/)
              .filter((w: string) => w.length > 1)
              .slice(0, 5)
              .join(" ");

            if (descKeywords) {
              const [dkDesc, mouserDesc] = await Promise.allSettled([
                searchPartPrice(descKeywords),
                searchMouserPrice(descKeywords),
              ]);

              const descHits: Hit[] = [];
              if (dkDesc.status === "fulfilled" && dkDesc.value) {
                descHits.push({ source: "digikey", unit_price: dkDesc.value.unit_price, supplier_pn: dkDesc.value.digikey_pn, stock_qty: null, mpn: dkDesc.value.mpn, currency: dkDesc.value.currency });
              }
              if (mouserDesc.status === "fulfilled" && mouserDesc.value) {
                descHits.push({ source: "mouser", unit_price: mouserDesc.value.unit_price, supplier_pn: mouserDesc.value.mouser_pn, stock_qty: mouserDesc.value.stock_qty, mpn: mouserDesc.value.mpn, currency: mouserDesc.value.currency });
              }

              if (descHits.length > 0) {
                const best = descHits.reduce((a, b) => a.unit_price <= b.unit_price ? a : b);
                priceMap.set(mpn, { unit_price: best.unit_price, source: best.source });
                // Cache with original MPN as search key
                await supabase.from("api_pricing_cache").upsert(
                  { source: best.source, mpn: best.mpn, search_key: mpn.toUpperCase(), response: { description_fallback: true, search_terms: descKeywords } as unknown as Record<string, unknown>, unit_price: best.unit_price, stock_qty: null, currency: "CAD", expires_at: expiresAt },
                  { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                );
              }
            }
          }
        }
      })
    );

    for (const r of results) {
      if (r.status === "rejected") apiErrors++;
    }
  }

  // --- Step 3: Build PricingLine array ---
  const pricingLines: PricingLine[] = bomLines.map((line) => {
    // Try MPN first, then CPC, then bom_line_id as cache key
    const cached =
      (line.mpn ? priceMap.get(line.mpn.toUpperCase()) ?? priceMap.get(line.mpn) : undefined) ??
      (line.cpc ? priceMap.get(line.cpc.toUpperCase()) ?? priceMap.get(line.cpc) : undefined) ??
      priceMap.get(line.id.toUpperCase());
    return {
      bom_line_id: line.id,
      mpn: line.mpn ?? "",
      cpc: line.cpc ?? null,
      description: line.description ?? "",
      m_code: (line.m_code as PricingLine["m_code"]) ?? null,
      qty_per_board: line.quantity,
      unit_price: cached?.unit_price ?? null,
      price_source: (cached?.source as PricingLine["price_source"]) ?? null,
    };
  });

  // --- Fetch overage tiers ---
  const { data: overages } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");
  const overageTiers: OverageTier[] = (overages ?? []).map((o) => ({
    m_code: o.m_code,
    qty_threshold: o.qty_threshold,
    extras: o.extras,
  }));

  // --- Fetch pricing settings ---
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "pricing")
    .single();

  const settings = (settingsRow?.value ?? {}) as PricingSettings;

  // Apply per-quote markup overrides if provided
  if (body.component_markup_pct !== undefined && !isNaN(body.component_markup_pct)) {
    settings.component_markup_pct = body.component_markup_pct;
  }
  if (body.pcb_markup_pct !== undefined && !isNaN(body.pcb_markup_pct)) {
    settings.pcb_markup_pct = body.pcb_markup_pct;
  }

  // --- Load per-tier pricing selections from the Component Pricing Review page ---
  // Map shape: bom_line_id â†’ (tier_qty â†’ unit_price_cad). Empty when the user
  // hasn't picked any suppliers yet â€” engine then falls back to cache prices.
  const bomLineIds = bomLines.map((l) => l.id);
  const { data: selectionRows } = bomLineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, selected_unit_price_cad")
        .in("bom_line_id", bomLineIds)
    : { data: [] };

  const pricingOverrides = new Map<string, Map<number, number>>();
  for (const row of selectionRows ?? []) {
    if (row.selected_unit_price_cad == null) continue;
    const inner = pricingOverrides.get(row.bom_line_id) ?? new Map<number, number>();
    inner.set(row.tier_qty, Number(row.selected_unit_price_cad));
    pricingOverrides.set(row.bom_line_id, inner);
  }

  // --- Calculate pricing ---
  const pricing = calculateQuote({
    lines: pricingLines,
    shipping_flat,
    overages: overageTiers,
    settings,
    tier_inputs: resolvedTiers,
    board_side: body.board_side ?? null,
    pricing_overrides: pricingOverrides,
  });

  return NextResponse.json({
    pricing,
    component_count: pricingLines.length,
    api_calls: apiCalls,
    cache_hits: mpns.length - uncachedMpns.length,
    api_errors: apiErrors,
  });
}
