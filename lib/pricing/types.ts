import type { MCode } from "@/lib/mcode/types";

export interface PricingLine {
  bom_line_id: string;
  mpn: string;
  description: string;
  m_code: MCode | null;
  qty_per_board: number;
  unit_price: number | null;
  price_source: "cache" | "digikey" | "mouser" | "lcsc" | "historical" | "manual" | null;
}

export interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

export interface PricingSettings {
  component_markup_pct: number;
  pcb_markup_pct: number;
  /** @deprecated Legacy flat per-placement cost. Kept for backward compat; new quotes use CPH time model. */
  smt_cost_per_placement: number;
  /** @deprecated Legacy flat per-placement cost. Kept for backward compat; new quotes use CPH time model. */
  th_cost_per_placement: number;
  /** @deprecated Legacy flat per-placement cost. Kept for backward compat; new quotes use CPH time model. */
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
  // ---------- TIME-BASED ASSEMBLY MODEL (CPH rates from DM/TIME V11) ----------
  // Components Per Hour by M-code category
  cp_cph: number;          // CP/CPEXP — high-speed pick & place (default 4500)
  small_cph: number;       // 0402 — smaller passives, slower (default 3500)
  ultra_small_cph: number; // 0201 — ultra-tiny, slowest SMT (default 2500)
  ip_cph: number;          // IP — large ICs, tray feeders (default 2000)
  th_cph: number;          // TH — manual insertion (default 150)
  mansmt_cph: number;      // MANSMT — hand soldering (default 100)
  // Feeder load times (minutes)
  cp_load_time_min: number;      // Time to load one CP/CPEXP/0402/0201 feeder (default 2)
  ip_load_time_min: number;      // Time to load one IP feeder (default 3)
  printer_setup_min: number;     // Solder paste printer setup per side (default 15)
  // Whether to use the time-based model (true) or legacy per-placement model (false)
  use_time_model: boolean;
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
  // Overage breakdown — how much of component_cost is overage extras
  overage_cost: number;
  overage_qty: number;
  // Labour breakdown
  labour: LabourBreakdown;
}

export interface LabourBreakdown {
  smt_placement_cost: number;       // SMT placements x rate x board_qty (legacy) or time-based labour for SMT
  th_placement_cost: number;        // TH placements x rate x board_qty (legacy) or time-based labour for TH
  mansmt_placement_cost: number;    // Manual SMT x rate x board_qty (legacy) or time-based labour for MANSMT
  total_placement_cost: number;     // Sum of all placement costs (legacy) or total assembly labour
  setup_cost: number;               // setup_time_hours x labour_rate_per_hour
  programming_cost: number;         // programming_time_hours x labour_rate_per_hour
  total_labour_cost: number;        // assembly labour + machine + setup + programming
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
  // ---------- TIME-BASED MODEL FIELDS ----------
  /** Whether this breakdown was computed with the time model (true) or legacy per-placement (false) */
  time_model_used: boolean;
  /** Total assembly time in hours (placement time + feeder setup, excludes programming) */
  assembly_time_hours: number;
  /** SMT-only placement time in hours (CP + CPEXP + 0402 + 0201 + IP) */
  smt_time_hours: number;
  /** TH placement time in hours */
  th_time_hours: number;
  /** MANSMT placement time in hours */
  mansmt_time_hours: number;
  /** Feeder setup time in hours (CP feeder loading + IP feeder loading + printer setup) */
  setup_time_hours_computed: number;
  /** Labour cost = total_assembly_hours (placement + setup) x labour_rate */
  labour_cost: number;
  /** Machine cost = smt_time_hours x smt_rate (machine rate only for SMT portion) */
  machine_cost: number;
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
  /** Assembly type for programming fee lookup: TB=double-sided, TS=single-sided, etc. */
  assembly_type?: string;
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
