/**
 * Revenue period bucketing with FY-aware boundaries.
 *
 * RS files on accrual basis, so revenue is bucketed by `invoices.issued_date`
 * (when the invoice was issued, not when payment landed). Cancelled invoices
 * are excluded by the caller.
 *
 * RS uses two non-standard fiscal years:
 *   - Tax (GST/QST):  Nov 1 → Oct 31
 *   - Financial:      Oct 1 → Sep 30
 *
 * The Calendar mode (Jan–Dec) is also offered for sanity-checking against
 * other tools.
 *
 * "FY year" is named by its END year. So "Tax FY 2026" = Nov 2025 → Oct 2026.
 */
import { todayMontreal } from "@/lib/utils/format";

export type FYMode = "calendar" | "tax" | "financial";
export type Period = "month" | "quarter" | "semi" | "annual";

export type CurrencyView = "cad_equiv" | "cad_only" | "usd_only";

export interface RevenueBucket {
  label: string;
  /** Inclusive start (YYYY-MM-DD). */
  start: string;
  /** Exclusive end (YYYY-MM-DD). */
  end: string;
  /** Sum of invoice totals, expressed in the active currency view. */
  invoiced: number;
  /** Federal GST (5%) collected. CAD-equiv when view requires CAD-equiv. */
  gst: number;
  /** Quebec QST (9.975%) collected. CAD-equiv when view requires CAD-equiv. */
  qst: number;
  /** Harmonized HST (13% / 15%) collected. CAD-equiv when view requires CAD-equiv. */
  hst: number;
  invoiceCount: number;
}

export interface RevenueInvoice {
  issued_date: string | null;
  total: number | null;
  tps_gst: number | null;
  tvq_qst: number | null;
  hst: number | null;
  currency: "CAD" | "USD" | null;
  fx_rate_to_cad: number | null;
  status: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_company: string | null;
}

