import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import type { PricingLine, PricingSettings, TierInput, OverageTier } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// POST /api/quotes/[id]/calculate — Step 3 of the quote wizard.
//
// Body:
//   {
//     boards_per_panel: number,
//     ipc_class: 1 | 2 | 3,
//     solder_type: "leaded" | "leadfree",
//     assembly_type: "TB" | "TS" | ...,
//     tier_pcb_prices: { [tier_qty: string]: number },
//     nre_programming: number, nre_stencil: number, nre_setup: number,
//     nre_pcb_fab: number, nre_misc: number,
//     shipping_flat: number
//   }
//
// Flow:
//   1. Persist all step-3 inputs to the quote row (board cols + tier_pcb_prices
//      into quantities JSONB).
//   2. Build PricingLine[] from bom_lines, excluding customer-supplied + PCB
//      rows. procurement_mode=consign_parts_supplied / assembly_only skips
//      components entirely.
//   3. Build pricing_overrides from bom_line_pricing (per-tier CAD prices).
//   4. Build TierInput[] — zero-out PCB price when procurement_mode skips it.
//   5. Run calculateQuote, save result to quote.pricing, flip wizard_status
//      to 'complete' and status to 'review'.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CalcBody {
  boards_per_panel?: number;
  ipc_class?: 1 | 2 | 3;
  solder_type?: "leaded" | "leadfree";
  assembly_type?: string;
  tier_pcb_prices?: Record<string, number>;
  nre_programming?: number;
  nre_stencil?: number;
  nre_setup?: number;
  nre_pcb_fab?: number;
  nre_misc?: number;
  shipping_flat?: number;
}

