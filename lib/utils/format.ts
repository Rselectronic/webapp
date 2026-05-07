/**
 * RS PCB Assembly is a Montreal-based business. Every date the user sees
 * — on screen, in PDFs, in CSV exports — should reflect the Montreal
 * calendar regardless of where the server is hosted (Vercel runs UTC by
 * default) or what timezone the user's browser is in (Piyush in India,
 * Anas in Montreal).
 *
 * The DB stores `TIMESTAMPTZ` columns in UTC (correct, untouched). The
 * helpers below translate to Montreal at display time. For `DATE` columns
 * — which are calendar values without a timezone — use `todayMontreal()`
 * at WRITE time so the right day is committed in the first place.
 */
const RS_TIMEZONE = "America/Toronto" as const;

/**
 * Format a number as Canadian dollars (CAD).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

/**
 * Format a phone number for display.
 * Input: "+14388338477" or "4388338477"
 * Output: "+1 (438) 833-8477"
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/**
 * Format a date string for display in Montreal time.
 * Input: ISO 8601 string (TIMESTAMPTZ) or "YYYY-MM-DD" (DATE)
 * Output: "Apr 3, 2026"
 *
 * For TIMESTAMPTZ inputs the UTC instant is converted to Montreal
 * calendar day. For DATE inputs (no time component) the formatter
 * receives midnight UTC and we explicitly anchor the display to
 * Montreal so the displayed day matches the stored day.
 */
export function formatDate(dateStr: string): string {
  // A bare "YYYY-MM-DD" string from a DATE column is parsed by JS as
  // midnight UTC. Re-anchoring to Montreal would shift it back a day at
  // display time. Detect this case and format as a plain calendar date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: RS_TIMEZONE,
  });
}

/**
 * Format a date string with time, in Montreal time.
 * Output: "Apr 3, 2026 2:30 PM"
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: RS_TIMEZONE,
  });
}

/**
 * Today's date as a "YYYY-MM-DD" string in Montreal calendar time.
 *
 * USE THIS — never `new Date().toISOString().slice(0, 10)` — when writing
 * to a DATE column (e.g. `po_date`, `payment_date`, `due_date`,
 * `paid_date`, `issued_date`). On a UTC server (Vercel default), the raw
 * `toISOString()` approach rolls over to the next day at 8 PM Montreal
 * because UTC has already crossed midnight. This helper always returns
 * the Montreal wall-calendar day.
 */
export function todayMontreal(): string {
  // en-CA's `toLocaleDateString` returns ISO-style "YYYY-MM-DD" by
  // default, which is exactly what Postgres expects for a DATE column.
  return new Date().toLocaleDateString("en-CA", { timeZone: RS_TIMEZONE });
}

/**
 * A specific instant rendered as a "YYYY-MM-DD" Montreal calendar day.
 * Use when you have a TIMESTAMPTZ value and need to derive a DATE for
 * storage.
 */
export function toMontrealDate(instant: Date | string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return d.toLocaleDateString("en-CA", { timeZone: RS_TIMEZONE });
}

/**
 * Invoice number for new invoices: `RSINV_YYYYMMDDhhmmss` in Montreal
 * local time (e.g. `RSINV_20260430210347`). Matches the prefix RS used
 * in its legacy system, so accountants and customers see continuity.
 *
 * Replaces the older `INV-YYMM-NNN` count-based scheme. Globally unique
 * at second resolution — at RS volume that's effectively collision-free,
 * and the UNIQUE constraint on `invoices.invoice_number` is the
 * canonical guard if it ever isn't.
 *
 * All 14 timestamp digits read from `Intl.DateTimeFormat` with timeZone
 * pinned to America/Toronto, so the result is identical regardless of
 * where the server runs (Vercel UTC) or which user triggers the invoice
 * (Anas in Montreal vs Piyush in India).
 */
export function montrealInvoiceNumber(issueDateOverride?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // Date portion: if a backdated issue date is supplied, use it so the
  // invoice number's date prefix matches the document's issued_date.
  // Otherwise use today (Montreal). The TIME portion always reflects NOW —
  // that keeps the number globally unique even when two backdated invoices
  // are issued for the same calendar day.
  let yyyy: string, mm: string, dd: string;
  if (issueDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(issueDateOverride)) {
    [yyyy, mm, dd] = issueDateOverride.split("-");
  } else {
    yyyy = get("year");
    mm = get("month");
    dd = get("day");
  }
  // Some Node versions render midnight as "24" with hour12:false; normalize.
  let hh = get("hour");
  if (hh === "24") hh = "00";
  const mi = get("minute");
  const ss = get("second");
  return `RSINV_${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

/**
 * Today's Montreal calendar day plus `days` (negative supported), as
 * "YYYY-MM-DD". Use for things like `due_date = today + payment_terms`
 * where the offset is in calendar days.
 *
 * Implementation note: arithmetic is done in UTC to avoid local-tz
 * shenanigans (Date.UTC + .setUTCDate). The starting calendar day is
 * pulled from Montreal so DST and end-of-day rollovers are handled.
 */
export function addDaysMontreal(days: number): string {
  const today = todayMontreal(); // "YYYY-MM-DD" in Montreal
  const [y, m, d] = today.split("-").map(Number);
  const stamp = new Date(Date.UTC(y, m - 1, d));
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

/**
 * Calendar-day arithmetic on an arbitrary YYYY-MM-DD anchor (no
 * timezone — DATE columns are calendar values). Used when an invoice's
 * issue date is overridden so the due date follows the override instead
 * of "today + net days".
 */
export function addDaysToDate(yyyymmdd: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return yyyymmdd;
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const stamp = new Date(Date.UTC(y, m - 1, d));
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}
