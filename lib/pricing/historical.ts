import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Historical procurement price lookup.
 *
 * Before hitting DigiKey/Mouser/LCSC APIs, check what RS previously paid
 * for the same MPN in past procurement orders. This mirrors the Excel SOP
 * Phase G1: "Load Saved Procurement Data" which checks the Procurement
 * worksheet in the DM file (4,500+ historical part records).
 *
 * Historical prices are reference data, not authoritative. API prices are
 * preferred for new quotes, but historical is better than nothing when APIs
 * fail or for quick estimates.
 */

export interface HistoricalPrice {
  unit_price: number;
  supplier: string | null;
  supplier_pn: string | null;
  procured_at: string; // ISO date of the procurement line creation
  proc_code: string | null; // e.g. "260403 TLAN-TB085"
  age_days: number; // how old this price is
}

export interface HistoricalLookupResult {
  mpn: string;
  latest: HistoricalPrice | null;
  all: HistoricalPrice[];
}

/**
 * Look up historical procurement prices for a single MPN.
 * Returns the most recent 5 procurement records for reference.
 */
export async function lookupHistoricalPrice(
  supabase: SupabaseClient,
  mpn: string
): Promise<HistoricalLookupResult> {
  const { data: rows } = await supabase
    .from("procurement_lines")
    .select(
      "unit_price, supplier, supplier_pn, created_at, procurements(proc_code)"
    )
    .ilike("mpn", mpn)
    .not("unit_price", "is", null)
    .gt("unit_price", 0)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!rows || rows.length === 0) {
    return { mpn, latest: null, all: [] };
  }

  const now = Date.now();
  const prices: HistoricalPrice[] = rows.map((row) => {
    const procurement = row.procurements as unknown as {
      proc_code: string;
    } | null;
    const createdAt = row.created_at as string;
    const ageDays = Math.floor(
      (now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      unit_price: Number(row.unit_price),
      supplier: row.supplier,
      supplier_pn: row.supplier_pn,
      procured_at: createdAt,
      proc_code: procurement?.proc_code ?? null,
      age_days: ageDays,
    };
  });

  return { mpn, latest: prices[0], all: prices };
}

/**
 * Bulk lookup historical procurement prices for multiple MPNs at once.
 * More efficient than individual lookups for batch pricing operations.
 *
 * Returns a Map keyed by uppercase MPN for case-insensitive matching.
 */
export async function lookupHistoricalPricesBulk(
  supabase: SupabaseClient,
  mpns: string[]
): Promise<Map<string, HistoricalLookupResult>> {
  const results = new Map<string, HistoricalLookupResult>();
  if (mpns.length === 0) return results;

  // Query both original and uppercased MPNs for case-insensitive matching
  const upperMpns = mpns.map((m) => m.toUpperCase());
  const allVariants = [...new Set([...mpns, ...upperMpns])];
  const { data: rows } = await supabase
    .from("procurement_lines")
    .select(
      "mpn, unit_price, supplier, supplier_pn, created_at, procurements(proc_code)"
    )
    .in("mpn", allVariants)
    .not("unit_price", "is", null)
    .gt("unit_price", 0)
    .order("created_at", { ascending: false })
    .limit(mpns.length * 5);

  // Initialize all MPNs with empty results
  for (const mpn of mpns) {
    results.set(mpn.toUpperCase(), { mpn, latest: null, all: [] });
  }

  if (!rows || rows.length === 0) return results;

  const now = Date.now();

  // Group by MPN (uppercase for consistency)
  for (const row of rows) {
    const key = (row.mpn as string).toUpperCase();
    const result = results.get(key);
    if (!result) continue;

    const procurement = row.procurements as unknown as {
      proc_code: string;
    } | null;
    const createdAt = row.created_at as string;
    const ageDays = Math.floor(
      (now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    const price: HistoricalPrice = {
      unit_price: Number(row.unit_price),
      supplier: row.supplier,
      supplier_pn: row.supplier_pn,
      procured_at: createdAt,
      proc_code: procurement?.proc_code ?? null,
      age_days: ageDays,
    };

    // Keep only top 5 per MPN
    if (result.all.length < 5) {
      result.all.push(price);
    }
    if (!result.latest) {
      result.latest = price;
    }
  }

  return results;
}

/**
 * Look up supplier part numbers from the components table.
 * These can be used as better search keys for API calls
 * (e.g. DigiKey PN instead of generic MPN search).
 */
export async function lookupComponentSupplierPNs(
  supabase: SupabaseClient,
  mpn: string
): Promise<{
  digikey_pn: string | null;
  mouser_pn: string | null;
  lcsc_pn: string | null;
}> {
  const { data: component } = await supabase
    .from("components")
    .select("digikey_pn, mouser_pn, lcsc_pn")
    .ilike("mpn", mpn)
    .limit(1)
    .maybeSingle();

  return {
    digikey_pn: component?.digikey_pn ?? null,
    mouser_pn: component?.mouser_pn ?? null,
    lcsc_pn: component?.lcsc_pn ?? null,
  };
}

/**
 * Bulk lookup supplier part numbers from the components table.
 * Returns a Map keyed by uppercase MPN.
 */
export async function lookupComponentSupplierPNsBulk(
  supabase: SupabaseClient,
  mpns: string[]
): Promise<
  Map<
    string,
    { digikey_pn: string | null; mouser_pn: string | null; lcsc_pn: string | null }
  >
> {
  const results = new Map<
    string,
    { digikey_pn: string | null; mouser_pn: string | null; lcsc_pn: string | null }
  >();
  if (mpns.length === 0) return results;

  const upperMpns = mpns.map((m) => m.toUpperCase());
  const allVariants = [...new Set([...mpns, ...upperMpns])];
  const { data: rows } = await supabase
    .from("components")
    .select("mpn, digikey_pn, mouser_pn, lcsc_pn")
    .in("mpn", allVariants);

  if (!rows) return results;

  for (const row of rows) {
    results.set((row.mpn as string).toUpperCase(), {
      digikey_pn: row.digikey_pn ?? null,
      mouser_pn: row.mouser_pn ?? null,
      lcsc_pn: row.lcsc_pn ?? null,
    });
  }

  return results;
}

/**
 * Cache a historical price into api_pricing_cache with a 30-day TTL
 * so it shows up in the regular cache flow on subsequent lookups.
 */
export async function cacheHistoricalPrice(
  supabase: SupabaseClient,
  mpn: string,
  searchKey: string,
  historical: HistoricalPrice
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  await supabase.from("api_pricing_cache").upsert(
    {
      source: "procurement_history" as string,
      mpn,
      search_key: searchKey,
      response: {
        source: "procurement_history",
        original_supplier: historical.supplier,
        original_supplier_pn: historical.supplier_pn,
        procured_at: historical.procured_at,
        proc_code: historical.proc_code,
        age_days: historical.age_days,
      },
      unit_price: historical.unit_price,
      stock_qty: null,
      currency: "CAD",
      expires_at: expiresAt,
    },
    { onConflict: "source,search_key" }
  );
}
