import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSupplierSearch, supplierCanServiceMpn } from "@/lib/pricing/registry";
import { getRate } from "@/lib/pricing/fx";
import type { SupplierQuote, PriceBreak } from "@/lib/pricing/types";
import type { BuiltInSupplierName } from "@/lib/supplier-credentials";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Concurrency controls. 12 suppliers × ~200 BOM lines = 2400 potential calls.
// Run 6 suppliers in parallel per line, 4 lines at a time → max 24 in flight.
const LINE_CONCURRENCY = 4;

/**
 * Suppliers that return a single price for the quantity they were called with.
 * For these we have to call N times (one per tier's order_qty) and merge the
 * results into a synthetic price_breaks array. Every other supplier returns a
 * full price-break table in one call and is queried once.
 */
const SINGLE_QTY_SUPPLIERS: ReadonlySet<BuiltInSupplierName> = new Set(["avnet"]);

interface FetchBody {
  /** Which suppliers to query. Must be subset of BuiltInSupplierName. */
  suppliers: string[];
  /** Optional: limit to specific BOM line ids (refresh a single row). */
  bom_line_ids?: string[];
  /** Reporting currency for CAD-converted unit prices. Defaults to "CAD". */
  reporting_currency?: string;
  /**
   * Per-line tier order quantities: `{ [bom_line_id]: [orderQty_tier1, ...] }`.
   * Computed by the panel as `qty_per_board × tier_qty + overage_extras`. Used
   * to drive per-tier API calls for single-qty suppliers (Avnet).
   */
  tier_order_qtys?: Record<string, number[]>;
}

interface LineResult {
  bom_line_id: string;
  mpn: string | null;
  cpc: string | null;
  manufacturer: string | null;
  quotes: Array<SupplierQuote & {
    unit_price_cad: number | null;
    fx_rate_applied: number | null;
  }>;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  if (!UUID_RE.test(bomId)) {
    return NextResponse.json({ error: "Invalid BOM id" }, { status: 400 });
  }

