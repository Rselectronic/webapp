import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import { applyLabourOverlay, type LabourSettingsRow } from "@/lib/pricing/labour-overlay";
import type { PricingLine, PricingSettings, TierInput, OverageTier } from "@/lib/pricing/types";
// ---------------------------------------------------------------------------
// POST /api/quotes/[id]/calculate â€” Step 3 of the quote wizard.
//
// Body:
//   {
//     boards_per_panel: number,
//     ipc_class: 1 | 2 | 3,
//     solder_type: "leaded" | "leadfree",
//     board_side: "single" | "double",  // physical layout (writes into gmps.board_side)
//     tier_pcb_prices: { [tier_qty: string]: number },
//     nre_programming: number, nre_stencil: number, nre_pcb_fab: number,
//     shipping_flat: number
//   }
//
// Flow:
//   1. Persist all step-3 inputs to the quote row (board cols + tier_pcb_prices
//      into quantities JSONB).
//   2. Build PricingLine[] from bom_lines, excluding customer-supplied + PCB
//      rows. procurement_mode=assembly_only skips components entirely.
//   3. Build pricing_overrides from bom_line_pricing (per-tier CAD prices).
//   4. Build TierInput[] â€” zero-out PCB price when procurement_mode skips it.
//   5. Run calculateQuote, save result to quote.pricing, flip wizard_status
//      to 'complete' and status to 'review'.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CalcBody {
  boards_per_panel?: number;
  ipc_class?: 1 | 2 | 3;
  solder_type?: "leaded" | "leadfree";
  /** Physical board layout. Mirrored onto gmps.board_side and threaded
   *  through the pricing engine for the programming-fee lookup. */
  board_side?: "single" | "double";
  tier_pcb_prices?: Record<string, number>;
  pcb_input_mode?: "unit" | "extended";
  nre_programming?: number;
  nre_stencil?: number;
  nre_pcb_fab?: number;
  shipping_flat?: number;
}

/** Procurement modes where RS doesn't procure components at all.
 *  Consignment is ambiguous (operator zeroes out per-line), so only
 *  assembly_only is unconditionally component-less here. */
