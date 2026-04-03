import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import type { PricingLine, OverageTier, PricingSettings } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// GET /api/quotes — List quotes with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }
  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/quotes — Create a new quote from a parsed BOM
// ---------------------------------------------------------------------------

interface CreateQuoteBody {
  bom_id: string;
  gmp_id: string;
  customer_id: string;
  quantities: [number, number, number, number];
  pcb_unit_price: number;
  nre_charge: number;
  shipping_flat: number;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateQuoteBody;
  const {
    bom_id,
    gmp_id,
    customer_id,
    quantities,
    pcb_unit_price,
    nre_charge,
    shipping_flat,
    notes,
  } = body;

  if (
    !bom_id ||
    !gmp_id ||
    !customer_id ||
    !Array.isArray(quantities) ||
    quantities.length !== 4
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: bom_id, gmp_id, customer_id, quantities (array of 4 numbers)",
      },
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

  // --- Calculate pricing ---
  const pricing = calculateQuote({
    lines: pricingLines,
    quantities,
    pcb_unit_price,
    nre_charge,
    shipping_flat,
    overages: overageTiers,
    settings,
  });

  // --- Generate quote number: QT-YYMM-NNN ---
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `QT-${yy}${mm}`;

  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .like("quote_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  const quoteNumber = `${prefix}-${seq}`;

  // --- Insert quote ---
  const { data: quote, error: insertError } = await supabase
    .from("quotes")
    .insert({
      quote_number: quoteNumber,
      customer_id,
      gmp_id,
      bom_id,
      status: "draft",
      quantities: {
        qty_1: quantities[0],
        qty_2: quantities[1],
        qty_3: quantities[2],
        qty_4: quantities[3],
      },
      pricing: { tiers: pricing.tiers, warnings: pricing.warnings },
      component_markup: settings.component_markup_pct ?? 20,
      pcb_cost_per_unit: pcb_unit_price,
      assembly_cost: pricing.tiers[0]?.assembly_cost ?? 0,
      nre_charge,
      labour_rate: settings.labour_rate_per_hour ?? null,
      smt_rate: settings.smt_cost_per_placement ?? null,
      validity_days: settings.quote_validity_days ?? 30,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select("id, quote_number")
    .single();

  if (insertError || !quote) {
    return NextResponse.json(
      { error: "Failed to create quote", details: insertError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      quote_id: quote.id,
      quote_number: quote.quote_number,
      pricing,
    },
    { status: 201 }
  );
}
