/**
 * Bank of Canada FX rate fetcher.
 *
 * Uses the BoC "Valet" API — public, no auth, no rate limit you'll hit at RS
 * volume. Returns the most recent official USD/CAD rate. RS books invoices
 * at issue date, so we fetch the latest available rate at that moment and
 * snapshot it onto the invoice/payment. Once snapshotted, the rate never
 * changes — historic invoices keep their original rate even if the market
 * moves.
 *
 *   API doc: https://www.bankofcanada.ca/valet/docs
 *   Series:  FXUSDCAD  (CAD per 1 USD)
 *
 * The endpoint serves the daily noon rate published Mon-Fri afternoon. On
 * weekends/holidays the most recent business day is returned. We cache the
 * result for 6 hours per process to avoid hammering BoC if multiple invoices
 * are issued in a row.
 */

const VALET_URL =
  "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1";

interface BoCResponse {
  observations?: Array<{
    d?: string; // YYYY-MM-DD
    FXUSDCAD?: { v?: string };
  }>;
}

export interface FxRateResult {
  /** CAD per 1 USD (e.g. 1.3742). */
  rate: number;
  /** YYYY-MM-DD — the date BoC published this rate. */
  rate_date: string;
  /** "boc" if from API, "fallback" if from previous-rate fallback, "manual" reserved. */
  source: "boc" | "fallback" | "manual";
}

interface CacheEntry {
  result: FxRateResult;
  fetchedAtMs: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cache: CacheEntry | null = null;

/**
 * Fetch the latest USD→CAD rate from Bank of Canada. Throws on hard
 * network failure; caller decides whether to swallow or surface.
 *
 * For CAD invoices the caller should NOT call this — just store fx_rate_to_cad=1.
 */
export async function fetchUsdCadRate(): Promise<FxRateResult> {
  // Cache hit
  if (cache && Date.now() - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.result;
  }

  const res = await fetch(VALET_URL, {
    // Server-side fetch only; no CORS concerns.
    headers: { Accept: "application/json" },
    // BoC is fast but be defensive.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`BoC FX fetch failed: HTTP ${res.status}`);
  }

  const body = (await res.json()) as BoCResponse;
  const obs = body.observations?.[0];
  const rateStr = obs?.FXUSDCAD?.v;
  const date = obs?.d;
  if (!rateStr || !date) {
    throw new Error("BoC FX response missing observation");
  }

  const rate = Number(rateStr);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`BoC FX rate not numeric: ${rateStr}`);
  }

  const result: FxRateResult = {
    rate: Math.round(rate * 1_000_000) / 1_000_000, // 6 decimals matches DB column
    rate_date: date,
    source: "boc",
  };
  cache = { result, fetchedAtMs: Date.now() };
  return result;
}

/**
 * Fetch the USD→CAD rate as of a specific historical date. BoC's Valet API
 * accepts `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`; if no observation
 * exists on the exact date (weekend / holiday), the last available business
 * day in the window is returned. We widen the window to 7 days back to
 * always catch a published rate.
 *
 * Used for backdated invoices so the snapshotted FX matches the actual
 * issue date, not "right now."
 */
export async function fetchUsdCadRateOnDate(
  yyyymmdd: string
): Promise<FxRateResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) {
    throw new Error(`fetchUsdCadRateOnDate: invalid date "${yyyymmdd}"`);
  }
  // Widen 7 days back to cover weekends/holidays.
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - 7))
    .toISOString()
    .slice(0, 10);
  const url = `https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=${start}&end_date=${yyyymmdd}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`BoC FX historical fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as BoCResponse;
  // Pick the LAST observation in the window — the most recent business day
  // on or before the requested date.
  const obs = body.observations?.[body.observations.length - 1];
  const rateStr = obs?.FXUSDCAD?.v;
  const date = obs?.d;
  if (!rateStr || !date) {
    throw new Error(`BoC FX response empty for window ${start}..${yyyymmdd}`);
  }
  const rate = Number(rateStr);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`BoC FX rate not numeric: ${rateStr}`);
  }
  return {
    rate: Math.round(rate * 1_000_000) / 1_000_000,
    rate_date: date,
    source: "boc",
  };
}

/**
 * Resolve an FX rate for an invoice/payment, with safe fallback.
 *
 * Strategy:
 *   1. If `issuedDate` is supplied AND it's not today (Montreal), fetch
 *      the rate for that specific date — required for backdated invoices.
 *   2. Otherwise try BoC's "latest" endpoint.
 *   3. On any failure, fall back to the supplied `previousRate` (from the
 *      most recent invoice/quote for this customer), tagged source='fallback'
 *      so the UI can display a "stale rate" warning.
 *   4. If neither is available, default to 1 (caller will likely reject this
 *      but we never crash the issue-invoice flow on a network blip).
 */
export async function resolveFxRate(
  currency: "CAD" | "USD",
  previousRate?: number | null,
  issuedDate?: string | null
): Promise<FxRateResult> {
  if (currency === "CAD") {
    return { rate: 1, rate_date: new Date().toISOString().slice(0, 10), source: "boc" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const useHistorical =
    !!issuedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(issuedDate) &&
    issuedDate !== today;

  try {
    return useHistorical
      ? await fetchUsdCadRateOnDate(issuedDate!)
      : await fetchUsdCadRate();
  } catch (err) {
    console.warn("[fx/boc] live fetch failed, using fallback", err);
    if (previousRate && previousRate > 0) {
      return {
        rate: previousRate,
        rate_date: issuedDate ?? today,
        source: "fallback",
      };
    }
    return {
      rate: 1,
      rate_date: issuedDate ?? today,
      source: "fallback",
    };
  }
}