// FY mode → (start month index 0-11, start day) for the FY START boundary.
// FY year is named by end year, so the start is one calendar year earlier
// when the FY straddles New Year.
function fyBounds(mode: FYMode, fyYear: number): { start: Date; end: Date } {
  if (mode === "calendar") {
    return {
      start: new Date(Date.UTC(fyYear, 0, 1)),
      end: new Date(Date.UTC(fyYear + 1, 0, 1)),
    };
  }
  if (mode === "tax") {
    // Nov 1 (year-1) → Nov 1 (year)
    return {
      start: new Date(Date.UTC(fyYear - 1, 10, 1)),
      end: new Date(Date.UTC(fyYear, 10, 1)),
    };
  }
  // financial: Oct 1 (year-1) → Oct 1 (year)
  return {
    start: new Date(Date.UTC(fyYear - 1, 9, 1)),
    end: new Date(Date.UTC(fyYear, 9, 1)),
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Build the sequence of buckets for a given (mode, fyYear, period).
 *
 * Bucket counts:
 *   - month:    12
 *   - quarter:  4
 *   - semi:     2
 *   - annual:   1
 */
function buildEmptyBuckets(
  mode: FYMode,
  fyYear: number,
  period: Period
): RevenueBucket[] {
  const { start, end } = fyBounds(mode, fyYear);
  const out: RevenueBucket[] = [];

  const stepMonths =
    period === "month" ? 1 : period === "quarter" ? 3 : period === "semi" ? 6 : 12;

  let cursor = new Date(start);
  let idx = 1;
  while (cursor < end) {
    const next = addMonths(cursor, stepMonths);
    const cap = next > end ? end : next;
    const label = labelFor(period, idx, cursor, addMonths(cap, 0));
    out.push({
      label,
      start: ymd(cursor),
      end: ymd(cap),
      invoiced: 0,
      gst: 0,
      qst: 0,
      hst: 0,
      invoiceCount: 0,
    });
    cursor = next;
    idx += 1;
  }

  return out;
}

function labelFor(
  period: Period,
  idx: number,
  start: Date,
  end: Date
): string {
  if (period === "month") {
    return `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }
  if (period === "quarter") {
    const last = addMonths(end, -1);
    return `Q${idx} (${MONTH_SHORT[start.getUTCMonth()]}–${MONTH_SHORT[last.getUTCMonth()]} ${last.getUTCFullYear()})`;
  }
  if (period === "semi") {
    const last = addMonths(end, -1);
    const half = idx === 1 ? "H1" : "H2";
    return `${half} (${MONTH_SHORT[start.getUTCMonth()]}–${MONTH_SHORT[last.getUTCMonth()]} ${last.getUTCFullYear()})`;
  }
  // annual
  const last = addMonths(end, -1);
  return `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCFullYear()} – ${MONTH_SHORT[last.getUTCMonth()]} ${last.getUTCFullYear()}`;
}

/**
 * Bucket a list of invoices into revenue periods, in the requested currency
 * view. Cancelled invoices and those with a null issued_date are skipped.
 *
 * Currency views:
 *   - cad_equiv: every amount is multiplied by the invoice's fx_rate_to_cad
 *     before bucketing. Use this for FY totals and tax-filing remittance
 *     numbers (CRA wants CAD).
 *   - cad_only:  filter to currency='CAD', sum native (no FX applied).
 *   - usd_only:  filter to currency='USD', sum native (no FX applied) — the
 *     user sees the same USD totals their customer sees on the invoices.
 */
export function bucketRevenue(
  invoices: RevenueInvoice[],
  opts: {
    mode: FYMode;
    fyYear: number;
    period: Period;
    currencyView?: CurrencyView;
  }
): RevenueBucket[] {
  const view: CurrencyView = opts.currencyView ?? "cad_equiv";
  const buckets = buildEmptyBuckets(opts.mode, opts.fyYear, opts.period);
  if (buckets.length === 0) return [];

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    if (!inv.issued_date) continue;

    const cur = (inv.currency ?? "CAD") as "CAD" | "USD";
    if (view === "cad_only" && cur !== "CAD") continue;
    if (view === "usd_only" && cur !== "USD") continue;

    // Multiplier: for CAD-equiv view, USD invoices are converted using the
    // snapshotted rate; for cad_only / usd_only the native amount is summed
    // unchanged. CAD invoices always have rate=1.
    const fx = Number(inv.fx_rate_to_cad ?? 1);
    const mul = view === "cad_equiv" ? fx : 1;

    const d = inv.issued_date;
    const b = buckets.find((bk) => d >= bk.start && d < bk.end);
    if (!b) continue;

    b.invoiced += Number(inv.total ?? 0) * mul;
    b.gst += Number(inv.tps_gst ?? 0) * mul;
    b.qst += Number(inv.tvq_qst ?? 0) * mul;
    b.hst += Number(inv.hst ?? 0) * mul;
    b.invoiceCount += 1;
  }

  for (const b of buckets) {
    b.invoiced = Math.round(b.invoiced * 100) / 100;
    b.gst = Math.round(b.gst * 100) / 100;
    b.qst = Math.round(b.qst * 100) / 100;
    b.hst = Math.round(b.hst * 100) / 100;
  }

  return buckets;
}

export const CURRENCY_VIEW_LABELS: Record<CurrencyView, string> = {
  cad_equiv: "CAD-equivalent (for tax filing)",
  cad_only: "CAD invoices only",
  usd_only: "USD invoices only",
};

/**
 * Default FY year for display: the FY that contains today's Montreal date.
 * FY year is the END year of the fiscal year.
 */
export function currentFYYear(mode: FYMode): number {
  const today = todayMontreal(); // YYYY-MM-DD
  const [y, m] = today.split("-").map(Number);
  if (mode === "calendar") return y;
  // For Tax FY (Nov–Oct), Nov+Dec belong to NEXT FY year (named by end).
  if (mode === "tax") return m >= 11 ? y + 1 : y;
  // Financial FY (Oct–Sep): Oct/Nov/Dec belong to NEXT FY year.
  return m >= 10 ? y + 1 : y;
}

/**
 * Period bucket ranges (label + inclusive start + exclusive end) for a
 * given FY mode + year + granularity. Same math the revenue table uses,
 * exposed without dragging the invoice loop along — callers that just
 * need the FY-aware date boundaries (e.g. the customer-statement period
 * picker) can use this directly.
 */
export function fyBucketRanges(
  mode: FYMode,
  fyYear: number,
  period: Period
): Array<{ label: string; start: string; end: string }> {
  return buildEmptyBuckets(mode, fyYear, period).map((b) => ({
    label: b.label,
    start: b.start,
    end: b.end,
  }));
}

export const FY_LABELS: Record<FYMode, string> = {
  calendar: "Calendar (Jan–Dec)",
  tax: "Tax FY (Nov–Oct)",
  financial: "Financial FY (Oct–Sep)",
};

export const PERIOD_LABELS: Record<Period, string> = {
  month: "Month",
  quarter: "Quarter",
  semi: "Semi-Annual",
  annual: "Annual",
};
