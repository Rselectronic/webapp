import type { PricingSettings } from "./types";

// ---------------------------------------------------------------------------
// labour-overlay
//
// Converts the new `labour_settings` row (migration 059) into an overlay on
// the existing PricingSettings shape used by lib/pricing/engine.ts, so the
// quote engine can consume the new burdened-rate + seconds-per-part model
// without the engine needing to know the new schema exists yet.
//
// Mapping:
//   burdened_rate_per_hour         → labour_rate_per_hour AND smt_rate_per_hour
//                                    (single unified burdened rate replaces
//                                    the two separate flat rates)
//   cycle_cp_seconds (sec/part)    → cp_cph = 3600 / cycle_cp_seconds
//   cycle_0402_seconds             → small_cph
//   cycle_0201_seconds             → ultra_small_cph
//   cycle_ip_seconds               → ip_cph
//   cycle_mansmt_seconds           → mansmt_cph
//   cycle_th_base_seconds +        → th_cph (approx — engine does per-part,
//     cycle_th_per_pin_seconds       per-pin refinement is a follow-up)
//   feeder_setup_minutes_each      → cp_load_time_min / ip_load_time_min
//   smt_line_setup_minutes         → printer_setup_min (per side)
//
// Any field that is null on the labour_settings row is left alone so the
// engine's own defaults or the user's pricing_settings row fills the gap.
// ---------------------------------------------------------------------------

export interface LabourSettingsRow {
  monthly_overhead: number;
  production_staff_count: number;
  hours_per_day: number;
  days_per_month: number;
  utilization_pct: number;
  burdened_rate_per_hour: number | null;
  conveyor_mm_per_sec: number | null;
  oven_length_mm: number | null;
  reflow_passes_default: number | null;
  cycle_cp_seconds: number | null;
  cycle_0402_seconds: number | null;
  cycle_0201_seconds: number | null;
  cycle_ip_seconds: number | null;
  cycle_mansmt_seconds: number | null;
  cycle_th_base_seconds: number | null;
  cycle_th_per_pin_seconds: number | null;
  cycle_depanel_seconds: number | null;
  smt_line_setup_minutes: number | null;
  feeder_setup_minutes_each: number | null;
  first_article_minutes: number | null;
  inspection_minutes_per_board: number | null;
  touchup_minutes_per_board: number | null;
  packing_minutes_per_board: number | null;
}

function secToCph(sec: number | null | undefined): number | undefined {
  if (sec === null || sec === undefined) return undefined;
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return undefined;
  return 3600 / s;
}

/**
 * Apply labour_settings on top of the stored PricingSettings. Fields present
 * on the labour_settings row take precedence; nulls fall through.
 */
export function applyLabourOverlay(
  base: PricingSettings,
  labour: LabourSettingsRow | null | undefined
): PricingSettings {
  if (!labour) return base;

  const burdened = labour.burdened_rate_per_hour
    ? Number(labour.burdened_rate_per_hour)
    : null;

  const cpCph = secToCph(labour.cycle_cp_seconds);
  const smallCph = secToCph(labour.cycle_0402_seconds);
  const ultraSmallCph = secToCph(labour.cycle_0201_seconds);
  const ipCph = secToCph(labour.cycle_ip_seconds);
  const mansmtCph = secToCph(labour.cycle_mansmt_seconds);
  // TH: keep a CPH fallback (base time only, assuming 0 pins) for cases where
  // the engine doesn't have pin_count available. The engine prefers the
  // per-line per-pin formula when th_base_seconds + th_per_pin_seconds are set.
  const thCph = secToCph(labour.cycle_th_base_seconds);

  return {
    ...base,
    // Unified burdened rate replaces the separate labour + smt rates.
    labour_rate_per_hour:
      burdened !== null && Number.isFinite(burdened)
        ? burdened
        : base.labour_rate_per_hour,
    smt_rate_per_hour:
      burdened !== null && Number.isFinite(burdened)
        ? burdened
        : base.smt_rate_per_hour,
    cp_cph: cpCph ?? base.cp_cph,
    small_cph: smallCph ?? base.small_cph,
    ultra_small_cph: ultraSmallCph ?? base.ultra_small_cph,
    ip_cph: ipCph ?? base.ip_cph,
    th_cph: thCph ?? base.th_cph,
    mansmt_cph: mansmtCph ?? base.mansmt_cph,
    cp_load_time_min:
      labour.feeder_setup_minutes_each ?? base.cp_load_time_min,
    ip_load_time_min:
      labour.feeder_setup_minutes_each ?? base.ip_load_time_min,
    printer_setup_min:
      labour.smt_line_setup_minutes ?? base.printer_setup_min,
    use_time_model: true,
    // Raw labour_settings fields consumed directly by the engine
    oven_length_mm: labour.oven_length_mm,
    conveyor_mm_per_sec: labour.conveyor_mm_per_sec,
    reflow_passes: labour.reflow_passes_default,
    th_base_seconds: labour.cycle_th_base_seconds,
    th_per_pin_seconds: labour.cycle_th_per_pin_seconds,
    depanel_seconds_per_board: labour.cycle_depanel_seconds,
    first_article_minutes: labour.first_article_minutes,
    inspection_minutes_per_board: labour.inspection_minutes_per_board,
    touchup_minutes_per_board: labour.touchup_minutes_per_board,
    packing_minutes_per_board: labour.packing_minutes_per_board,
  };
}
