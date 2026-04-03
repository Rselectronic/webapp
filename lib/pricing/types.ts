import type { MCode } from "@/lib/mcode/types";

export interface PricingLine {
  bom_line_id: string;
  mpn: string;
  description: string;
  m_code: MCode | null;
  qty_per_board: number;
  unit_price: number | null;
  price_source: "cache" | "digikey" | "manual" | null;
}

export interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

export interface PricingSettings {
  component_markup_pct: number;
  pcb_markup_pct: number;
  smt_cost_per_placement: number;
  th_cost_per_placement: number;
  mansmt_cost_per_placement: number;
  default_nre: number;
  default_shipping: number;
  quote_validity_days: number;
  labour_rate_per_hour: number;
  currency: string;
}

export interface PricingTier {
  board_qty: number;
  component_cost: number;
  pcb_cost: number;
  assembly_cost: number;
  nre_charge: number;
  shipping: number;
  subtotal: number;
  per_unit: number;
  smt_placements: number;
  th_placements: number;
  components_with_price: number;
  components_missing_price: number;
}

export interface QuoteInput {
  lines: PricingLine[];
  quantities: [number, number, number, number];
  pcb_unit_price: number;
  nre_charge: number;
  shipping_flat: number;
  overages: OverageTier[];
  settings: PricingSettings;
}

export interface QuotePricing {
  tiers: PricingTier[];
  warnings: string[];
}