  let body: FetchBody;
  try {
    body = (await req.json()) as FetchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.suppliers) || body.suppliers.length === 0) {
    return NextResponse.json({ error: "suppliers[] required" }, { status: 400 });
  }
  const suppliers = body.suppliers as BuiltInSupplierName[];
  const reportingCurrency = body.reporting_currency ?? "CAD";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  // --- Load BOM lines we actually need priced ---
  // Skip: PCB rows, DNI rows, and qty=0 rows (not-installed placeholders
  // kept only for the production print-out — nothing to buy or quote).
  let linesQuery = supabase
    .from("bom_lines")
    .select("id, mpn, cpc, manufacturer")
    .eq("bom_id", bomId)
    .eq("is_pcb", false)
    .eq("is_dni", false)
    .gt("quantity", 0);
  if (Array.isArray(body.bom_line_ids) && body.bom_line_ids.length > 0) {
    linesQuery = linesQuery.in("id", body.bom_line_ids);
  }
  const { data: bomLines, error: bomErr } = await linesQuery;
  if (bomErr) {
    return NextResponse.json({ error: "Failed to load BOM lines", details: bomErr.message }, { status: 500 });
  }
  if (!bomLines || bomLines.length === 0) {
    return NextResponse.json({ results: [], api_calls: 0 });
  }

  // --- FX rate cache — fetch once up front for every currency we might see. ---
  // We build a small map keyed by currency so converting every quote is O(1).
  const fxCache = new Map<string, number>();
  fxCache.set(reportingCurrency, 1.0);
  async function toCad(amount: number, currency: string): Promise<{ cad: number; rate: number } | null> {
    if (fxCache.has(currency)) {
      const rate = fxCache.get(currency)!;
      return { cad: amount * rate, rate };
    }
    const fx = await getRate(currency, reportingCurrency);
    if (!fx) return null;
    fxCache.set(currency, fx.rate);
    return { cad: amount * fx.rate, rate: fx.rate };
  }

  let apiCalls = 0;
  const results: LineResult[] = [];
  // 24-hour cache on the component pricing review (per Anas, 2026-04-20).
  // Distributor prices drift daily — the pricing review page shows "current
  // as of fetched_at" and anything older than 24h should be re-fetched. The
  // legacy /api/quotes/preview keeps its 7-day cache for now.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Process lines in bounded batches to cap total concurrency.
  for (let i = 0; i < bomLines.length; i += LINE_CONCURRENCY) {
    const slice = bomLines.slice(i, i + LINE_CONCURRENCY);
    const sliceResults = await Promise.all(slice.map(async (line) => {
      const mpn = line.mpn ?? line.cpc;
      const result: LineResult = {
        bom_line_id: line.id,
        mpn: line.mpn ?? null,
        cpc: line.cpc ?? null,
        manufacturer: line.manufacturer ?? null,
        quotes: [],
      };
      if (!mpn) return result;

      // Which suppliers will we actually call for this line?
      const targets = suppliers.filter((s) =>
        supplierCanServiceMpn(s, mpn, line.manufacturer)
      );
      if (targets.length === 0) return result;

      // Order quantities this line cares about — driven by the tier list the
      // panel computed on the client (qty_per_board × tier + overage extras).
      // Falls back to [1] when the caller didn't pass tiers, which preserves
      // backward compat with earlier review sessions.
      const rawOrderQtys = body.tier_order_qtys?.[line.id] ?? [];
      const orderQtys = [...new Set(rawOrderQtys.filter((n) => Number.isInteger(n) && n > 0))];
      if (orderQtys.length === 0) orderQtys.push(1);

      const quoteArrays = await Promise.all(targets.map(async (supplier) => {
        if (SINGLE_QTY_SUPPLIERS.has(supplier as BuiltInSupplierName)) {
          // Fire one call per distinct order-qty; merge single-entry ladders
          // into a combined price_breaks array on each returned quote (keyed
          // by supplier_part_number so multi-row suppliers stay separate).
          const perQtyResults = await Promise.all(
            orderQtys.map(async (qty) => {
              apiCalls++;
              const rows = await runSupplierSearch(supplier, {
                mpn,
                manufacturer: line.manufacturer,
                quantity: qty,
              });
              return { qty, rows };
            })
          );
          return mergeSingleQtyResults(perQtyResults);
        }
        // Break-table suppliers: one call serves every tier.
        apiCalls++;
        return runSupplierSearch(supplier, { mpn, manufacturer: line.manufacturer });
      }));

      // Flatten, convert currency, persist to cache.
      const flat: typeof result.quotes = [];
      for (const quotes of quoteArrays) {
        for (const q of quotes) {
          const conv = await toCad(q.unit_price, q.currency);
          flat.push({
            ...q,
            unit_price_cad: conv?.cad ?? null,
            fx_rate_applied: conv?.rate ?? null,
          });

          // Write into api_pricing_cache so subsequent review sessions (or the
          // quote preview route) can hit cache without re-firing APIs.
          await supabase.from("api_pricing_cache").upsert(
            {
              source: q.source,
              mpn: q.mpn || mpn,
              search_key: (mpn + (q.warehouse_code ? `#${q.warehouse_code}` : "")).toUpperCase(),
              response: q as unknown as Record<string, unknown>,
              unit_price: q.unit_price,
              stock_qty: q.stock_qty,
              currency: q.currency,
              manufacturer: q.manufacturer,
              supplier_part_number: q.supplier_part_number,
              price_breaks: q.price_breaks as unknown as Record<string, unknown>,
              lead_time_days: q.lead_time_days,
              moq: q.moq,
              order_multiple: q.order_multiple,
              lifecycle_status: q.lifecycle_status,
              ncnr: q.ncnr,
              franchised: q.franchised,
              warehouse_code: q.warehouse_code,
              expires_at: expiresAt,
            },
            { onConflict: "source,search_key" }
          );
        }
      }
      result.quotes = flat;
      return result;
    }));
    results.push(...sliceResults);
  }

  return NextResponse.json({
    results,
    api_calls: apiCalls,
    reporting_currency: reportingCurrency,
    fx_rates_used: Object.fromEntries(fxCache.entries()),
  });
}

/**
 * Merge per-qty fetches from a single-qty supplier (Avnet) into one quote per
 * supplier_part_number whose `price_breaks` contains every tier's price.
 *
 * Each incoming `rows` entry is the supplier's response for one specific qty;
 * its `price_breaks` is a synthetic single-entry ladder anchored at that qty.
 * We group by `supplier_part_number` (so multi-supplier Avnet rows stay
 * distinct), collapse all the single-entry ladders into one sorted array, and
 * pick the lowest-qty break's unit_price as the quote's headline unit_price.
 */
function mergeSingleQtyResults(
  perQtyResults: { qty: number; rows: SupplierQuote[] }[]
): SupplierQuote[] {
  // Group by a key that uniquely identifies one "variant" of a supplier hit.
  const grouped = new Map<string, { base: SupplierQuote; breaks: PriceBreak[] }>();

  for (const { rows } of perQtyResults) {
    for (const row of rows) {
      const key = `${row.source}#${row.supplier_part_number ?? ""}#${row.warehouse_code ?? ""}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.breaks.push(...row.price_breaks);
      } else {
        grouped.set(key, {
          base: row,
          breaks: [...row.price_breaks],
        });
      }
    }
  }

  const out: SupplierQuote[] = [];
  for (const { base, breaks } of grouped.values()) {
    // Dedupe breaks by min_qty (later tiers overwrite earlier — most recent
    // price wins) and sort ascending so the panel's priceAtTier lookup picks
    // the correct tier.
    const byQty = new Map<number, PriceBreak>();
    for (const b of breaks) byQty.set(b.min_qty, b);
    const sorted = [...byQty.values()].sort((a, b) => a.min_qty - b.min_qty);
    if (sorted.length === 0) continue;
    out.push({
      ...base,
      price_breaks: sorted,
      unit_price: sorted[0].unit_price,
      currency: sorted[0].currency,
    });
  }
  return out;
}
