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
  assembly_type?: string
): Promise<{
  pricing: QuotePricing;
  settings: PricingSettings;
  pricingLines: PricingLine[];
}> {
  // --- Fetch BOM lines (non-PCB, non-DNI only) ---
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, mpn, description, m_code, quantity")
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
  const rawMpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))] as string[];
  const upperMpns = rawMpns.map((m) => m.toUpperCase());
  const searchKeys = [...new Set([...rawMpns, ...upperMpns])];
  const { data: priceRows } = await supabase
    .from("api_pricing_cache")
    .select("search_key, unit_price, source")
    .in("search_key", searchKeys)
    .gte("expires_at", new Date().toISOString());

  // Prefer the lowest non-null unit_price per MPN, regardless of source.
  // Key the map by UPPERCASE MPN for case-insensitive lookup.
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
  }

  // --- Build PricingLine array ---
  const pricingLines: PricingLine[] = bomLines.map((line) => {
    const cached = line.mpn ? priceMap.get(line.mpn.toUpperCase()) : undefined;
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
    assembly_type,
  });

  return { pricing, settings, pricingLines };
}
