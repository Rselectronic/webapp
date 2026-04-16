import type { QuoteInput, QuotePricing, PricingTier, MissingPriceComponent, LabourBreakdown, TierInput } from "./types";
import { getOrderQty } from "./overage";
import { calculateProgrammingCost, isDoubleSidedAssembly } from "./programming-cost";

const SMT_MCODES = new Set(["CP", "CPEXP", "0402", "0201", "IP"]);
const TH_MCODES = new Set(["TH"]);
const MANSMT_MCODES = new Set(["MANSMT"]);

// Sub-groups for TIME file stats (from VBA: CP/CPEXP/0402/0201 vs IP)
const CP_FEEDER_MCODES = new Set(["CP", "CPEXP", "0402", "0201"]);
const IP_FEEDER_MCODES = new Set(["IP"]);

// CPH sub-groups: finer granularity for time-based model
const CP_CPEXP_MCODES = new Set(["CP", "CPEXP"]);      // Standard high-speed
const SMALL_MCODES = new Set(["0402"]);                  // Small passives
const ULTRA_SMALL_MCODES = new Set(["0201"]);            // Ultra-tiny passives
const IP_MCODES = new Set(["IP"]);                       // Large ICs

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
    assembly_type,
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

  // Finer granularity for CPH time model
  let cpCpexpPlacementSum = 0;  // CP + CPEXP placements per board
  let smallPlacementSum = 0;     // 0402 placements per board
  let ultraSmallPlacementSum = 0; // 0201 placements per board

  for (const line of lines) {
    if (line.qty_per_board > 0) {
      totalUniqueLines++;
    }
    const mc = line.m_code;
    if (mc && CP_FEEDER_MCODES.has(mc)) {
      cpFeederCount++;
      cpPlacementSum += line.qty_per_board;
      // Sub-categorize for CPH rates
      if (CP_CPEXP_MCODES.has(mc)) cpCpexpPlacementSum += line.qty_per_board;
      else if (SMALL_MCODES.has(mc)) smallPlacementSum += line.qty_per_board;
      else if (ULTRA_SMALL_MCODES.has(mc)) ultraSmallPlacementSum += line.qty_per_board;
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
  const smtRate = settings.smt_rate_per_hour ?? 165;
  const setupTimeHours = settings.setup_time_hours ?? 0;
  const programmingTimeHours = settings.programming_time_hours ?? 0;
  const setupCost = round2(setupTimeHours * labourRate);

  // Programming cost: use the tiered DM V11 lookup table based on BOM line count
  // and assembly type. Falls back to flat programmingTimeHours * labourRate if lookup returns 0.
  const isDouble = assembly_type ? isDoubleSidedAssembly(assembly_type) : true;
  const tieredProgrammingCost = totalUniqueLines > 0
    ? calculateProgrammingCost(totalUniqueLines, isDouble)
    : 0;
  const baseProgrammingCost = tieredProgrammingCost > 0
    ? round2(tieredProgrammingCost)
    : round2(programmingTimeHours * labourRate);

  // Time-based model toggle (defaults to true for new quotes)
  const useTimeModel = settings.use_time_model !== false;

  // CPH rates (components per hour) by M-code category
  const cpCph = settings.cp_cph ?? 4500;
  const smallCph = settings.small_cph ?? 3500;
  const ultraSmallCph = settings.ultra_small_cph ?? 2500;
  const ipCph = settings.ip_cph ?? 2000;
  const thCph = settings.th_cph ?? 150;
  const mansmtCph = settings.mansmt_cph ?? 100;

  // Feeder setup parameters
  const cpLoadTimeMin = settings.cp_load_time_min ?? 2;
  const ipLoadTimeMin = settings.ip_load_time_min ?? 3;
  const printerSetupMin = settings.printer_setup_min ?? 15;

  // NRE settings-level defaults (setup + misc — not per-tier)
  const nreSetup = settings.nre_setup ?? 0;
  const nreMisc = settings.nre_misc ?? 0;

  // Pre-compute feeder setup time (independent of board qty — one-time per run)
  // 2 sides (top + bottom) for printer setup
  const feederSetupTimeHours = round6(
    (cpFeederCount * cpLoadTimeMin + ipFeederCount * ipLoadTimeMin + 2 * printerSetupMin) / 60
  );

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

    // Programming cost for this tier: if nre_programming is already set (e.g.
    // auto-filled from the BOM line-count endpoint), it already contains the
    // tiered programming fee — so set programmingCost to 0 to avoid double-
    // counting. Otherwise, use the engine-computed tiered lookup.
    const programmingCost = nreProgramming > 0 ? 0 : baseProgrammingCost;

    const pcb_unit_price = tierInput.pcb_unit_price ?? 0;
    let componentCost = 0;
    let overageCost = 0;
    let overageQty = 0;
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
      const baseQty = line.qty_per_board * boardQty;
      const extras = orderQty - baseQty;

      const unitPrice = line.unit_price ?? 0;

      if (line.unit_price === null) {
        componentsMissingPrice++;
      } else {
        componentsWithPrice++;
      }

      componentCost += unitPrice * orderQty * markupMultiplier;

      if (extras > 0) {
        overageCost += unitPrice * extras * markupMultiplier;
        overageQty += extras;
      }

      if (line.m_code && SMT_MCODES.has(line.m_code)) {
        smtPlacements += line.qty_per_board;
      } else if (line.m_code && TH_MCODES.has(line.m_code)) {
        thPlacements += line.qty_per_board;
      } else if (line.m_code && MANSMT_MCODES.has(line.m_code)) {
        mansmtPlacements += line.qty_per_board;
      }
    }

    const pcbCost = pcb_unit_price * boardQty * pcbMarkupMultiplier;

    let smtPlacementCost: number;
    let thPlacementCost: number;
    let mansmtPlacementCost: number;
    let totalPlacementCost: number;
    let assemblyCost: number;

    // Time model fields (always computed for stats, even if legacy model is active)
    // Total placements across all boards for this tier
    const totalCpCpexpPlacements = cpCpexpPlacementSum * boardQty;
    const totalSmallPlacements = smallPlacementSum * boardQty;
    const totalUltraSmallPlacements = ultraSmallPlacementSum * boardQty;
    const totalIpPlacements = ipPlacementSum * boardQty;
    const totalThPlacements = thPlacementSum * boardQty;
    const totalMansmtPlacements = mansmtCountSum * boardQty;

    // Time in hours per category = total_placements / CPH
    const cpCpexpTimeHours = cpCph > 0 ? round6(totalCpCpexpPlacements / cpCph) : 0;
    const smallTimeHours = smallCph > 0 ? round6(totalSmallPlacements / smallCph) : 0;
    const ultraSmallTimeHours = ultraSmallCph > 0 ? round6(totalUltraSmallPlacements / ultraSmallCph) : 0;
    const ipTimeHours = ipCph > 0 ? round6(totalIpPlacements / ipCph) : 0;
    const thTimeHours = thCph > 0 ? round6(totalThPlacements / thCph) : 0;
    const mansmtTimeHours = mansmtCph > 0 ? round6(totalMansmtPlacements / mansmtCph) : 0;

    // Aggregate time categories
    const smtTimeHoursTotal = round6(cpCpexpTimeHours + smallTimeHours + ultraSmallTimeHours + ipTimeHours);
    const assemblyPlacementTimeHours = round6(smtTimeHoursTotal + thTimeHours + mansmtTimeHours);

    // Total assembly hours = placement time + feeder setup (one-time per run, not per board)
    const totalAssemblyHours = round6(assemblyPlacementTimeHours + feederSetupTimeHours);

    // Labour cost = total assembly hours x labour rate (covers ALL assembly time)
    const timeLabourCost = round2(totalAssemblyHours * labourRate);
    // Machine cost = SMT time only x machine rate (machine is only running during SMT)
    const timeMachineCost = round2(smtTimeHoursTotal * smtRate);

    if (useTimeModel) {
      // ---- TIME-BASED ASSEMBLY MODEL (DM/TIME V11) ----
      // Assembly cost = labour (all assembly time) + machine (SMT time only)
      assemblyCost = round2(timeLabourCost + timeMachineCost);

      // Break down placement costs for display (proportional to time contribution)
      // Feeder setup labour is attributed to SMT since it's machine-related setup
      const feederSetupLabour = round2(feederSetupTimeHours * labourRate);
      smtPlacementCost = round2(smtTimeHoursTotal * labourRate + timeMachineCost + feederSetupLabour);
      thPlacementCost = round2(thTimeHours * labourRate);
      mansmtPlacementCost = round2(mansmtTimeHours * labourRate);
      totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);
    } else {
      // ---- LEGACY PER-PLACEMENT MODEL (backward compatibility) ----
      smtPlacementCost = round2(smtPlacements * settings.smt_cost_per_placement * boardQty);
      thPlacementCost = round2(thPlacements * settings.th_cost_per_placement * boardQty);
      mansmtPlacementCost = round2(mansmtPlacements * settings.mansmt_cost_per_placement * boardQty);
      totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);
      assemblyCost = totalPlacementCost;
    }

    // Total labour = assembly + setup + programming
    const totalLabourCost = round2(assemblyCost + setupCost + programmingCost);

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
      // Time-based model fields
      time_model_used: useTimeModel,
      assembly_time_hours: round6(totalAssemblyHours),
      smt_time_hours: round6(smtTimeHoursTotal),
      th_time_hours: round6(thTimeHours),
      mansmt_time_hours: round6(mansmtTimeHours),
      setup_time_hours_computed: round6(feederSetupTimeHours),
      labour_cost: useTimeModel ? timeLabourCost : totalPlacementCost,
      machine_cost: useTimeModel ? timeMachineCost : 0,
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
      overage_cost: round2(overageCost),
      overage_qty: overageQty,
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
 * Supports both time-based (CPH) and legacy per-placement models.
 * Useful for per-job labour breakdown without re-running the full pricing engine.
 */