/** Procurement modes where RS doesn't procure components at all. */
const SKIP_COMPONENTS: Set<string> = new Set(["consign_parts_supplied", "assembly_only"]);
/** Procurement modes where RS doesn't charge for PCB fab. */
const SKIP_PCB: Set<string> = new Set(["consign_pcb_supplied", "assembly_only"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  if (!UUID_RE.test(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  let body: CalcBody;
  try {
    body = (await req.json()) as CalcBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  // --- Load quote with tiers + procurement_mode ---
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, bom_id, quantities, procurement_mode, assembly_type, boards_per_panel, ipc_class, solder_type")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const tiers = Array.isArray((quote.quantities as { tiers?: unknown })?.tiers)
    ? (quote.quantities as { tiers: number[] }).tiers
    : [];
  if (tiers.length === 0) {
    return NextResponse.json(
      { error: "Quote has no tier quantities yet. Complete step 1 first." },
      { status: 400 }
    );
  }

  const mode = quote.procurement_mode ?? "turnkey";
  const skipComponents = SKIP_COMPONENTS.has(mode);
  const skipPcb = SKIP_PCB.has(mode);

  // --- Load BOM lines + customer-supplied + selections + overages + settings ---
  const [
    { data: bomLines },
    { data: customerSupplied },
    { data: overageRows },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from("bom_lines")
      .select("id, mpn, description, cpc, m_code, quantity")
      .eq("bom_id", quote.bom_id)
      .eq("is_pcb", false)
      .eq("is_dni", false)
      .gt("quantity", 0),
    supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .eq("quote_id", quoteId),
    supabase
      .from("overage_table")
      .select("m_code, qty_threshold, extras"),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "pricing")
      .single(),
  ]);

  if (!bomLines) {
    return NextResponse.json({ error: "Failed to load BOM lines" }, { status: 500 });
  }

  const settings = (settingsRow?.value ?? {}) as PricingSettings;
  const overages: OverageTier[] = (overageRows ?? []).map((o) => ({
    m_code: o.m_code,
    qty_threshold: o.qty_threshold,
    extras: o.extras,
  }));
  const csSet = new Set((customerSupplied ?? []).map((r) => r.bom_line_id));

  // Pinned selections — per-tier CAD prices from bom_line_pricing. We build
  // TWO things from these:
  //   - pricing_overrides: the per-(line, tier) CAD price the engine uses
  //   - a "headline" unit_price on each PricingLine, so lines with at least
  //     one selection aren't counted as "missing price".
  const bomLineIds = bomLines.map((l) => l.id);
  const { data: selectionRows } = bomLineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, selected_unit_price_cad")
        .in("bom_line_id", bomLineIds)
    : { data: [] };

  const pricingOverrides = new Map<string, Map<number, number>>();
  const firstPriceByLine = new Map<string, number>();
  for (const row of selectionRows ?? []) {
    if (row.selected_unit_price_cad == null) continue;
    const price = Number(row.selected_unit_price_cad);
    if (!Number.isFinite(price)) continue;
    const inner = pricingOverrides.get(row.bom_line_id) ?? new Map<number, number>();
    inner.set(row.tier_qty, price);
    pricingOverrides.set(row.bom_line_id, inner);
    if (!firstPriceByLine.has(row.bom_line_id)) {
      firstPriceByLine.set(row.bom_line_id, price);
    }
  }

  // --- Build PricingLine array ---
  //   - Customer-supplied lines are excluded outright.
  //   - Modes without component procurement (consign_parts_supplied /
  //     assembly_only) exclude ALL non-PCB lines from pricing.
  const pricingLines: PricingLine[] = [];
  if (!skipComponents) {
    for (const line of bomLines) {
      if (csSet.has(line.id)) continue;
      pricingLines.push({
        bom_line_id: line.id,
        mpn: line.mpn ?? "",
        description: line.description ?? "",
        m_code: (line.m_code as PricingLine["m_code"]) ?? null,
        qty_per_board: line.quantity,
        unit_price: firstPriceByLine.get(line.id) ?? null,
        price_source: firstPriceByLine.has(line.id) ? "manual" : null,
      });
    }
  }

  // --- Build TierInput[] with per-tier PCB prices (or 0 when mode skips PCB) ---
  const tierPcbPrices = body.tier_pcb_prices ?? {};
  const nreProgramming = toNum(body.nre_programming, 0);
  const nreStencil = toNum(body.nre_stencil, 0);
  const nreSetup = toNum(body.nre_setup, 0);
  const nrePcbFab = toNum(body.nre_pcb_fab, 0);
  const nreMisc = toNum(body.nre_misc, 0);

  const tierInputs: TierInput[] = tiers.map((qty) => {
    const pcb = skipPcb ? 0 : toNum(tierPcbPrices[String(qty)], 0);
    return {
      qty,
      pcb_unit_price: pcb,
      nre_programming: nreProgramming,
      nre_stencil: nreStencil,
      nre_pcb_fab: nrePcbFab,
    };
  });

  // Override settings with step-3 NRE extras (setup + misc) so the engine
  // folds them into the total without us having to write them back.
  const mergedSettings: PricingSettings = {
    ...settings,
    nre_setup: nreSetup,
    nre_misc: nreMisc,
  };

  // --- Run the engine ---
  const shippingFlat = toNum(body.shipping_flat, settings.default_shipping ?? 0);
  const pricing = calculateQuote({
    lines: pricingLines,
    shipping_flat: shippingFlat,
    overages,
    settings: mergedSettings,
    tier_inputs: tierInputs,
    assembly_type: body.assembly_type ?? quote.assembly_type ?? undefined,
    pricing_overrides: pricingOverrides,
  });

  // --- Persist step-3 inputs + pricing result ---
  const nextQuantities: Record<string, unknown> = {
    ...((quote.quantities as Record<string, unknown>) ?? {}),
    tiers,
    tier_pcb_prices: tierPcbPrices,
    nre: {
      programming: nreProgramming,
      stencil: nreStencil,
      setup: nreSetup,
      pcb_fab: nrePcbFab,
      misc: nreMisc,
    },
    shipping_flat: shippingFlat,
  };

  const updatePayload: Record<string, unknown> = {
    quantities: nextQuantities,
    pricing: pricing as unknown as Record<string, unknown>,
    wizard_status: "complete",
    // Wizard quotes flow from draft → review on first Calculate, so Anas
    // can see them on the quotes list alongside classic quotes.
    status: "review",
  };
  if (typeof body.boards_per_panel === "number" && Number.isInteger(body.boards_per_panel) && body.boards_per_panel > 0) {
    updatePayload.boards_per_panel = body.boards_per_panel;
  }
  if (body.ipc_class && [1, 2, 3].includes(body.ipc_class)) {
    updatePayload.ipc_class = body.ipc_class;
  }
  if (body.solder_type === "leaded" || body.solder_type === "leadfree") {
    updatePayload.solder_type = body.solder_type;
  }
  if (body.assembly_type) {
    updatePayload.assembly_type = body.assembly_type;
  }

  const { error: updateErr } = await supabase
    .from("quotes")
    .update(updatePayload)
    .eq("id", quoteId);
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to save quote", details: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pricing,
    component_lines_counted: pricingLines.length,
    customer_supplied_count: csSet.size,
    skipped_components: skipComponents,
    skipped_pcb: skipPcb,
  });
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
