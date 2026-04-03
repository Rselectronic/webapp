import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import type { PricingLine, OverageTier, PricingSettings } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// POST /api/quotes/preview — Calculate pricing without saving
// ---------------------------------------------------------------------------

interface PreviewBody {
  bom_id: string;
  quantities: [number, number, number, number];
  pcb_unit_price: number;
  nre_charge: number;
  shipping_flat: number;
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
  const { bom_id, quantities, pcb_unit_price, nre_charge, shipping_flat } =
    body;

  if (
    !bom_id ||
    !Array.isArray(quantities) ||
    quantities.length !== 4
  ) {
    return NextResponse.json(
      { error: "Missing required fields: bom_id, quantities (array of 4 numbers)" },
      { status: 400 }
    );
  }

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

  // --- Fetch cached prices ---
  const mpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))];
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

  // --- Build PricingLine array ---
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

  // --- Calculate pricing (no save) ---
  const pricing = calculateQuote({
    lines: pricingLines,
    quantities,
    pcb_unit_price,
    nre_charge,
    shipping_flat,
    overages: overageTiers,
    settings,
  });

  return NextResponse.json({
    pricing,
    component_count: pricingLines.length,
  });
}
