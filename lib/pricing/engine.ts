import type { QuoteInput, QuotePricing, PricingTier, MissingPriceComponent, LabourBreakdown, TierInput } from "./types";
import { getOrderQty } from "./overage";

const SMT_MCODES = new Set(["CP", "CPEXP", "0402", "0201", "IP"]);
const TH_MCODES = new Set(["TH"]);
const MANSMT_MCODES = new Set(["MANSMT"]);

// Sub-groups for TIME file stats (from VBA: CP/CPEXP/0402/0201 vs IP)
const CP_FEEDER_MCODES = new Set(["CP", "CPEXP", "0402", "0201"]);
const IP_FEEDER_MCODES = new Set(["IP"]);

// These M-codes don't contribute to placement costs (manual assembly, non-SMT)
// MEC, Accs, CABLE, DEV B, PCB, EA, APCB, AEA, FUSE, LABEL, WIRE, PRESSFIT

export function calculateQuote(input: QuoteInput): QuotePricing {
  const {
    lines,
    quantities: legacyQuantities,
    pcb_unit_price: legacyPcbPrice,
    nre_charge: legacyNreCharge,
    shipping_flat,
    overages,
    settings,
    tier_inputs,
  } = input;

  // Resolve per-tier inputs: prefer new tier_inputs, fall back to legacy flat values
  const resolvedTiers: TierInput[] = tier_inputs && tier_inputs.length > 0
    ? tier_inputs
    : (legacyQuantities ?? []).map((qty) => ({
        qty,
        pcb_unit_price: legacyPcbPrice ?? 0,
        nre_programming: 0,
        nre_stencil: 0,
        nre_pcb_fab: 0,
      }));

  const markupMultiplier = 1 + settings.component_markup_pct / 100;
  const pcbMarkupMultiplier = 1 + settings.pcb_markup_pct / 100;
  const warnings: string[] = [];
  const tiers: PricingTier[] = [];

  // Collect components with missing prices (once, same across all tiers)
  const missingPriceComponents: MissingPriceComponent[] = lines
    .filter((l) => l.unit_price === null)
    .map((l) => ({ mpn: l.mpn, description: l.description, qty_per_board: l.qty_per_board }));

  // ---- Pre-compute M-code stats (independent of quantity tier) ----
  let totalUniqueLines = 0;
  let cpFeederCount = 0;
  let ipFeederCount = 0;
  let cpPlacementSum = 0;
  let ipPlacementSum = 0;
  let mansmtCountSum = 0;
  let thPlacementSum = 0;

  for (const line of lines) {
    if (line.qty_per_board > 0) {
      totalUniqueLines++;
    }
    const mc = line.m_code;
    if (mc && CP_FEEDER_MCODES.has(mc)) {
      cpFeederCount++;
      cpPlacementSum += line.qty_per_board;
    } else if (mc && IP_FEEDER_MCODES.has(mc)) {
      ipFeederCount++;
      ipPlacementSum += line.qty_per_board;
    } else if (mc && MANSMT_MCODES.has(mc)) {
      mansmtCountSum += line.qty_per_board;
    } else if (mc && TH_MCODES.has(mc)) {
      thPlacementSum += line.qty_per_board;
    }
  }

  const totalSmtPlacements = cpPlacementSum + ipPlacementSum + mansmtCountSum;

  // Setup & programming time costs (from settings, shared across tiers)
  const labourRate = settings.labour_rate_per_hour ?? 130;
  const setupTimeHours = settings.setup_time_hours ?? 0;
  const programmingTimeHours = settings.programming_time_hours ?? 0;
  const setupCost = round2(setupTimeHours * labourRate);
  const programmingCost = round2(programmingTimeHours * labourRate);

  // NRE settings-level defaults (setup + misc — not per-tier)
  const nreSetup = settings.nre_setup ?? 0;
  const nreMisc = settings.nre_misc ?? 0;

  for (const tierInput of resolvedTiers) {
    const boardQty = tierInput.qty;

    // Per-tier NRE values
    const nreProgramming = tierInput.nre_programming ?? 0;
    const nreStencil = tierInput.nre_stencil ?? 0;
    const nrePcbFab = tierInput.nre_pcb_fab ?? 0;
    const perTierNreTotal = nreProgramming + nreStencil + nrePcbFab + nreSetup + nreMisc;

    // If new per-tier NRE is all 0 AND we have a legacy nre_charge, use that
    const nreTotal = perTierNreTotal > 0
      ? perTierNreTotal
      : (legacyNreCharge ?? 0);

    const pcb_unit_price = tierInput.pcb_unit_price ?? 0;
    let componentCost = 0;
    let smtPlacements = 0;
    let thPlacements = 0;
    let mansmtPlacements = 0;
    let componentsWithPrice = 0;
    let componentsMissingPrice = 0;

    for (const line of lines) {
      const orderQty = getOrderQty(
        line.qty_per_board,
        boardQty,
        line.m_code,
        overages
      );

      const unitPrice = line.unit_price ?? 0;

      if (line.unit_price === null) {
        componentsMissingPrice++;
      } else {
        componentsWithPrice++;
      }

      componentCost += unitPrice * orderQty * markupMultiplier;

      if (line.m_code && SMT_MCODES.has(line.m_code)) {
        smtPlacements += line.qty_per_board;
      } else if (line.m_code && TH_MCODES.has(line.m_code)) {
        thPlacements += line.qty_per_board;
      } else if (line.m_code && MANSMT_MCODES.has(line.m_code)) {
        mansmtPlacements += line.qty_per_board;
      }
    }

    const pcbCost = pcb_unit_price * boardQty * pcbMarkupMultiplier;

    // Placement costs (per-board placements x rate x board_qty)
    const smtPlacementCost = round2(smtPlacements * settings.smt_cost_per_placement * boardQty);
    const thPlacementCost = round2(thPlacements * settings.th_cost_per_placement * boardQty);
    const mansmtPlacementCost = round2(mansmtPlacements * settings.mansmt_cost_per_placement * boardQty);
    const totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);

    // Assembly cost = placement cost (same as before, for backward compatibility)
    const assemblyCost = totalPlacementCost;

    // Total labour = placement + setup + programming
    const totalLabourCost = round2(totalPlacementCost + setupCost + programmingCost);

    const labour: LabourBreakdown = {
      smt_placement_cost: smtPlacementCost,
      th_placement_cost: thPlacementCost,
      mansmt_placement_cost: mansmtPlacementCost,
      total_placement_cost: totalPlacementCost,
      setup_cost: setupCost,
      programming_cost: programmingCost,
      total_labour_cost: totalLabourCost,
      nre_programming: round2(nreProgramming),
      nre_stencil: round2(nreStencil),
      nre_setup: round2(nreSetup),
      nre_pcb_fab: round2(nrePcbFab),
      nre_misc: round2(nreMisc),
      nre_total: round2(nreTotal),
      total_unique_lines: totalUniqueLines,
      total_smt_placements: totalSmtPlacements,
      cp_feeder_count: cpFeederCount,
      ip_feeder_count: ipFeederCount,
      cp_placement_sum: cpPlacementSum,
      ip_placement_sum: ipPlacementSum,
      mansmt_count: mansmtCountSum,
      th_placement_sum: thPlacementSum,
    };

    const subtotal =
      componentCost + pcbCost + assemblyCost + nreTotal + shipping_flat + setupCost + programmingCost;

    const perUnit = boardQty > 0 ? subtotal / boardQty : 0;

    tiers.push({
      board_qty: boardQty,
      component_cost: round2(componentCost),
      pcb_cost: round2(pcbCost),
      assembly_cost: round2(assemblyCost),
      nre_charge: round2(nreTotal),
      shipping: round2(shipping_flat),
      subtotal: round2(subtotal),
      per_unit: round2(perUnit),
      smt_placements: smtPlacements,
      th_placements: thPlacements,
      mansmt_placements: mansmtPlacements,
      components_with_price: componentsWithPrice,
      components_missing_price: componentsMissingPrice,
      labour,
    });
  }

  if (tiers.some((t) => t.components_missing_price > 0)) {
    const max = Math.max(...tiers.map((t) => t.components_missing_price));
    warnings.push(
      `${max} component(s) have no price — using $0. Review before sending.`
    );
  }

  return {
    tiers,
    warnings,
    missing_price_components: missingPriceComponents.length > 0 ? missingPriceComponents : undefined,
  };
}