const SKIP_COMPONENTS: Set<string> = new Set(["assembly_only"]);
/** Procurement modes where RS doesn't charge for PCB fab. */
const SKIP_PCB: Set<string> = new Set(["assembly_only"]);

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
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // --- Load quote with tiers + procurement_mode ---
  // gmps.board_side is the canonical source of physical-layout (single vs
  // double-sided SMT). It joins via boms.gmp_id since quotes.gmp_id and the
  // bom's gmp_id always agree by construction (the wizard creates them
  // together) and we need the BOM row anyway for the customer-supplied join.
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, bom_id, gmp_id, quantities, procurement_mode, boards_per_panel, ipc_class, solder_type, component_markup_pct_override, pcb_markup_pct_override, assembly_markup_pct_override, gmps(board_side)"
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const gmpJoin = quote.gmps as unknown as { board_side?: string | null } | null;
  const quoteBoardSide: "single" | "double" | null =
    gmpJoin?.board_side === "single" || gmpJoin?.board_side === "double"
      ? gmpJoin.board_side
      : null;

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
    { data: labourRow },
  ] = await Promise.all([
    supabase
      .from("bom_lines")
      .select("id, mpn, description, cpc, m_code, quantity, pin_count")
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
    supabase
      .from("labour_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!bomLines) {
    return NextResponse.json({ error: "Failed to load BOM lines" }, { status: 500 });
  }

  const baseSettings = (settingsRow?.value ?? {}) as PricingSettings;
  // Active labour_settings row overlays the pricing defaults. When a row
  // exists, burdened_rate_per_hour + cycle_*_seconds drive the assembly
  // model instead of the legacy flat rates.
  let settings = applyLabourOverlay(
    baseSettings,
    (labourRow ?? null) as LabourSettingsRow | null
  );

  // Legacy quote-level markup overrides. The UI now writes per-tier overrides
  // into quantities.tier_markup_overrides; these columns are kept as a
  // fallback so quotes saved before the per-tier migration still apply.
  // When set, they shift the engine's settings — per-tier overrides further
  // up the chain still win for tiers that have them.
  const compOver =
    quote.component_markup_pct_override !== null && quote.component_markup_pct_override !== undefined
      ? Number(quote.component_markup_pct_override)
      : null;
  const pcbOver =
    quote.pcb_markup_pct_override !== null && quote.pcb_markup_pct_override !== undefined
      ? Number(quote.pcb_markup_pct_override)
      : null;
  const assemblyOver =
    quote.assembly_markup_pct_override !== null && quote.assembly_markup_pct_override !== undefined
      ? Number(quote.assembly_markup_pct_override)
      : null;
  if (compOver !== null && Number.isFinite(compOver)) {
    settings = { ...settings, component_markup_pct: compOver };
  }
  if (pcbOver !== null && Number.isFinite(pcbOver)) {
    settings = { ...settings, pcb_markup_pct: pcbOver };
  }
  if (assemblyOver !== null && Number.isFinite(assemblyOver)) {
    settings = { ...settings, assembly_markup_pct: assemblyOver };
  }

  // Per-tier markup overrides — stored in quote.quantities.tier_markup_overrides
  // as { [tier_qty]: { component?, pcb?, assembly? } }. When present for a
  // tier, beats the legacy column and the global setting for that markup type.
  const rawTierMarkupOverrides =
    ((quote.quantities as Record<string, unknown> | null) ?? {})
      .tier_markup_overrides;
  const tierMarkupOverrides = new Map<
    number,
    {
      component_markup_pct?: number;
      pcb_markup_pct?: number;
      assembly_markup_pct?: number;
    }
  >();
  if (rawTierMarkupOverrides && typeof rawTierMarkupOverrides === "object") {
    for (const [k, v] of Object.entries(
      rawTierMarkupOverrides as Record<string, unknown>
    )) {
      const qty = Number(k);
      if (!Number.isFinite(qty)) continue;
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const pick = (key: string): number | undefined => {
        const n = Number(o[key]);
        return Number.isFinite(n) ? n : undefined;
      };
      tierMarkupOverrides.set(qty, {
        component_markup_pct: pick("component_markup_pct"),
        pcb_markup_pct: pick("pcb_markup_pct"),
        assembly_markup_pct: pick("assembly_markup_pct"),
      });
    }
  }
  const overages: OverageTier[] = (overageRows ?? []).map((o) => ({
    m_code: o.m_code,
    qty_threshold: o.qty_threshold,
    extras: o.extras,
  }));
  const csSet = new Set((customerSupplied ?? []).map((r) => r.bom_line_id));

  // Pinned selections â€” per-tier CAD prices from bom_line_pricing. We build
  // TWO things from these:
  //   - pricing_overrides: the per-(line, tier) CAD price the engine uses
  //   - a "headline" unit_price on each PricingLine, so lines with at least
  //     one selection aren't counted as "missing price".
  const bomLineIds = bomLines.map((l) => l.id);
  const { data: selectionRows } = bomLineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, selected_unit_price_cad, supplier, supplier_part_number, fx_rate")
        .in("bom_line_id", bomLineIds)
    : { data: [] };

  // Auto-heal corrupt pins. A legit unit price for a BOM line is bounded
  // below by the cheapest price any supplier currently has cached for that
  // line's MPN â€” anything 100Ã— higher than that floor is clearly an extended
  // price mistakenly stored as a unit price. Use the CROSS-SUPPLIER minimum
  // (not the pin's own supplier_part_number) so that a poisoned cache row
  // from the same bad write can't inflate the floor and let itself pass.
  const bomLineMpnByLineId = new Map<string, string>();
  const mpnUpperByLineId = new Map<string, string>();
  const mpnUpperSet = new Set<string>();
  for (const l of bomLines) {
    const mpn = (l.mpn ?? l.cpc ?? "").trim();
    if (!mpn) continue;
    bomLineMpnByLineId.set(l.id, mpn);
    const upper = mpn.toUpperCase();
    mpnUpperByLineId.set(l.id, upper);
    mpnUpperSet.add(upper);
  }

  // Pull every cached quote whose search_key matches any line's MPN (both
  // bare and warehouse-suffixed rows, e.g. "X#US-CA" for Arrow).
  const minCachedPriceCadByMpn = new Map<string, number>();
  if (mpnUpperSet.size > 0) {
    const mpnArr = [...mpnUpperSet];
    const CHUNK = 100;
    for (let i = 0; i < mpnArr.length; i += CHUNK) {
      const chunk = mpnArr.slice(i, i + CHUNK);
      const orParts: string[] = [];
      for (const m of chunk) {
        // See note in /pricing-review/fetch: quote values with commas/parens
        // instead of stripping so MPNs like "PMEG3020EJ,115" hit their cache.
        const needsQuote = /[,()" ]/.test(m);
        const pq = (v: string) =>
          needsQuote ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
        orParts.push(`search_key.eq.${pq(m)}`);
        orParts.push(`search_key.like.${pq(`${m}#%`)}`);
      }
      const { data: cacheRows } = await supabase
        .from("api_pricing_cache")
        .select("source, search_key, price_breaks, unit_price, currency")
        .or(orParts.join(","));
      for (const c of cacheRows ?? []) {
        const key = (c.search_key ?? "").toUpperCase();
        // Normalize to the bare MPN key by stripping #warehouse suffix.
        const bare = key.split("#")[0];
        if (!bare) continue;
        const breaks = (c.price_breaks as { unit_price?: number }[] | null) ?? [];
        const candidates = [
          ...breaks.map((b) => b?.unit_price).filter((p): p is number => Number.isFinite(p ?? NaN) && (p ?? 0) > 0),
          ...(Number.isFinite(c.unit_price ?? NaN) && (c.unit_price ?? 0) > 0 ? [c.unit_price as number] : []),
        ];
        if (candidates.length === 0) continue;
        // Rough nativeâ†’CAD: we don't store fx_rate in api_pricing_cache rows
        // themselves, so approximate by assuming CAD when currency is 'CAD',
        // else 2Ã— (loose enough for any common FX; we only use this for the
        // 100Ã— sanity threshold).
        const approxCadFloor = (c.currency === "CAD" ? 1 : 2) * Math.min(...candidates);
        const existing = minCachedPriceCadByMpn.get(bare);
        if (existing == null || approxCadFloor < existing) {
          minCachedPriceCadByMpn.set(bare, approxCadFloor);
        }
      }
    }
  }

  const pricingOverrides = new Map<string, Map<number, number>>();
  const firstPriceByLine = new Map<string, number>();
  const corruptPinIds: Array<{ bom_line_id: string; tier_qty: number; reason: string }> = [];

  console.info(
    `[calculate] quote=${quoteId} pins=${(selectionRows ?? []).length} bom_lines=${bomLines.length} ` +
    `mpn_cache_floors=${minCachedPriceCadByMpn.size}`
  );

  for (const row of selectionRows ?? []) {
    if (row.selected_unit_price_cad == null) continue;
    const price = Number(row.selected_unit_price_cad);
    if (!Number.isFinite(price)) continue;

    const mpn = bomLineMpnByLineId.get(row.bom_line_id) ?? "?";
    const mpnKey = mpnUpperByLineId.get(row.bom_line_id);
    const floor = mpnKey ? minCachedPriceCadByMpn.get(mpnKey) : undefined;

    // Rule 1: cache-driven floor check â€” price > 100Ã— cheapest break across
    // any supplier's current cached quote for this MPN.
    if (floor != null && floor > 0 && price > floor * 100) {
      corruptPinIds.push({
        bom_line_id: row.bom_line_id,
        tier_qty: row.tier_qty,
        reason: `price ${price} > 100Ã— cross-supplier-floor ${floor}`,
      });
      console.warn(
        `[calculate] DROP pin line=${row.bom_line_id} tier=${row.tier_qty} ` +
        `price=${price} mpn=${mpn} reason=cache-floor floor=${floor}`
      );
      continue;
    }

    // Rule 2: absolute ceiling fallback â€” when no cache row exists for the
    // MPN (floor undefined), anything above $50 per unit is suspicious for
    // a passive/chip component. Most ICs < $20; anything higher on a row
    // like "SMT 0603 10k 1% TF Resistor" is almost certainly wrong. Log it
    // and drop. This catches corruption on MPNs whose cache entries have
    // also been evicted or were never fetched.
    if (floor == null && price > 50) {
      corruptPinIds.push({
        bom_line_id: row.bom_line_id,
        tier_qty: row.tier_qty,
        reason: `price ${price} > $50 absolute ceiling (no cache floor available)`,
      });
      console.warn(
        `[calculate] DROP pin line=${row.bom_line_id} tier=${row.tier_qty} ` +
        `price=${price} mpn=${mpn} reason=absolute-ceiling-no-cache`
      );
      continue;
    }

    console.info(
      `[calculate] KEEP pin line=${row.bom_line_id} tier=${row.tier_qty} ` +
      `price=${price} mpn=${mpn} floor=${floor ?? "none"}`
    );

    const inner = pricingOverrides.get(row.bom_line_id) ?? new Map<number, number>();
    inner.set(row.tier_qty, price);
    pricingOverrides.set(row.bom_line_id, inner);
    if (!firstPriceByLine.has(row.bom_line_id)) {
      firstPriceByLine.set(row.bom_line_id, price);
    }
  }

  console.info(
    `[calculate] quote=${quoteId} pins_dropped=${corruptPinIds.length} ` +
    `pins_kept=${pricingOverrides.size}`
  );

  // Purge corrupt pins so they don't come back on the next render. Fire-
  // and-forget â€” failure here isn't fatal; the engine already ignored them.
  if (corruptPinIds.length > 0) {
    void Promise.all(
      corruptPinIds.map((p) =>
        supabase
          .from("bom_line_pricing")
          .delete()
          .eq("bom_line_id", p.bom_line_id)
          .eq("tier_qty", p.tier_qty)
      )
    ).catch(() => {});
  }

  // --- Build PricingLine array ---
  //   - Customer-supplied lines are excluded outright.
  //   - Modes without component procurement (assembly_only) exclude ALL
  //     non-PCB lines from pricing.
  const pricingLines: PricingLine[] = [];
  if (!skipComponents) {
    for (const line of bomLines) {
      if (csSet.has(line.id)) continue;
      pricingLines.push({
        bom_line_id: line.id,
        mpn: line.mpn ?? "",
        cpc: line.cpc ?? null,
        description: line.description ?? "",
        m_code: (line.m_code as PricingLine["m_code"]) ?? null,
        qty_per_board: line.quantity,
        unit_price: firstPriceByLine.get(line.id) ?? null,
        price_source: firstPriceByLine.has(line.id) ? "manual" : null,
        pin_count: line.pin_count ?? null,
      });
    }
  }

  // --- Build TierInput[] with per-tier PCB prices (or 0 when mode skips PCB) ---
  // Fall back to previously-saved inputs on the quote when the body omits
  // them â€” callers like the Markup Override editor recalc without resending
  // the full wizard payload, and we must NOT zero out PCB prices / NRE in
  // that case.
  const savedQty = (quote.quantities as Record<string, unknown>) ?? {};
  const savedTierPcb = (savedQty.tier_pcb_prices as Record<string, number> | undefined) ?? {};
  const savedNre = (savedQty.nre as Partial<{ programming: number; stencil: number; pcb_fab: number }> | undefined) ?? {};
  const tierPcbPrices = body.tier_pcb_prices ?? savedTierPcb;
  const nreProgramming = toNum(body.nre_programming, savedNre.programming ?? 0);
  const nreStencil = toNum(body.nre_stencil, savedNre.stencil ?? 0);
  const nrePcbFab = toNum(body.nre_pcb_fab, savedNre.pcb_fab ?? 0);

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

  // --- Run the engine ---
  const savedShipping = typeof savedQty.shipping_flat === "number" ? (savedQty.shipping_flat as number) : undefined;
  const shippingFlat = toNum(body.shipping_flat, savedShipping ?? settings.default_shipping ?? 0);
  const pricing = calculateQuote({
    lines: pricingLines,
    shipping_flat: shippingFlat,
    overages,
    settings,
    tier_inputs: tierInputs,
    // The body's board_side wins (operator just toggled it in the wizard);
    // fall back to whatever's currently saved on the GMP.
    board_side: body.board_side ?? quoteBoardSide,
    pricing_overrides: pricingOverrides,
    tier_markup_overrides: tierMarkupOverrides.size > 0 ? tierMarkupOverrides : undefined,
    boards_per_panel: Number(
      body.boards_per_panel ?? quote.boards_per_panel ?? 1
    ) || 1,
  });

  // --- Persist step-3 inputs + pricing result ---
  const nextQuantities: Record<string, unknown> = {
    ...((quote.quantities as Record<string, unknown>) ?? {}),
    tiers,
    tier_pcb_prices: tierPcbPrices,
    nre: {
      programming: nreProgramming,
      stencil: nreStencil,
      pcb_fab: nrePcbFab,
    },
    shipping_flat: shippingFlat,
    pcb_input_mode:
      body.pcb_input_mode === "extended" ? "extended" : "unit",
  };

  const updatePayload: Record<string, unknown> = {
    quantities: nextQuantities,
    pricing: pricing as unknown as Record<string, unknown>,
    wizard_status: "complete",
    // Wizard quotes flow from draft â†’ review on first Calculate, so Anas
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

  // Mirror every board-level detail the operator entered in Step 3 onto the
  // GMP record. Board geometry is a property of the physical product, not
  // a single BOM revision, so storing it on the GMP means every future
  // upload + quote under this GMP pre-fills with the same values.
  //   board_side     â†’ board_side  (canonical: 'single' | 'double')
  //   ipc_class      â†’ ipc_class   (number â†’ string to fit the CHECK constraint)
  //   solder_type    â†’ solder_type (leadfree â†’ lead-free to fit the CHECK constraint)
  //   boards_per_panel â†’ boards_per_panel
  const gmpUpdates: Record<string, unknown> = {};
  if (body.board_side === "single" || body.board_side === "double") {
    gmpUpdates.board_side = body.board_side;
  }
  if (body.ipc_class === 1 || body.ipc_class === 2 || body.ipc_class === 3) {
    gmpUpdates.ipc_class = String(body.ipc_class);
  }
  if (body.solder_type === "leaded" || body.solder_type === "leadfree") {
    gmpUpdates.solder_type = body.solder_type === "leaded" ? "leaded" : "lead-free";
  }
  if (
    typeof body.boards_per_panel === "number" &&
    Number.isInteger(body.boards_per_panel) &&
    body.boards_per_panel > 0
  ) {
    gmpUpdates.boards_per_panel = body.boards_per_panel;
  }
  if (Object.keys(gmpUpdates).length > 0 && quote.gmp_id) {
    await supabase.from("gmps").update(gmpUpdates).eq("id", quote.gmp_id);
  }

  return NextResponse.json({
    ok: true,
    pricing,
    component_lines_counted: pricingLines.length,
    customer_supplied_count: csSet.size,
    skipped_components: skipComponents,
    skipped_pcb: skipPcb,
    corrupt_pins_dropped: corruptPinIds.length,
    corrupt_pins_detail: corruptPinIds,
  });
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
