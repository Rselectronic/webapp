import type { MCode } from "@/lib/mcode/types";

// ---------------------------------------------------------------------------
// Unified supplier quote shape — every distributor client normalizes to this.
// Used by the Component Pricing Review page to render apples-to-apples rows
// across DigiKey, Mouser, Avnet, Arrow, TTI, Newark, Samtec, TI, TME, Future,
// e-Sonic, and LCSC.
// ---------------------------------------------------------------------------

export interface PriceBreak {
  min_qty: number;
  /** null = open-ended upper bound (e.g. "10000+") */
  max_qty: number | null;
  unit_price: number;
  currency: string;
}

export interface SupplierQuote {
  source: string;                      // supplier name (digikey, mouser, avnet, ...)
  mpn: string;
  manufacturer: string | null;
  supplier_part_number: string | null;
  /** Unit price at smallest qty tier, in the supplier's native currency */
  unit_price: number;
  currency: string;
  price_breaks: PriceBreak[];
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  /** Normalized to days. null if the supplier doesn't expose lead time. */
  lead_time_days: number | null;
  /** Distributor-specific warehouse identifier — only populated by multi-warehouse suppliers (Arrow, Newark). */
  warehouse_code: string | null;
  /** Non-Cancelable / Non-Returnable flag */
  ncnr: boolean | null;
  /** True when the distributor sources this part through authorized manufacturer channels */
  franchised: boolean | null;
  lifecycle_status: string | null;     // "ACTIVE" / "OBSOLETE" / "Production" / etc.
  datasheet_url: string | null;
  product_url: string | null;
  /**
   * Full-text product description from the distributor (e.g.
   * "SMT 0603 0.1 uF 50 V ±10% X7R Capacitor, AEC-Q200"). Optional —
   * some suppliers return very short / marketing-style descriptions, and
   * consumers typically pick the longest across all returned quotes.
   */
  description?: string | null;
}

export interface PricingLine {
  bom_line_id: string;
  mpn: string;
  cpc?: string | null;
  description: string;
  m_code: MCode | null;
  qty_per_board: number;
  unit_price: number | null;
  price_source: "cache" | "digikey" | "mouser" | "lcsc" | "historical" | "manual" | null;
  /** Number of through-hole pins for this line. Used for true per-pin TH time. */
  pin_count?: number | null;
}

export interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

export interface PricingSettings {
  component_markup_pct: number;
  pcb_markup_pct: number;
  /** Margin applied on the computed assembly cost (labour + machine for the
   *  time model, or per-placement for the legacy model). Default 30%. Per-
   *  quote override lives on quotes.assembly_markup_pct_override. */
  assembly_markup_pct: number;
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
  nre_pcb_fab: number;
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
  // ---------- LABOUR_SETTINGS OVERLAY (migration 059) ----------
  // These fields are populated by applyLabourOverlay() when a labour_settings
  // row is active. All optional — when absent, engine falls back to the
  // CPH-based model above.
  /** SMT reflow oven length in millimeters (for throughput bottleneck). */
  oven_length_mm?: number | null;
  /** SMT conveyor speed in mm/sec (for throughput bottleneck). */
  conveyor_mm_per_sec?: number | null;
  /** Number of reflow passes (1 = top-only, 2 = double-sided). */
  reflow_passes?: number | null;
  /** TH placement base time in seconds/part. When set with th_per_pin_seconds, overrides th_cph. */
  th_base_seconds?: number | null;
  /** TH placement time per pin in seconds/pin. Multiplied by bom_lines.pin_count. */
  th_per_pin_seconds?: number | null;
  /** First-article inspection minutes (one-time, added to setup). */
  first_article_minutes?: number | null;
  /** Per-board inspection minutes. */
  inspection_minutes_per_board?: number | null;
  /** Per-board touch-up minutes. */
  touchup_minutes_per_board?: number | null;
  /** Per-board packing minutes. */
  packing_minutes_per_board?: number | null;
  /** Depanelisation time in seconds per board (only applies when boards_per_panel > 1). */
  depanel_seconds_per_board?: number | null;
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
  // Markup breakdown for cost transparency
  component_cost_before_markup: number;
  component_markup_amount: number;
  component_markup_pct: number;
  pcb_cost_before_markup: number;
  pcb_markup_amount: number;
  pcb_markup_pct: number;
  // Assembly markup breakdown — same pattern as component / PCB. The
  // displayed assembly_cost is post-markup; the engine exposes the
  // before-markup figure + the markup amount for transparency.
  assembly_cost_before_markup: number;
  assembly_markup_amount: number;
  assembly_markup_pct: number;
  // Overage breakdown — how much of component_cost is overage extras
  overage_cost: number;
  overage_qty: number;
  // Per-line cost breakdown for this tier — used by the UI's "Expand line
  // math" toggle and for diffing against the Excel system when numbers don't
  // match. Always populated so the information is available on demand.
  line_breakdowns?: LineCostBreakdown[];
  // Labour breakdown
  labour: LabourBreakdown;
}

export interface LineCostBreakdown {
  bom_line_id: string;
  mpn: string;
  cpc?: string | null;
  m_code: string | null;
  qty_per_board: number;
  board_qty: number;
  overage_extras: number;
  order_qty: number;          // qty_per_board × board_qty + overage_extras
  unit_price: number;         // CAD, post-FX. 0 when no price resolved.
  unit_price_source: "override" | "cache" | "missing";
  markup_pct: number;
  extended_before_markup: number; // unit_price × order_qty
  extended_after_markup: number;  // extended_before_markup × (1 + markup/100)
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
  nre_pcb_fab: number;
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
  /** Physical board layout for programming fee lookup. Sourced from
   *  `gmps.board_side`. 'double' = top + bottom SMT, 'single' = top only. */
  board_side?: "single" | "double" | null;
  /** How many individual boards are built per SMT panel. Drives oven throughput
   *  (panels-through-oven, not boards) and depanelisation cost. Default 1. */
  boards_per_panel?: number;
  /**
   * Per-BOM-line per-tier unit-price overrides in CAD, from the Component
   * Pricing Review page (`bom_line_pricing` table). When present for a given
   * (line_id, tier_qty) pair, takes precedence over `line.unit_price`. Absent
   * entries fall back to the supplier-cache price as before.
   *
   * Shape: bom_line_id → (tier_qty → unit_price_cad).
   */
  pricing_overrides?: Map<string, Map<number, number>>;
}

export interface MissingPriceComponent {
  mpn: string;           // may be CPC or bom_line_id if real MPN is missing
  description: string;
  qty_per_board: number;
  bom_line_id?: string;  // for lookup when MPN is empty
  cpc?: string | null;   // customer part code (fallback identifier)
}

export interface QuotePricing {
  tiers: PricingTier[];
  warnings: string[];
  missing_price_components?: MissingPriceComponent[];
}
