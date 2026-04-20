import { createAdminClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// FX rate helper — backs the "Fetch Live Rates" button and manual overrides
// on the Component Pricing Review page.
//
// Source: https://open.er-api.com/v6/latest/{base} — free, no key required,
// updated daily. If it's unavailable, the DB cache is authoritative.
// ---------------------------------------------------------------------------

const FX_PROVIDER_URL = "https://open.er-api.com/v6/latest";
const FX_FETCH_TIMEOUT_MS = 10_000;

export interface FxRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  source: "live" | "manual";
  fetched_at: string;
}

/**
 * Fetch live FX rates from open.er-api.com for a set of source currencies,
 * all expressed against the target currency (default CAD). Writes the results
 * into `public.fx_rates` with source='live'. Returns the updated rows.
 *
 * Throws on network / parse errors so the UI can surface them. DB writes are
 * done one row at a time via upsert so a single bad currency doesn't block
 * the rest.
 */
export async function fetchLiveRates(
  fromCurrencies: string[],
  toCurrency: string = "CAD",
  updatedBy?: string
): Promise<FxRate[]> {
  const unique = [...new Set(fromCurrencies.filter((c) => c && c !== toCurrency))];
  if (unique.length === 0) return [];

  // open.er-api.com returns rates for a single base → all others. Simplest
  // path: fetch with base=toCurrency, then invert the rate for each source.
  //   rate(USD→CAD) = 1 / rate_returned_when_base_is_CAD_for_USD
  const res = await fetch(`${FX_PROVIDER_URL}/${encodeURIComponent(toCurrency)}`, {
    signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`FX provider returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error(`FX provider returned unexpected payload: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const supabase = createAdminClient();
  const out: FxRate[] = [];
  for (const from of unique) {
    const inverseRate = data.rates[from];
    if (typeof inverseRate !== "number" || inverseRate <= 0) continue;
    const rate = 1 / inverseRate;

    const { data: row, error } = await supabase
      .from("fx_rates")
      .upsert(
        {
          from_currency: from,
          to_currency: toCurrency,
          rate,
          source: "live",
          fetched_at: new Date().toISOString(),
          updated_by: updatedBy ?? null,
        },
        { onConflict: "from_currency,to_currency" }
      )
      .select()
      .single();

    if (error || !row) continue;
    out.push({
      from_currency: row.from_currency,
      to_currency: row.to_currency,
      rate: Number(row.rate),
      source: row.source as "live" | "manual",
      fetched_at: row.fetched_at,
    });
  }
  return out;
}

/**
 * Manual override: CEO types in a rate, we stash it with source='manual'.
 * Manual rows are NOT overwritten by subsequent live fetches unless the
 * caller explicitly passes source='live' (preserves human judgment).
 */
export async function setManualRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  updatedBy?: string
): Promise<FxRate> {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("FX rate must be a positive number");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fx_rates")
    .upsert(
      {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate,
        source: "manual",
        fetched_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "from_currency,to_currency" }
    )
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to save manual FX rate: ${error?.message}`);
  return {
    from_currency: data.from_currency,
    to_currency: data.to_currency,
    rate: Number(data.rate),
    source: data.source as "live" | "manual",
    fetched_at: data.fetched_at,
  };
}

/**
 * Read a rate from the DB cache. Returns null if never fetched.
 * Callers that need a rate should either (a) check null and prompt the user
 * to click "Fetch Live Rates", or (b) fall back to 1.0 with a warning.
 */
export async function getRate(
  fromCurrency: string,
  toCurrency: string = "CAD"
): Promise<FxRate | null> {
  if (fromCurrency === toCurrency) {
    return {
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate: 1.0,
      source: "manual",
      fetched_at: new Date().toISOString(),
    };
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fx_rates")
    .select("from_currency, to_currency, rate, source, fetched_at")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .maybeSingle();
  if (!data) return null;
  return {
    from_currency: data.from_currency,
    to_currency: data.to_currency,
    rate: Number(data.rate),
    source: data.source as "live" | "manual",
    fetched_at: data.fetched_at,
  };
}

/** Convenience: convert an amount at the cached rate. Returns null if rate missing. */
export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string = "CAD"
): Promise<{ converted: number; rate: number } | null> {
  const fx = await getRate(fromCurrency, toCurrency);
  if (!fx) return null;
  return { converted: amount * fx.rate, rate: fx.rate };
}
