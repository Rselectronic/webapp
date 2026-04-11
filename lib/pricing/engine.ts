import type { QuoteInput, QuotePricing, PricingTier, MissingPriceComponent } from "./types";
import { getOrderQty } from "./overage";

const SMT_MCODES = new Set(["CP", "CPEXP", "0402", "0201", "IP"]);
const TH_MCODES = new Set(["TH"]);
const MANSMT_MCODES = new Set(["MANSMT"]);
// These M-codes don't contribute to placement costs (manual assembly, non-SMT)
// MEC, Accs, CABLE, DEV B, PCB, EA, APCB, AEA, FUSE, LABEL, WIRE, PRESSFIT

export function calculateQuote(input: QuoteInput): QuotePricing {
  const {
    lines,
    quantities,
    pcb_unit_price,
    nre_charge,
    shipping_flat,
    overages,
    settings,
  } = input;

  const markupMultiplier = 1 + settings.component_markup_pct / 100;
  const pcbMarkupMultiplier = 1 + settings.pcb_markup_pct / 100;
  const warnings: string[] = [];
  const tiers: PricingTier[] = [];

  // Collect components with missing prices (once, same across all tiers)
  const missingPriceComponents: MissingPriceComponent[] = lines
    .filter((l) => l.unit_price === null)
    .map((l) => ({ mpn: l.mpn, description: l.description, qty_per_board: l.qty_per_board }));

  for (const boardQty of quantities) {
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

    const assemblyCost =
      (smtPlacements * settings.smt_cost_per_placement +
        thPlacements * settings.th_cost_per_placement +
        mansmtPlacements * settings.mansmt_cost_per_placement) *
      boardQty;

    const subtotal =
      componentCost + pcbCost + assemblyCost + nre_charge + shipping_flat;

    const perUnit = boardQty > 0 ? subtotal / boardQty : 0;

    tiers.push({
      board_qty: boardQty,
      component_cost: round2(componentCost),
      pcb_cost: round2(pcbCost),
      assembly_cost: round2(assemblyCost),
      nre_charge: round2(nre_charge),
      shipping: round2(shipping_flat),
      subtotal: round2(subtotal),
      per_unit: round2(perUnit),
      smt_placements: smtPlacements,
      th_placements: thPlacements,
      components_with_price: componentsWithPrice,
      components_missing_price: componentsMissingPrice,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
