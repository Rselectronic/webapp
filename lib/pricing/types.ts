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
  smt_rate_per_hour: number;
  currency: string;
  // Granular NRE defaults (sum = default_nre when all apply)
  nre_programming: number;
  nre_stencil: number;
  nre_setup: number;
  nre_pcb_fab: number;
  nre_misc: number;
  // Setup / programming time defaults (hours)
  setup_time_hours: number;
  programming_time_hours: number;
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
  mansmt_placements: number;
  components_with_price: number;
  components_missing_price: number;
  // Labour breakdown
  labour: LabourBreakdown;
}

export interface LabourBreakdown {
  smt_placement_cost: number;       // SMT placements x rate x board_qty
  th_placement_cost: number;        // TH placements x rate x board_qty
  mansmt_placement_cost: number;    // Manual SMT x rate x board_qty
  total_placement_cost: number;     // Sum of all placement costs
  setup_cost: number;               // setup_time_hours x labour_rate_per_hour
  programming_cost: number;         // programming_time_hours x labour_rate_per_hour
  total_labour_cost: number;        // placement + setup + programming
  // NRE breakdown
  nre_programming: number;
  nre_stencil: number;
  nre_setup: number;
  nre_pcb_fab: number;
  nre_misc: number;
  nre_total: number;
  // Stats from VBA TIME file
  total_unique_lines: number;
  total_smt_placements: number;     // CP + CPEXP + 0402 + 0201 + IP + MANSMT
  cp_feeder_count: number;          // Count of CP/CPEXP/0402/0201 unique lines
  ip_feeder_count: number;          // Count of IP unique lines
  cp_placement_sum: number;         // Sum of qty for CP/CPEXP/0402/0201
  ip_placement_sum: number;         // Sum of qty for IP
  mansmt_count: number;             // Sum of qty for MANSMT
  th_placement_sum: number;         // Sum of qty for TH
}

/** Per-tier input: each quantity tier can have its own PCB price and NRE breakdown */
export interface TierInput {
  qty: number;
  pcb_unit_price: number;
  nre_programming: number;
  nre_stencil: number;
  nre_pcb_fab: number;
}

export interface QuoteInput {
  lines: PricingLine[];
  /** @deprecated Use `tier_inputs` instead. Kept for backward compatibility. */
  quantities?: number[];
  /** @deprecated Use per-tier values in `tier_inputs` instead. */
  pcb_unit_price?: number;
  /** @deprecated Use per-tier NRE breakdown in `tier_inputs` instead. */
  nre_charge?: number;
  shipping_flat: number;
  overages: OverageTier[];
  settings: PricingSettings;
  /** New per-tier input with individual PCB prices and NRE breakdown */
  tier_inputs?: TierInput[];
}

export interface MissingPriceComponent {
  mpn: string;
  description: string;
  qty_per_board: number;
}

export interface QuotePricing {
  tiers: PricingTier[];
  warnings: string[];
  missing_price_components?: MissingPriceComponent[];
}