/**
 * Standalone labour cost calculator for a given M-code distribution and quantity.
 * Useful for per-job labour breakdown without re-running the full pricing engine.
 */
export function calculateLabourCost(input: {
  smtPlacements: number;
  thPlacements: number;
  mansmtPlacements: number;
  boardQty: number;
  smtCostPerPlacement: number;
  thCostPerPlacement: number;
  mansmtCostPerPlacement: number;
  labourRatePerHour: number;
  setupTimeHours: number;
  programmingTimeHours: number;
}): {
  smt_placement_cost: number;
  th_placement_cost: number;
  mansmt_placement_cost: number;
  total_placement_cost: number;
  setup_cost: number;
  programming_cost: number;
  total_labour_cost: number;
} {
  const smtPlacementCost = round2(input.smtPlacements * input.smtCostPerPlacement * input.boardQty);
  const thPlacementCost = round2(input.thPlacements * input.thCostPerPlacement * input.boardQty);
  const mansmtPlacementCost = round2(input.mansmtPlacements * input.mansmtCostPerPlacement * input.boardQty);
  const totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);
  const setupCost = round2(input.setupTimeHours * input.labourRatePerHour);
  const programmingCost = round2(input.programmingTimeHours * input.labourRatePerHour);
  const totalLabourCost = round2(totalPlacementCost + setupCost + programmingCost);

  return {
    smt_placement_cost: smtPlacementCost,
    th_placement_cost: thPlacementCost,
    mansmt_placement_cost: mansmtPlacementCost,
    total_placement_cost: totalPlacementCost,
    setup_cost: setupCost,
    programming_cost: programmingCost,
    total_labour_cost: totalLabourCost,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
