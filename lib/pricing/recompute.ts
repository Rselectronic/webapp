import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateQuote } from "@/lib/pricing/engine";
import type {
  OverageTier,
  PricingLine,
  PricingSettings,
  QuotePricing,
  TierInput,
} from "@/lib/pricing/types";

/**
 * Shared recipe for running the pricing engine against a stored BOM.
 *
 * Used by:
 *  - POST /api/quotes              (initial quote creation)
 *  - POST /api/quotes/[id]/recalculate (re-run after manual price entry)
 *
 * Fetches BOM lines, cached prices (including manual overrides), overage tiers,
 * and pricing settings, then runs the engine.
 */
export async function recomputeQuotePricing(
  supabase: SupabaseClient,
  bom_id: string,
  resolvedTiers: TierInput[],
  shipping_flat: number,
  /** Physical board layout — drives single- vs double-sided programming fee.
   *  Sourced from `gmps.board_side`. */
  board_side?: "single" | "double" | null,
  /** Per-quote markup overrides — applied on top of global settings */
  markupOverrides?: { component_markup_pct?: number; pcb_markup_pct?: number }
): Promise<{
  pricing: QuotePricing;
  settings: PricingSettings;
  pricingLines: PricingLine[];
}> {
  // --- Fetch BOM lines (non-PCB, non-DNI only) ---
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, mpn, cpc, description, m_code, quantity")
    .eq("bom_id", bom_id)
    .eq("is_pcb", false)
    .eq("is_dni", false);

  if (bomError) {
    throw new Error(`Failed to fetch BOM lines: ${bomError.message}`);
  }
  if (!bomLines || bomLines.length === 0) {
    throw new Error("No component lines found for this BOM");
  }

  // --- Fetch cached prices (digikey, mouser, lcsc, manual) ---
  // Legacy entries may be stored with raw-case search_key; manual entries are
  // always uppercased. Query both to cover historical rows + new manual ones.
  // Also include CPC values and bom_line IDs as fallback search keys for
  // components that have no MPN.
  const rawMpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))] as string[];
  const rawCpcs = [...new Set(bomLines.map((l) => l.cpc).filter(Boolean))] as string[];
  // For components with no MPN and no CPC, the manual price may be keyed by bom_line_id
  const fallbackIds = bomLines
    .filter((l) => !l.mpn && !l.cpc)
    .map((l) => l.id);
  const allRawKeys = [...rawMpns, ...rawCpcs, ...fallbackIds];
  const upperKeys = allRawKeys.map((k) => k.toUpperCase());
  const searchKeys = [...new Set([...allRawKeys, ...upperKeys])];
  const { data: priceRows } = searchKeys.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("search_key, unit_price, source")
        .in("search_key", searchKeys)
        .gte("expires_at", new Date().toISOString())
        .limit(50000)
    : { data: [] };

  // Pick the winning price per key with source-aware ranking:
  //   customer_quote  → operator imported a real distributor quote; always wins.
  //   manual          → operator typed a price for a part the APIs couldn't find.
  //   anything else   → API-sourced (digikey, mouser, lcsc, ...).
  // Within the same rank, prefer the lowest unit_price. This matters because
  // a user-imported quote should not be silently undercut by a cached API
  // price that may be stale or unfranchised. Key map by UPPERCASE so MPN/CPC
  // lookups are case-insensitive.
  const sourceRank = (source: string): number => {
    if (source === "customer_quote") return 3;
    if (source === "manual") return 2;
    return 1;
  };
  const priceMap = new Map<string, { unit_price: number; source: string }>();
  for (const row of priceRows ?? []) {
    if (row.unit_price === null) continue;
    const key = row.search_key.toUpperCase();
    const incoming = sourceRank(row.source);
    const existing = priceMap.get(key);
    if (
      !existing ||
      incoming > sourceRank(existing.source) ||
      (incoming === sourceRank(existing.source) &&
        row.unit_price < existing.unit_price)
    ) {
      priceMap.set(key, {
        unit_price: row.unit_price,
        source: row.source,
      });
    }
  }

  // --- Build PricingLine array ---
  const pricingLines: PricingLine[] = bomLines.map((line) => {
    // Try MPN first, then CPC, then bom_line_id as cache key
    const cached =
      (line.mpn ? priceMap.get(line.mpn.toUpperCase()) : undefined) ??
      (line.cpc ? priceMap.get(line.cpc.toUpperCase()) : undefined) ??
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
  if (markupOverrides?.component_markup_pct !== undefined) {
    settings.component_markup_pct = markupOverrides.component_markup_pct;
  }
  if (markupOverrides?.pcb_markup_pct !== undefined) {
    settings.pcb_markup_pct = markupOverrides.pcb_markup_pct;
  }

  // --- Calculate pricing ---
  const pricing = calculateQuote({
    lines: pricingLines,
    shipping_flat,
    overages: overageTiers,
    settings,
    tier_inputs: resolvedTiers,
    board_side,
  });

  return { pricing, settings, pricingLines };
}
