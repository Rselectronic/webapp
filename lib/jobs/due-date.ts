// ----------------------------------------------------------------------------
// due-date.ts
//
// Compute a job's customer-facing due_date from the matching quote tier's
// lead time. Two-step:
//
//   1. parseLeadTimeDays("3 Weeks") → 21
//      Accepts "<n> weeks", "<n> wks", "<n> days", "<n> business days",
//      with optional whitespace and case-insensitive units. Business days
//      are converted to calendar days using the standard 5/7 ratio
//      (i.e. 5 business days = 7 calendar days). Returns null if the
//      string is unparseable ("TBD", "ASAP", etc.) — caller decides how to
//      handle.
//
//   2. computeDueDate({ leadTimes, tierIndex, baseDate }) → "YYYY-MM-DD"
//      Looks up tier_${tierIndex+1} in the JSONB blob, parses, adds.
//      Returns null when any input is missing.
//
// Helper for both job-creation paths (`/api/jobs` and `/api/jobs/from-po`).
// ----------------------------------------------------------------------------

export type LeadTimes = Record<string, string> | null | undefined;

/**
 * Parse a free-form lead-time string into a number of calendar days.
 * Returns null if the string can't be parsed.
 */
export function parseLeadTimeDays(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // "<n> business day(s)" — convert to calendar days at 5/7 ratio.
  const businessMatch = s.match(/^(\d+)\s*(?:business|biz|working|work)\s*days?$/);
  if (businessMatch) {
    const n = parseInt(businessMatch[1], 10);
    if (Number.isFinite(n)) return Math.ceil((n * 7) / 5);
  }

  // "<n> week(s)" or "<n> wk(s)"
  const weekMatch = s.match(/^(\d+)\s*(?:weeks?|wks?)$/);
  if (weekMatch) {
    const n = parseInt(weekMatch[1], 10);
    if (Number.isFinite(n)) return n * 7;
  }

  // "<n> day(s)" / "<n> d"
  const dayMatch = s.match(/^(\d+)\s*(?:days?|d)$/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    if (Number.isFinite(n)) return n;
  }

  // Bare number — assume calendar days.
  const bare = s.match(/^(\d+)$/);
  if (bare) {
    const n = parseInt(bare[1], 10);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

/** Add `days` calendar days to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface ComputeDueDateInput {
  /** lead_times JSONB from the quote, e.g. { tier_1: "3 Weeks", tier_2: "4 Weeks" } */
  leadTimes: LeadTimes;
  /** 0-based tier index (the tier in the quote's pricing.tiers array). */
  tierIndex: number;
  /** Base date to add the lead time to. Usually the PO date or today. */
  baseDate: string | Date;
}

/**
 * Compute the customer-facing due date for a job. Returns the
 * YYYY-MM-DD string or null if any input is missing / unparseable.
 */
export function computeDueDate(input: ComputeDueDateInput): string | null {
  const { leadTimes, tierIndex, baseDate } = input;
  if (!leadTimes || typeof leadTimes !== "object") return null;
  if (!Number.isInteger(tierIndex) || tierIndex < 0) return null;

  const key = `tier_${tierIndex + 1}`;
  const raw = (leadTimes as Record<string, unknown>)[key];
  const days = parseLeadTimeDays(typeof raw === "string" ? raw : null);
  if (days === null) return null;

  // Normalise baseDate to YYYY-MM-DD.
  let base: string;
  if (baseDate instanceof Date) {
    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, "0");
    const dd = String(baseDate.getDate()).padStart(2, "0");
    base = `${yyyy}-${mm}-${dd}`;
  } else {
    base = baseDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  }

  return addDays(base, days);
}

/**
 * Convenience: given a quote's pricing.tiers array and a job quantity,
 * find the index of the matching tier (the tier whose board_qty <= the
 * job quantity, picking the highest such tier). Returns null if no tier
 * matches.
 */
export function findMatchingTierIndex(
  tiers: { board_qty: number }[] | null | undefined,
  jobQuantity: number
): number | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  // Sort a copy by board_qty asc so we can scan and pick the largest tier
  // that still fits the job quantity.
  const indexed = tiers.map((t, i) => ({ board_qty: t.board_qty, i }));
  indexed.sort((a, b) => a.board_qty - b.board_qty);
  let matchIdx: number | null = null;
  for (const row of indexed) {
    if (row.board_qty <= jobQuantity) matchIdx = row.i;
  }
  return matchIdx;
}
