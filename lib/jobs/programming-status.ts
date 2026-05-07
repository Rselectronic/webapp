// ----------------------------------------------------------------------------
// programming-status.ts
//
// Shared helper for jobs.programming_status. The DB allows three values:
//
//   'not_ready'    — default; no program on hand for this BOM revision
//   'ready'        — program is on hand and validated
//   'not_required' — board has no programming step
//
// Auto-detection at job creation:
//   If a prior job already references the same bom_id, we've programmed this
//   exact BOM revision before, so the new job starts as 'ready'. Otherwise
//   it defaults to 'not_ready' and a human flips it to 'ready' or
//   'not_required' on the job detail page.
//
// Note: we intentionally key off bom_id (the parsed BOM record) rather than
// gmp_id alone — a new BOM revision uploaded against the same GMP is
// considered a fresh program because pin/component changes can require new
// firmware.
// ----------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";

export const PROGRAMMING_STATUSES = ["not_ready", "ready", "not_required"] as const;
export type ProgrammingStatus = (typeof PROGRAMMING_STATUSES)[number];

export const PROGRAMMING_STATUS_LABELS: Record<ProgrammingStatus, string> = {
  not_ready: "Not Ready",
  ready: "Ready",
  not_required: "Not Required",
};

/**
 * Decide the initial programming_status for a brand-new job.
 *
 * Returns 'ready' if any earlier job already exists for the same bom_id,
 * 'not_ready' otherwise. On a query error we fail safe to 'not_ready' —
 * the user can still flip it manually.
 */
export async function deriveInitialProgrammingStatus(
  supabase: SupabaseClient,
  bomId: string | null | undefined
): Promise<ProgrammingStatus> {
  if (!bomId) return "not_ready";
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("bom_id", bomId);
  if (error) {
    // Don't block job creation on a stats query failure.
    console.error(
      "[programming-status] prior-job lookup failed; defaulting to not_ready:",
      error
    );
    return "not_ready";
  }
  return (count ?? 0) > 0 ? "ready" : "not_ready";
}
