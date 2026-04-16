import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";
import type { PricingLine, OverageTier, PricingSettings, TierInput } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// POST /api/quotes/preview — Calculate pricing with live API lookups
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
  /** @deprecated — legacy flat fields for backward compat */
  quantities?: number[];
  pcb_unit_price?: number;
  nre_charge?: number;
  shipping_flat: number;
  /** Assembly type (TB, TS, etc.) for programming fee lookup */
  assembly_type?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as PreviewBody;
  const { bom_id, tiers: tierInputs, quantities: legacyQuantities, pcb_unit_price: legacyPcbPrice, nre_charge: legacyNreCharge, shipping_flat } =
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
    .select("id, mpn, description, m_code, quantity")
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
  const mpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))] as string[];
  const { data: priceRows } = await supabase
    .from("api_pricing_cache")
    .select("search_key, unit_price, source")
    .in("search_key", mpns)
    .gte("expires_at", new Date().toISOString());

  const priceMap = new Map<string, { unit_price: number; source: string }>();
  for (const row of priceRows ?? []) {
    if (
      row.unit_price !== null &&
      (!priceMap.has(row.search_key) ||
        row.unit_price < priceMap.get(row.search_key)!.unit_price)
    ) {
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
            { onConflict: "source,search_key" }
          );
        }
        if (mouser.status === "fulfilled" && mouser.value) {
          const r = mouser.value;
          hits.push({ source: "mouser", unit_price: r.unit_price, supplier_pn: r.mouser_pn, stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency });
          await supabase.from("api_pricing_cache").upsert(
            { source: "mouser", mpn: r.mpn, search_key: mpn, response: r as unknown as Record<string, unknown>, unit_price: r.unit_price, stock_qty: r.stock_qty, currency: r.currency, expires_at: expiresAt },
            { onConflict: "source,search_key" }
          );
        }
        if (lcsc.status === "fulfilled" && lcsc.value) {
          const r = lcsc.value;
          hits.push({ source: "lcsc", unit_price: r.unit_price, supplier_pn: r.lcsc_pn, stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency });
          await supabase.from("api_pricing_cache").upsert(
            { source: "lcsc", mpn: r.mpn, search_key: mpn, response: r as unknown as Record<string, unknown>, unit_price: r.unit_price, stock_qty: r.stock_qty, currency: r.currency, expires_at: expiresAt },
            { onConflict: "source,search_key" }
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
              .replace(/[,;()±%]/g, " ")
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
                  { onConflict: "source,search_key" }
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
    const cached = line.mpn ? priceMap.get(line.mpn) : undefined;
    return {
      bom_line_id: line.id,
      mpn: line.mpn ?? "",
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

  // --- Calculate pricing ---
  const pricing = calculateQuote({
    lines: pricingLines,
    shipping_flat,
    overages: overageTiers,
    settings,
    tier_inputs: resolvedTiers,
    assembly_type: body.assembly_type,
  });

  return NextResponse.json({
    pricing,
    component_count: pricingLines.length,
    api_calls: apiCalls,
    cache_hits: mpns.length - uncachedMpns.length,
    api_errors: apiErrors,
  });
}