export function calculateLabourCost(input: {
  smtPlacements: number;
  thPlacements: number;
  mansmtPlacements: number;
  boardQty: number;
  /** @deprecated Used by legacy model only */
  smtCostPerPlacement: number;
  /** @deprecated Used by legacy model only */
  thCostPerPlacement: number;
  /** @deprecated Used by legacy model only */
  mansmtCostPerPlacement: number;
  labourRatePerHour: number;
  smtRatePerHour?: number;
  setupTimeHours: number;
  programmingTimeHours: number;
  // Time model params (optional — if absent, falls back to legacy)
  useTimeModel?: boolean;
  cpCph?: number;
  smallCph?: number;
  ultraSmallCph?: number;
  ipCph?: number;
  thCph?: number;
  mansmtCph?: number;
  // For time model, need finer placement breakdown
  cpCpexpPlacements?: number;
  smallPlacements?: number;
  ultraSmallPlacements?: number;
  ipPlacements?: number;
  cpFeederCount?: number;
  ipFeederCount?: number;
  cpLoadTimeMin?: number;
  ipLoadTimeMin?: number;
  printerSetupMin?: number;
}): {
  smt_placement_cost: number;
  th_placement_cost: number;
  mansmt_placement_cost: number;
  total_placement_cost: number;
  setup_cost: number;
  programming_cost: number;
  total_labour_cost: number;
  // Time model extras
  assembly_time_hours?: number;
  smt_time_hours?: number;
  th_time_hours?: number;
  mansmt_time_hours?: number;
  labour_cost?: number;
  machine_cost?: number;
} {
  const setupCost = round2(input.setupTimeHours * input.labourRatePerHour);
  const programmingCost = round2(input.programmingTimeHours * input.labourRatePerHour);

  if (input.useTimeModel) {
    const cpCph = input.cpCph ?? 4500;
    const smallCph = input.smallCph ?? 3500;
    const ultraSmallCph = input.ultraSmallCph ?? 2500;
    const ipCph = input.ipCph ?? 2000;
    const thCph = input.thCph ?? 150;
    const mansmtCph = input.mansmtCph ?? 100;
    const smtRatePerHour = input.smtRatePerHour ?? 165;

    const totalCpCpexp = (input.cpCpexpPlacements ?? input.smtPlacements) * input.boardQty;
    const totalSmall = (input.smallPlacements ?? 0) * input.boardQty;
    const totalUltraSmall = (input.ultraSmallPlacements ?? 0) * input.boardQty;
    const totalIp = (input.ipPlacements ?? 0) * input.boardQty;
    const totalTh = input.thPlacements * input.boardQty;
    const totalMansmt = input.mansmtPlacements * input.boardQty;

    const smtTimeHours = round6(
      (cpCph > 0 ? totalCpCpexp / cpCph : 0) +
      (smallCph > 0 ? totalSmall / smallCph : 0) +
      (ultraSmallCph > 0 ? totalUltraSmall / ultraSmallCph : 0) +
      (ipCph > 0 ? totalIp / ipCph : 0)
    );
    const thTimeHours = thCph > 0 ? round6(totalTh / thCph) : 0;
    const mansmtTimeHours = mansmtCph > 0 ? round6(totalMansmt / mansmtCph) : 0;

    const cpLoadMin = input.cpLoadTimeMin ?? 2;
    const ipLoadMin = input.ipLoadTimeMin ?? 3;
    const printerMin = input.printerSetupMin ?? 15;
    const feederSetup = round6(
      ((input.cpFeederCount ?? 0) * cpLoadMin + (input.ipFeederCount ?? 0) * ipLoadMin + 2 * printerMin) / 60
    );

    const assemblyTimeHours = round6(smtTimeHours + thTimeHours + mansmtTimeHours + feederSetup);
    const labourCost = round2(assemblyTimeHours * input.labourRatePerHour);
    const machineCost = round2(smtTimeHours * smtRatePerHour);

    const feederSetupLabour = round2(feederSetup * input.labourRatePerHour);
    const smtPlacementCost = round2(smtTimeHours * input.labourRatePerHour + machineCost + feederSetupLabour);
    const thPlacementCost = round2(thTimeHours * input.labourRatePerHour);
    const mansmtPlacementCost = round2(mansmtTimeHours * input.labourRatePerHour);
    const totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);
    const totalLabourCost = round2(totalPlacementCost + setupCost + programmingCost);

    return {
      smt_placement_cost: smtPlacementCost,
      th_placement_cost: thPlacementCost,
      mansmt_placement_cost: mansmtPlacementCost,
      total_placement_cost: totalPlacementCost,
      setup_cost: setupCost,
      programming_cost: programmingCost,
      total_labour_cost: totalLabourCost,
      assembly_time_hours: assemblyTimeHours,
      smt_time_hours: smtTimeHours,
      th_time_hours: thTimeHours,
      mansmt_time_hours: mansmtTimeHours,
      labour_cost: labourCost,
      machine_cost: machineCost,
    };
  }

  // Legacy per-placement model
  const smtPlacementCost = round2(input.smtPlacements * input.smtCostPerPlacement * input.boardQty);
  const thPlacementCost = round2(input.thPlacements * input.thCostPerPlacement * input.boardQty);
  const mansmtPlacementCost = round2(input.mansmtPlacements * input.mansmtCostPerPlacement * input.boardQty);
  const totalPlacementCost = round2(smtPlacementCost + thPlacementCost + mansmtPlacementCost);
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

/** Round to 6 decimal places — used for intermediate time calculations to avoid float drift */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
