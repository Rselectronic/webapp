import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  runSupplierSearchDiag,
  runSupplierBatchDiag,
  isBatchableSupplier,
  SUPPLIER_BATCH_CHUNK_SIZE,
  supplierCanServiceMpn,
} from "@/lib/pricing/registry";
import { getRate } from "@/lib/pricing/fx";
import type { SupplierQuote, PriceBreak } from "@/lib/pricing/types";
import type { BuiltInSupplierName } from "@/lib/supplier-credentials";
import { registerRequest, unregisterRequest } from "@/lib/pricing/cancel-registry";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Concurrency controls. Two levels:
//   1. LINE_CONCURRENCY â€” how many BOM lines process at once.
//   2. SUPPLIER_IN_FLIGHT_CAP â€” per-supplier ceiling, enforced via a tiny
//      semaphore below. DigiKey is the tight one (~2 req/sec per OAuth app);
//      without this cap the parallel alt-MPN loop bursts enough concurrent
//      calls to trip rate limits and silently drop quotes for some lines.
// Back at 4 after the bump to 8 caused missing quotes â€” the alt-MPN loop is
// already parallel so most of the throughput gain is preserved.
const LINE_CONCURRENCY = 4;
const SUPPLIER_IN_FLIGHT_CAP = 4;

/**
 * Supplier-specific concurrency overrides. Some APIs reject concurrent
 * requests with generic "fetch failed" / ECONNRESET even well below their
 * advertised rate limit â€” LCSC in particular drops most requests when 3â€“4
 * hit simultaneously from the same IP. Cap those at 1 (serial per supplier)
 * so the shared worker pool still parallelizes ACROSS suppliers, but a
 * single supplier's calls queue behind each other.
 */
const SUPPLIER_CAP_OVERRIDES: Partial<Record<BuiltInSupplierName, number>> = {
  lcsc: 1,
};

/**
 * Suppliers that return a single price for the quantity they were called with.
 * For these we have to call N times (one per tier's order_qty) and merge the
 * results into a synthetic price_breaks array. Every other supplier returns a
 * full price-break table in one call and is queried once.
 */
const SINGLE_QTY_SUPPLIERS: ReadonlySet<BuiltInSupplierName> = new Set(["avnet"]);

type FetchMode = "cache_only" | "cache_first" | "live";

interface FetchBody {
  /** Which suppliers to query. Must be subset of BuiltInSupplierName. */
  suppliers: string[];
  /** Optional: limit to specific BOM line ids (refresh a single row). */
  bom_line_ids?: string[];
  /** Reporting currency for CAD-converted unit prices. Defaults to "CAD". */
  reporting_currency?: string;
  /**
   * Per-line tier order quantities: `{ [bom_line_id]: [orderQty_tier1, ...] }`.
   * Computed by the panel as `qty_per_board Ã— tier_qty + overage_extras`. Used
   * to drive per-tier API calls for single-qty suppliers (Avnet).
   */
  tier_order_qtys?: Record<string, number[]>;
  /** Cache routing mode. Default "cache_first". */
  mode?: FetchMode;
  /** Max cache age in hours for cache_first mode. Default 24. */
  max_cache_age_hours?: number;
  /**
   * Client-generated UUID identifying this fetch. Used by the companion
   * /pricing-review/cancel endpoint to abort in-flight work for a specific
   * supplier (or all suppliers) mid-stream. Optional: when omitted, no
   * cancellation is possible for this request.
   */
  request_id?: string;
}

interface AlternateMpn {
  mpn: string;
  manufacturer: string | null;
  rank: number;
  source: string;
}

interface CachedRow {
  source: string;
  search_key: string;
  mpn: string | null;
  unit_price: number | null;
  stock_qty: number | null;
  currency: string | null;
  manufacturer: string | null;
  supplier_part_number: string | null;
  price_breaks: unknown;
  lead_time_days: number | null;
  moq: number | null;
  order_multiple: number | null;
  lifecycle_status: string | null;
  ncnr: boolean | null;
  franchised: boolean | null;
  warehouse_code: string | null;
  fetched_at: string;
  expires_at: string | null;
}

/**
 * Minimal per-key semaphore: never more than N concurrent acquires on the
 * same key. Anything over N queues until a slot frees. Used here to cap
 * in-flight HTTP calls per supplier so DigiKey's ~2 req/sec ceiling doesn't
 * trip and silently drop quotes.
 */
function createSupplierLimiter(
  defaultCap: number,
  overrides: Partial<Record<string, number>> = {}
) {
  const active = new Map<string, number>();
  const waiters = new Map<string, Array<() => void>>();
  const capFor = (key: string) => overrides[key] ?? defaultCap;

  async function acquire(key: string): Promise<void> {
    const current = active.get(key) ?? 0;
    if (current < capFor(key)) {
      active.set(key, current + 1);
      return;
    }
    await new Promise<void>((resolve) => {
      const q = waiters.get(key) ?? [];
      q.push(resolve);
      waiters.set(key, q);
    });
    active.set(key, (active.get(key) ?? 0) + 1);
  }

  function release(key: string) {
    const current = active.get(key) ?? 0;
    active.set(key, Math.max(0, current - 1));
    const q = waiters.get(key);
    if (q && q.length > 0) {
      const next = q.shift()!;
      if (q.length === 0) waiters.delete(key);
      // Transfer the slot directly â€” the acquire that's about to wake will
      // re-increment, so we drop the counter first to keep it balanced.
      active.set(key, (active.get(key) ?? 0) - 1);
      next();
    }
  }

  return {
    async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      await acquire(key);
      try {
        return await fn();
      } finally {
        release(key);
      }
    },
  };
}

function rowToQuote(row: CachedRow): SupplierQuote {
  const priceBreaks: PriceBreak[] = Array.isArray(row.price_breaks)
    ? (row.price_breaks as PriceBreak[])
    : [];
  return {
    source: row.source,
    mpn: row.mpn ?? "",
    manufacturer: row.manufacturer,
    supplier_part_number: row.supplier_part_number,
    unit_price: row.unit_price ?? 0,
    currency: row.currency ?? "USD",
    price_breaks: priceBreaks,
    stock_qty: row.stock_qty,
    moq: row.moq,
    order_multiple: row.order_multiple,
    lead_time_days: row.lead_time_days,
    warehouse_code: row.warehouse_code,
    ncnr: row.ncnr,
    franchised: row.franchised,
    lifecycle_status: row.lifecycle_status,
    datasheet_url: null,
    product_url: null,
  };
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
  const mode: FetchMode = body.mode ?? "cache_first";
  const maxCacheAgeHours = typeof body.max_cache_age_hours === "number" && body.max_cache_age_hours > 0
    ? body.max_cache_age_hours
    : 24;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // --- Load BOM lines we actually need priced ---
  // APCB ("Auto-PCB") rows are priced via the PCB fab quote step, not via
  // distributor APIs â€” skip them here so we don't spend API calls on a part
  // no supplier will ever have.
  let linesQuery = supabase
    .from("bom_lines")
    .select("id, mpn, cpc, manufacturer")
    .eq("bom_id", bomId)
    .eq("is_pcb", false)
    .eq("is_dni", false)
    .gt("quantity", 0)
    .not("m_code", "eq", "APCB");
  if (Array.isArray(body.bom_line_ids) && body.bom_line_ids.length > 0) {
    linesQuery = linesQuery.in("id", body.bom_line_ids);
  }
  const { data: bomLines, error: bomErr } = await linesQuery;
  if (bomErr) {
    return NextResponse.json({ error: "Failed to load BOM lines", details: bomErr.message }, { status: 500 });
  }
  const linesArr = bomLines ?? [];

  // --- Load this customer's procurement-log overrides for every CPC on the
  //     BOM. When a row carries an mpn_to_use (e.g. the customer's original
  //     MPN is obsolete and RS has a known replacement), we need to include
  //     that replacement in the pricing search â€” otherwise we waste a fetch
  //     looking up a part that can't be quoted anywhere. Also rank it AHEAD
  //     of the BOM's original MPN (rank=-1) so every supplier sees the good
  //     part first. ---
  const { data: bomRow } = await supabase
    .from("boms")
    .select("customer_id")
    .eq("id", bomId)
    .maybeSingle();
  const customerId = bomRow?.customer_id ?? null;
  const mpnToUseByLineId = new Map<string, { mpn: string; manufacturer: string | null }>();
  if (customerId) {
    const cpcs = [
      ...new Set(
        linesArr.map((l) => l.cpc).filter((c): c is string => typeof c === "string" && c.length > 0)
      ),
    ];
    if (cpcs.length > 0) {
      const { data: cpRows } = await supabase
        .from("customer_parts")
        .select("cpc, mpn_to_use, manufacturer_to_use")
        .eq("customer_id", customerId)
        .in("cpc", cpcs);
      const byCpc = new Map<string, { mpn_to_use: string | null; manufacturer_to_use: string | null }>();
      for (const row of cpRows ?? []) {
        if (row.mpn_to_use && row.mpn_to_use.trim().length > 0) {
          byCpc.set(row.cpc, {
            mpn_to_use: row.mpn_to_use.trim(),
            manufacturer_to_use: row.manufacturer_to_use,
          });
        }
      }
      for (const l of linesArr) {
        if (!l.cpc) continue;
        const hit = byCpc.get(l.cpc);
        if (!hit || !hit.mpn_to_use) continue;
        // Only treat it as an override when it differs from what's on the
        // BOM â€” otherwise it's just redundant duplication of line.mpn.
        if (hit.mpn_to_use.toUpperCase() === (l.mpn ?? "").toUpperCase()) continue;
        mpnToUseByLineId.set(l.id, {
          mpn: hit.mpn_to_use,
          manufacturer: hit.manufacturer_to_use ?? l.manufacturer ?? null,
        });
      }
    }
  }

  // --- Load per-line alternates. ---
  const { data: alts } = linesArr.length > 0
    ? await supabase
        .from("bom_line_alternates")
        .select("bom_line_id, mpn, manufacturer, rank, source")
        .in("bom_line_id", linesArr.map((l) => l.id))
        .order("rank", { ascending: true })
    : { data: [] as Array<{ bom_line_id: string; mpn: string | null; manufacturer: string | null; rank: number | null; source: string | null }> };

  const altsByLineId = new Map<string, AlternateMpn[]>();
  // Seed with mpn_to_use at the highest rank so it's tried first by every
  // supplier. Rank is only used for display ordering, so using -1 keeps it
  // in front of rank=0 (primary MPN) and rank>=1 (customer alternates). Also
  // keep the BOM's original MPN at rank=0 as a backup â€” if the replacement
  // has no cached quotes either, we at least try what the customer sent.
  for (const [lineId, toUse] of mpnToUseByLineId) {
    const line = linesArr.find((l) => l.id === lineId);
    const seed: AlternateMpn[] = [
      { mpn: toUse.mpn, manufacturer: toUse.manufacturer, rank: -1, source: "rs_alt" },
    ];
    if (line?.mpn) {
      seed.push({ mpn: line.mpn, manufacturer: line.manufacturer ?? null, rank: 0, source: "customer" });
    }
    altsByLineId.set(lineId, seed);
  }
  for (const a of alts ?? []) {
    if (!a.mpn) continue;
    const arr = altsByLineId.get(a.bom_line_id) ?? [];
    arr.push({ mpn: a.mpn, manufacturer: a.manufacturer ?? null, rank: a.rank ?? 0, source: a.source ?? "customer" });
    altsByLineId.set(a.bom_line_id, arr);
  }

  // --- Pre-load cache rows for all (lines Ã— mpns Ã— suppliers). ---
  // Build a map: "{source}|{SEARCH_KEY_UPPER}" â†’ latest cached row for that key.
  // For multi-warehouse suppliers (Arrow, Newark) one MPN may map to several
  // rows (one per warehouse); we keep all of them under their specific
  // search_key. We also index under the plain MPN key for lookup.
  //
  // Cache READS go through the admin (service-role) client. The cache table
  // is shared (not user-specific), so bypassing RLS for reads is safe — and
  // it sidesteps a PostgREST quirk where bundling many keys into a single
  // `.or()` filter silently drops rows under session-auth when any key
  // contains a slash (`DSPIC33CK1024MP710T-I/PT` was returning a fraction
  // of expected rows). Auto-pick was hitting the fatal version of this bug;
  // here it just made cache_first burn API calls re-fetching parts that
  // were already cached. WRITES (.upsert below) still go through the
  // session-auth `supabase` client.
  const adminSupabase = createAdminClient();
  const cacheByKey = new Map<string, CachedRow[]>();

  if (mode !== "live" && linesArr.length > 0) {
    // Collect every MPN we might query across primaries + alternates.
    const mpnSet = new Set<string>();
    for (const line of linesArr) {
      const lineAlts = altsByLineId.get(line.id);
      const list = (lineAlts && lineAlts.length > 0)
        ? lineAlts
        : (() => {
            const fallback = line.mpn ?? line.cpc;
            return fallback ? [{ mpn: fallback, manufacturer: line.manufacturer ?? null, rank: 0, source: "customer" as const }] : [];
          })();
      for (const a of list) {
        if (a.mpn && a.mpn.trim().length > 0) mpnSet.add(a.mpn.toUpperCase());
      }
    }

    const mpnArr = [...mpnSet];
    if (mpnArr.length > 0 && suppliers.length > 0) {
      // Build OR filter for search_key = MPN OR search_key LIKE MPN#%
      // Use chunking to avoid enormous queries.
      const CHUNK = 100;
      const ageCutoffIso = new Date(Date.now() - maxCacheAgeHours * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();

      for (let i = 0; i < mpnArr.length; i += CHUNK) {
        const chunk = mpnArr.slice(i, i + CHUNK);
        const orParts: string[] = [];
        for (const m of chunk) {
          // PostgREST .or() uses commas as the top-level separator and parens
          // as grouping, so values containing those chars must be wrapped in
          // double quotes (with embedded quotes/backslashes escaped). This
          // lets MPNs like "PMEG3020EJ,115" (NXP's style) match their own
          // cached search_key instead of being silently stripped and missing.
          const needsQuote = /[,()" ]/.test(m);
          const pstgQuote = (v: string) =>
            needsQuote ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
          orParts.push(`search_key.eq.${pstgQuote(m)}`);
          orParts.push(`search_key.like.${pstgQuote(`${m}#%`)}`);
        }
        // Paginate per chunk: Supabase/PostgREST hard-caps each response at
        // ~1000 rows regardless of what client `.limit()` requests. With ~14
        // suppliers, ~3 search keys per line, and now multiple SKUs per
        // (source, MPN) post-migration 109, a 100-MPN chunk easily exceeds
        // the cap and silently drops the tail rows — exactly the in-stock
        // SKUs that were inserted most recently, which is why bulk cache
        // fetches missed Newark's stock-563 SKU while per-line refresh
        // (small key set) saw it. Looping with .range() until a page comes
        // back short drains everything without inflating any single query.
        const PAGE_SIZE = 1000;
        let pageStart = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = adminSupabase
            .from("api_pricing_cache")
            .select("source, search_key, mpn, unit_price, stock_qty, currency, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at, expires_at")
            .in("source", suppliers)
            .or(orParts.join(","))
            .range(pageStart, pageStart + PAGE_SIZE - 1);

          // Age threshold applies to BOTH cache-consulting modes. Users expect
          // "max age (h)" to mean "never show me a quote older than this" —
          // regardless of whether we'd fall back to live (cache_first) or skip
          // the line (cache_only). Previously cache_only ignored the slider and
          // used only the 7-day expires_at TTL, so 5-day-old cache rows kept
          // appearing when the user had 24h selected.
          if (mode === "cache_first" || mode === "cache_only") {
            q = q.gt("fetched_at", ageCutoffIso);
            if (mode === "cache_only") {
              q = q.gt("expires_at", nowIso);
            }
          }

          const { data: cacheRows, error: cacheErr } = await q;
          if (cacheErr) {
            console.warn(`[pricing-fetch] cache pre-load SQL error: ${cacheErr.message}`);
            break;
          }
          const batch = (cacheRows ?? []) as CachedRow[];
          for (const row of batch) {
            const key = `${row.source}|${row.search_key.toUpperCase()}`;
            const arr = cacheByKey.get(key) ?? [];
            arr.push(row);
            cacheByKey.set(key, arr);
          }
          if (batch.length < PAGE_SIZE) break;
          pageStart += PAGE_SIZE;
        }
      }
    }
    // Summary of what the pre-load pulled so the operator can tell at a
    // glance whether cache_first missed because nothing was cached or
    // because the cache had stale / wrong-supplier rows.
    const perSupplierCount: Record<string, number> = {};
    for (const [k, rows] of cacheByKey.entries()) {
      const source = k.split("|")[0];
      perSupplierCount[source] = (perSupplierCount[source] ?? 0) + rows.length;
    }
    console.info(
      `[pricing-fetch] mode=${mode} age<=${maxCacheAgeHours}h â€” cache pre-load: ${
        Object.entries(perSupplierCount)
          .map(([s, n]) => `${s}=${n}`)
          .join(", ") || "no rows"
      } (asked for: ${suppliers.join(", ")}, mpns=${mpnSet.size}, sample keys: ${[...mpnSet].slice(0, 3).join(", ")})`
    );
    if (cacheByKey.size === 0) {
      // Emergency-probe: query cache_only by source (no search_key filter
      // and no age filter) to distinguish "nothing ever cached for this
      // supplier" from "cached but the filters are wrong". One-row probe
      // keeps the cost negligible.
      for (const s of suppliers) {
        const { data: probe } = await adminSupabase
          .from("api_pricing_cache")
          .select("search_key, fetched_at, expires_at")
          .eq("source", s)
          .order("fetched_at", { ascending: false })
          .limit(1);
        if (probe && probe.length > 0) {
          console.warn(
            `[pricing-fetch] cache probe: ${s} HAS rows in DB (latest key="${probe[0].search_key}", fetched_at=${probe[0].fetched_at}, expires_at=${probe[0].expires_at}) but the main pre-load returned 0 â€” check search_key format / age filter`
          );
        } else {
          console.info(
            `[pricing-fetch] cache probe: ${s} has 0 rows in api_pricing_cache â€” nothing was ever cached for this supplier`
          );
        }
      }
    }
  }

  /**
   * Look up cached rows for (supplier, mpn). Returns all matching rows (across
   * warehouses). Empty array = cache miss.
   */
  const lookupCache = (supplier: string, mpn: string): CachedRow[] => {
    const mpnUpper = mpn.toUpperCase();
    const exact = cacheByKey.get(`${supplier}|${mpnUpper}`) ?? [];
    // Multi-warehouse: collect all keys starting with "supplier|MPN#"
    const prefix = `${supplier}|${mpnUpper}#`;
    const multi: CachedRow[] = [];
    for (const [k, rows] of cacheByKey.entries()) {
      if (k.startsWith(prefix)) multi.push(...rows);
    }
    return [...exact, ...multi];
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      // Per-supplier in-flight cap. Scoped to this request so concurrent
      // fetch requests don't share counters.
      const supplierLimit = createSupplierLimiter(
        SUPPLIER_IN_FLIGHT_CAP,
        SUPPLIER_CAP_OVERRIDES
      );

      // Register this request with the cancel registry so the cancel
      // endpoint can abort the master signal or any per-supplier signal
      // mid-stream. Without a request_id we register under an internal
      // sentinel so the rest of the code is uniform — the caller just can't
      // address it.
      const requestId = body.request_id;
      const registered = requestId ? registerRequest(requestId, suppliers) : null;

      try {
        write({ type: "init", suppliers, lines_total: linesArr.length, mode, request_id: requestId ?? null });

        if (linesArr.length === 0) {
          write({ type: "done", api_calls: 0, cache_hits: 0, lines_skipped: 0 });
          return;
        }

        // FX cache
        const fxCache = new Map<string, number>();
        fxCache.set(reportingCurrency, 1.0);
        const toCad = async (amount: number, currency: string): Promise<{ cad: number; rate: number } | null> => {
          if (fxCache.has(currency)) {
            const rate = fxCache.get(currency)!;
            return { cad: amount * rate, rate };
          }
          const fx = await getRate(currency, reportingCurrency);
          if (!fx) return null;
          fxCache.set(currency, fx.rate);
          return { cad: amount * fx.rate, rate: fx.rate };
        };

        let apiCalls = 0;
        let totalCacheHits = 0;
        let linesSkipped = 0;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // ----- Fully-independent per-supplier dispatch -----
        //
        // Previous attempts still coupled suppliers: all workers held a line
        // until every supplier's work for it resolved, so a slow supplier
        // blocked the line's worker even though the per-supplier progress
        // event already fired. That caused the bars to line up again visually.
        //
        // This version runs ONE dispatcher per supplier, each with its own
        // concurrency cap, each with its own cursor through the line list.
        // DigiKey, LCSC, Mouser etc. are now truly independent â€” LCSC's
        // serial cap no longer prevents DigiKey from advancing.
        //
        // Cross-supplier aggregation for the per-line UI events (line_done,
        // line_cached) is handled with a countdown per line. The last
        // supplier to finish a line emits the aggregated events.

        // Per-line aggregators.
        type FlatQuote = SupplierQuote & {
          unit_price_cad: number | null;
          fx_rate_applied: number | null;
          quoted_mpn: string;
          from_cache: boolean;
          cache_age_hours: number | null;
        };
        type LineStats = { cacheHits: number; liveHits: number; skipped: number };
        const lineQuotesAcc = new Map<string, FlatQuote[]>();
        const lineErrorsAcc = new Map<
          string,
          Array<{ supplier: string; mpn: string; error: string }>
        >();
        const lineStatsAcc = new Map<string, LineStats>();
        const lineSuppliersRemaining = new Map<string, number>();
        for (const l of linesArr) {
          lineQuotesAcc.set(l.id, []);
          lineErrorsAcc.set(l.id, []);
          lineStatsAcc.set(l.id, { cacheHits: 0, liveHits: 0, skipped: 0 });
          lineSuppliersRemaining.set(l.id, suppliers.length);
        }

        const finalizeLineIfDone = (lineId: string) => {
          const rem = (lineSuppliersRemaining.get(lineId) ?? 0) - 1;
          lineSuppliersRemaining.set(lineId, rem);
          if (rem !== 0) return;
          const stats = lineStatsAcc.get(lineId) ?? { cacheHits: 0, liveHits: 0, skipped: 0 };
          const flat = lineQuotesAcc.get(lineId) ?? [];
          const errs = lineErrorsAcc.get(lineId) ?? [];
          totalCacheHits += stats.cacheHits;
          if (mode === "cache_only" && flat.length === 0) linesSkipped++;
          write({
            type: "line_cached",
            bom_line_id: lineId,
            cache_hits: stats.cacheHits,
            live_hits: stats.liveHits,
            skipped: stats.skipped,
          });
          write({
            type: "line_done",
            bom_line_id: lineId,
            quotes: flat,
            errors: errs,
          });
        };

        // Per-supplier per-line work. Returns nothing; writes progress/append
        // events directly, aggregates results into the shared per-line maps.
        const processLineForSupplier = async (
          supplier: BuiltInSupplierName,
          line: (typeof linesArr)[number]
        ): Promise<void> => {
          const lineAlts = altsByLineId.get(line.id);
          const mpnListAll: AlternateMpn[] = (lineAlts && lineAlts.length > 0)
            ? lineAlts.filter((a) => a.mpn && a.mpn.trim().length > 0)
            : (() => {
                const fallback = line.mpn ?? line.cpc;
                if (!fallback) return [];
                return [{ mpn: fallback, manufacturer: line.manufacturer ?? null, rank: 0, source: "customer" as const }];
              })();

          // Keep only alts this supplier can actually service. Log the ones
          // we're skipping so the operator sees which supplier won't quote
          // which manufacturer â€” useful for "why didn't X quote?" debugging.
          const mpnList: AlternateMpn[] = [];
          for (const a of mpnListAll) {
            const mfr = a.manufacturer ?? line.manufacturer;
            if (supplierCanServiceMpn(supplier, a.mpn, mfr)) {
              mpnList.push(a);
            } else {
              console.info(
                `[pricing-fetch] ${supplier} mpn=${a.mpn} mfr=${mfr ?? "â€”"} FILTERED â€” supplier does not franchise this manufacturer`
              );
            }
          }

          if (mpnList.length === 0) return; // nothing to do for this supplier

          const rawOrderQtys = body.tier_order_qtys?.[line.id] ?? [];
          const orderQtys = [...new Set(rawOrderQtys.filter((n) => Number.isInteger(n) && n > 0))];
          if (orderQtys.length === 0) orderQtys.push(1);

          const myQuotes: FlatQuote[] = [];
          const myErrors: Array<{ supplier: string; mpn: string; error: string }> = [];
          let cacheHits = 0;
          let liveHits = 0;
          let skipped = 0;

          // Process this supplier's alts in parallel â€” they're independent
          // and cache lookups are in-memory. Live calls still go through
          // supplierLimit so the supplier's per-IP cap is respected.
          await Promise.all(mpnList.map(async (alt) => {
            const searchedMpn = alt.mpn;
            const mfr = alt.manufacturer ?? line.manufacturer;

            // Cache consultation first (unless live mode).
            if (mode !== "live") {
              const rows = lookupCache(supplier, searchedMpn);
              if (rows.length > 0) {
                // A row with null unit_price is a negative-cache sentinel â€”
                // we previously asked this supplier for this MPN and they
                // had nothing. Treat it as a cache hit (so we don't fire
                // live again) but don't push a bogus quote.
                const validRows = rows.filter((r) => r.unit_price != null && r.unit_price > 0);
                for (const row of validRows) {
                  const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / (60 * 60 * 1000);
                  const q = rowToQuote(row);
                  const conv = await toCad(q.unit_price, q.currency);
                  myQuotes.push({
                    ...q,
                    unit_price_cad: conv?.cad ?? null,
                    fx_rate_applied: conv?.rate ?? null,
                    quoted_mpn: searchedMpn,
                    from_cache: true,
                    cache_age_hours: ageHours,
                  });
                }
                cacheHits++;
                const isNegative = validRows.length === 0;
                console.info(
                  `[pricing-fetch] ${supplier} mpn=${searchedMpn} CACHE â€” ${
                    isNegative
                      ? "negative cache hit (no products match, skipped live call)"
                      : `${validRows.length} row(s), ${Math.round(
                          rows[0] ? ((Date.now() - new Date(rows[0].fetched_at).getTime()) / 3600000) : 0
                        )}h old`
                  }`
                );
                return;
              }
              if (mode === "cache_only") {
                skipped++;
                console.info(
                  `[pricing-fetch] ${supplier} mpn=${searchedMpn} SKIP â€” cache_only mode, no cached row`
                );
                return;
              }
            }

            // Live fetch. Every API call emits a terminal log line describing
            // what happened â€” so the operator can see exactly which
            // distributor quoted what for each part, and which failed (429,
            // timeout, "no products match", franchise mismatch, etc.).
            const t0 = Date.now();
            let quotes: SupplierQuote[];
            if (SINGLE_QTY_SUPPLIERS.has(supplier)) {
              const perQtyResults = await Promise.all(
                orderQtys.map(async (qty) =>
                  supplierLimit.run(supplier, async () => {
                    apiCalls++;
                    const callStart = Date.now();
                    const diag = await runSupplierSearchDiag(supplier, {
                      mpn: searchedMpn,
                      manufacturer: mfr,
                      quantity: qty,
                    });
                    const dur = Date.now() - callStart;
                    if (diag.error) {
                      myErrors.push({ supplier, mpn: searchedMpn, error: diag.error });
                      console.warn(
                        `[pricing-fetch] ${supplier} mpn=${searchedMpn} qty=${qty} FAIL ${dur}ms â€” ${diag.error}`
                      );
                    } else {
                      console.info(
                        `[pricing-fetch] ${supplier} mpn=${searchedMpn} qty=${qty} OK ${dur}ms â€” ${diag.quotes.length} quote(s)`
                      );
                    }
                    return { qty, rows: diag.quotes };
                  })
                )
              );
              quotes = mergeSingleQtyResults(perQtyResults);
            } else {
              quotes = await supplierLimit.run(supplier, async () => {
                apiCalls++;
                const callStart = Date.now();
                const diag = await runSupplierSearchDiag(supplier, { mpn: searchedMpn, manufacturer: mfr });
                const dur = Date.now() - callStart;
                if (diag.error) {
                  myErrors.push({ supplier, mpn: searchedMpn, error: diag.error });
                  console.warn(
                    `[pricing-fetch] ${supplier} mpn=${searchedMpn} FAIL ${dur}ms â€” ${diag.error}`
                  );
                } else {
                  console.info(
                    `[pricing-fetch] ${supplier} mpn=${searchedMpn} OK ${dur}ms â€” ${diag.quotes.length} quote(s)${
                      diag.quotes.length === 0 ? " (no products match)" : ""
                    }`
                  );
                }
                return diag.quotes;
              });
            }
            const totalDur = Date.now() - t0;
            const hadError = myErrors.some(
              (e) => e.mpn === searchedMpn && e.supplier === supplier
            );
            if (quotes.length === 0 && !hadError) {
              console.info(
                `[pricing-fetch] ${supplier} mpn=${searchedMpn} EMPTY ${totalDur}ms â€” supplier returned no rows (likely not franchised / not carried)`
              );
              // Negative-cache the "no match" result so the next cache_first
              // run skips this MPN instead of calling the API again. Two
              // important guards:
              //   1. Don't write a negative entry when there was a transient
              //      error â€” `!hadError` already covers that.
              //   2. Don't OVERWRITE an existing positive cache row. A
              //      previous successful fetch found prices; an empty
              //      response now is more likely a flaky supplier API or a
              //      mid-flight cart change than the part suddenly not
              //      being carried. Without this guard, a single empty
              //      response wipes good cached prices and auto-pick stops
              //      finding the line entirely (real bug we hit in prod
              //      with Mouser Ã— T60430-Y4021-X123).
              const searchKeyUp = searchedMpn.toUpperCase();
              const { data: existingPositive } = await supabase
                .from("api_pricing_cache")
                .select("unit_price")
                .eq("source", supplier)
                .eq("search_key", searchKeyUp)
                .maybeSingle();
              const hasPositive =
                existingPositive?.unit_price != null &&
                Number(existingPositive.unit_price) > 0;

              if (hasPositive) {
                console.info(
                  `[pricing-fetch] ${supplier} mpn=${searchedMpn} EMPTY-but-existing-positive â†’ KEEPING old cache row (don't overwrite with null)`
                );
              } else {
                const { error: negErr } = await supabase.from("api_pricing_cache").upsert(
                  {
                    source: supplier,
                    mpn: searchedMpn,
                    search_key: searchKeyUp,
                    response: {} as Record<string, unknown>,
                    unit_price: null,
                    stock_qty: null,
                    currency: null,
                    manufacturer: null,
                    supplier_part_number: null,
                    price_breaks: [] as unknown as Record<string, unknown>,
                    lead_time_days: null,
                    moq: null,
                    order_multiple: null,
                    lifecycle_status: null,
                    ncnr: null,
                    franchised: null,
                    warehouse_code: null,
                    fetched_at: new Date().toISOString(),
                    expires_at: expiresAt,
                  },
                  { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                );
                if (negErr) {
                  console.warn(
                    `[pricing-fetch] ${supplier} mpn=${searchedMpn} NEG-CACHE-WRITE-FAIL â€” ${negErr.message}`
                  );
                }
              }
            }

            if (quotes.length > 0) liveHits++;
            for (const q of quotes) {
              const conv = await toCad(q.unit_price, q.currency);
              myQuotes.push({
                ...q,
                unit_price_cad: conv?.cad ?? null,
                fx_rate_applied: conv?.rate ?? null,
                quoted_mpn: searchedMpn,
                from_cache: false,
                cache_age_hours: null,
              });
              const { error: posErr } = await supabase.from("api_pricing_cache").upsert(
                {
                  source: q.source,
                  mpn: q.mpn || searchedMpn,
                  search_key: (searchedMpn + (q.warehouse_code ? `#${q.warehouse_code}` : "")).toUpperCase(),
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
                  fetched_at: new Date().toISOString(),
                  expires_at: expiresAt,
                },
                { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
              );
              if (posErr) {
                console.warn(
                  `[pricing-fetch] ${supplier} mpn=${searchedMpn} CACHE-WRITE-FAIL â€” ${posErr.message}`
                );
              }
            }
          }));

          // Dedupe per-supplier results BEFORE merging. Since we now look up
          // the cache once per alt MPN (line.mpn, line.cpc, mpn_to_use, plus
          // bom_line_alternates), a single cached row can be hit by several
          // keys and end up pushed into myQuotes multiple times â€” producing
          // N identical rows in the UI. Collapse by (supplier_part_number,
          // warehouse_code). When both are null/empty the unit_price ties it.
          let dedupedMine: FlatQuote[] = [];
          const seenSig = new Set<string>();
          for (const q of myQuotes) {
            const sig = `${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
            if (seenSig.has(sig)) continue;
            seenSig.add(sig);
            dedupedMine.push(q);
          }

          // Supplier-specific pruning. Future Electronics' API returns one
          // row per distributor SKU / packaging variant / stocking location
          // â€” often 10+ rows for the same physical MPN, most with stock=0.
          // That floods the UI with noise the operator can't act on. Keep
          // only in-stock rows when any exist; otherwise keep just one
          // representative row so the operator still sees the supplier in
          // the list.
          if (supplier === "future" && dedupedMine.length > 1) {
            const inStock = dedupedMine.filter(
              (q) => q.stock_qty != null && q.stock_qty > 0
            );
            if (inStock.length > 0) {
              dedupedMine = inStock;
            } else {
              dedupedMine = [dedupedMine[0]];
            }
          }

          // Merge into shared per-line aggregator, also deduping against
          // whatever other suppliers or earlier cache-hydration already put
          // into acc.
          const acc = lineQuotesAcc.get(line.id);
          if (acc) {
            const accSig = new Set(
              acc.map((q) => `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`)
            );
            for (const q of dedupedMine) {
              const sig = `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
              if (accSig.has(sig)) continue;
              accSig.add(sig);
              acc.push(q);
            }
          }
          const errAcc = lineErrorsAcc.get(line.id);
          if (errAcc) errAcc.push(...myErrors);
          const stats = lineStatsAcc.get(line.id);
          if (stats) {
            stats.cacheHits += cacheHits;
            stats.liveHits += liveHits;
            stats.skipped += skipped;
          }

          // Incremental UI update â€” so the row shows this supplier's quotes
          // as soon as they arrive, not only when the slowest supplier is done.
          if (dedupedMine.length > 0) {
            write({ type: "line_quotes_append", bom_line_id: line.id, quotes: dedupedMine });
          }
        };

        // ----- Batch supplier dispatcher -----
        //
        // Invoked for any supplier registered in SUPPLIER_BATCH_REGISTRY
        // (currently arrow_com). Walks every line × alt once, splits results
        // into cache hits and a batch queue, then sends the queue to the
        // supplier as N-MPN HTTP calls (chunk size from the registry; arrow.com
        // = 250). Distributes responses back to lines, writes the same line_*
        // SSE events the per-MPN path uses, and decrements the per-line
        // supplier countdown via the same finalizeLineIfDone helper.
        const processBatchSupplier = async (supplier: BuiltInSupplierName) => {
          const supplierSignal: AbortSignal = registered
            ? registered.perSupplier.get(supplier)!.signal
            : new AbortController().signal;
          let cancelEmitted = false;

          // Per-line state: which uppercased MPNs are still waiting on a
          // batch response. Once empty, the line has finished arrow_com's
          // entire workload and finalizeLineIfDone() can run.
          type LineState = { pending: Set<string>; finalized: boolean };
          const lineStateMap = new Map<string, LineState>();
          // Lines that had no MPNs at all for this supplier (filtered out by
          // supplierCanServiceMpn or empty alt list) need to finalize once at
          // the end so they don't deadlock waiting for arrow_com.
          const lineHasWork = new Set<string>();

          // UPPER_MPN -> list of (line, alt) tuples that need its result.
          // De-duplication by MPN means one HTTP call covers every line that
          // wants the same part — the savings against per-MPN are biggest
          // here on real BOMs (lots of repeated 0R / 0.1uF parts).
          type PendingAlt = { lineId: string; alt: AlternateMpn };
          const batchQueueByMpn = new Map<string, PendingAlt[]>();
          // Per-MPN manufacturer to send. When two lines want the same MPN
          // with different mfrs, prefer "no mfr" so we don't false-narrow
          // the search and miss either line.
          const mfrByMpn = new Map<string, string | null>();

          // Net-new rows this dispatcher has emitted per line — what we send
          // in line_quotes_append. Mirrors `dedupedMine` in the per-MPN path
          // so the UI gets only what's new each time, not the full set.
          const newQuotesByLine = new Map<string, FlatQuote[]>();
          // Lines that have already had at least one append flushed; used so
          // we only emit a new append when there are rows to send.
          let progressDoneCount = 0;
          const tryFinalizeLine = (lineId: string) => {
            const st = lineStateMap.get(lineId);
            if (!st) return;
            if (st.finalized) return;
            if (st.pending.size > 0) return;
            st.finalized = true;
            // Flush any remaining buffered new quotes for this line before
            // finalize so the row is fully populated when line_done fires.
            const buf = newQuotesByLine.get(lineId);
            if (buf && buf.length > 0) {
              write({ type: "line_quotes_append", bom_line_id: lineId, quotes: buf });
              newQuotesByLine.set(lineId, []);
            }
            progressDoneCount++;
            write({
              type: "supplier_progress",
              supplier,
              lines_done: progressDoneCount,
              lines_total: linesArr.length,
            });
            finalizeLineIfDone(lineId);
          };

          // ---- Phase 1: cache pass + queue assembly ----
          for (const line of linesArr) {
            lineStateMap.set(line.id, { pending: new Set(), finalized: false });

            const lineAlts = altsByLineId.get(line.id);
            const mpnListAll: AlternateMpn[] = (lineAlts && lineAlts.length > 0)
              ? lineAlts.filter((a) => a.mpn && a.mpn.trim().length > 0)
              : (() => {
                  const fallback = line.mpn ?? line.cpc;
                  if (!fallback) return [];
                  return [{ mpn: fallback, manufacturer: line.manufacturer ?? null, rank: 0, source: "customer" as const }];
                })();

            const mpnList: AlternateMpn[] = [];
            for (const a of mpnListAll) {
              const mfr = a.manufacturer ?? line.manufacturer;
              if (supplierCanServiceMpn(supplier, a.mpn, mfr)) {
                mpnList.push(a);
              } else {
                console.info(
                  `[pricing-fetch] ${supplier} mpn=${a.mpn} mfr=${mfr ?? "—"} FILTERED — supplier does not franchise this manufacturer`
                );
              }
            }
            if (mpnList.length === 0) continue;
            lineHasWork.add(line.id);

            const stats = lineStatsAcc.get(line.id);
            const acc = lineQuotesAcc.get(line.id);
            if (!stats || !acc) continue;

            const newRowsForLine: FlatQuote[] = [];
            for (const alt of mpnList) {
              const upperMpn = alt.mpn.toUpperCase();

              if (mode !== "live") {
                const rows = lookupCache(supplier, alt.mpn);
                if (rows.length > 0) {
                  // Same negative-vs-positive cache logic as per-MPN path.
                  const validRows = rows.filter((r) => r.unit_price != null && r.unit_price > 0);
                  for (const row of validRows) {
                    const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / (60 * 60 * 1000);
                    const q = rowToQuote(row);
                    const conv = await toCad(q.unit_price, q.currency);
                    const sig = `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
                    const accSigs = new Set(
                      acc.map((x) => `${x.source}|${x.supplier_part_number ?? ""}|${x.warehouse_code ?? ""}|${x.unit_price}`)
                    );
                    if (accSigs.has(sig)) continue;
                    const flat: FlatQuote = {
                      ...q,
                      unit_price_cad: conv?.cad ?? null,
                      fx_rate_applied: conv?.rate ?? null,
                      quoted_mpn: alt.mpn,
                      from_cache: true,
                      cache_age_hours: ageHours,
                    };
                    acc.push(flat);
                    newRowsForLine.push(flat);
                  }
                  stats.cacheHits++;
                  console.info(
                    `[pricing-fetch] ${supplier} mpn=${alt.mpn} CACHE — ${
                      validRows.length === 0
                        ? "negative cache hit (no products match, skipped batch)"
                        : `${validRows.length} row(s)`
                    }`
                  );
                  continue;
                }
                if (mode === "cache_only") {
                  stats.skipped++;
                  console.info(
                    `[pricing-fetch] ${supplier} mpn=${alt.mpn} SKIP — cache_only mode, no cached row`
                  );
                  continue;
                }
              }

              // Cache miss → enqueue for batch.
              const altsForMpn = batchQueueByMpn.get(upperMpn) ?? [];
              altsForMpn.push({ lineId: line.id, alt });
              batchQueueByMpn.set(upperMpn, altsForMpn);
              lineStateMap.get(line.id)!.pending.add(upperMpn);

              const altMfr = alt.manufacturer ?? line.manufacturer ?? null;
              if (mfrByMpn.has(upperMpn)) {
                // Conflict resolution: same MPN with different mfrs across
                // lines → drop mfr filter so the API returns matches for
                // either side (filtering on mfr would silently miss one).
                const existing = mfrByMpn.get(upperMpn) ?? null;
                if ((existing ?? "").toLowerCase() !== (altMfr ?? "").toLowerCase()) {
                  mfrByMpn.set(upperMpn, null);
                }
              } else {
                mfrByMpn.set(upperMpn, altMfr);
              }
            }
            if (newRowsForLine.length > 0) {
              const buf = newQuotesByLine.get(line.id) ?? [];
              buf.push(...newRowsForLine);
              newQuotesByLine.set(line.id, buf);
            }
          }

          // Lines with no work for this supplier finalize immediately so
          // their cross-supplier countdown isn't blocked.
          for (const line of linesArr) {
            if (!lineHasWork.has(line.id)) {
              const st = lineStateMap.get(line.id);
              if (st) st.finalized = true;
              progressDoneCount++;
              write({
                type: "supplier_progress",
                supplier,
                lines_done: progressDoneCount,
                lines_total: linesArr.length,
              });
              finalizeLineIfDone(line.id);
            }
          }

          // Lines whose alts were ALL satisfied from cache finalize now too.
          for (const lineId of lineStateMap.keys()) {
            tryFinalizeLine(lineId);
          }

          // ---- Phase 2: chunk + dispatch batches ----
          const allMpns = [...batchQueueByMpn.keys()];
          if (allMpns.length === 0) {
            // Cache covered everything (or live mode but nothing to query).
            // Cancel banner if applicable, otherwise we're done.
            if (supplierSignal.aborted && !cancelEmitted) {
              write({ type: "supplier_cancelled", supplier });
              cancelEmitted = true;
            }
            return;
          }

          const chunkSize = SUPPLIER_BATCH_CHUNK_SIZE[supplier] ?? 250;
          const chunks: string[][] = [];
          for (let i = 0; i < allMpns.length; i += chunkSize) {
            chunks.push(allMpns.slice(i, i + chunkSize));
          }
          console.info(
            `[pricing-fetch] ${supplier} BATCH — ${allMpns.length} MPN(s) across ${chunks.length} chunk(s) of up to ${chunkSize}`
          );

          // Process one chunk: HTTP call + apply results back to lines.
          const processChunk = async (mpnsInChunk: string[]) => {
            if (supplierSignal.aborted) return;
            const parts = mpnsInChunk.map((upperMpn) => {
              // Send the original-case MPN from the first pending alt so the
              // API receives exactly what the operator put on the BOM.
              const firstAlt = batchQueueByMpn.get(upperMpn)?.[0]?.alt;
              return {
                mpn: firstAlt?.mpn ?? upperMpn,
                manufacturer: mfrByMpn.get(upperMpn) ?? null,
              };
            });

            const t0 = Date.now();
            const result = await supplierLimit.run(supplier, async () => {
              apiCalls++;
              return runSupplierBatchDiag(supplier, { parts, signal: supplierSignal });
            });
            const dur = Date.now() - t0;

            if (result.error) {
              console.warn(
                `[pricing-fetch] ${supplier} BATCH FAIL ${dur}ms ${mpnsInChunk.length} MPN(s) — ${result.error}`
              );
              // Mark every (line, alt) in this chunk as errored, clear pending.
              for (const upperMpn of mpnsInChunk) {
                const tuples = batchQueueByMpn.get(upperMpn) ?? [];
                for (const { lineId, alt } of tuples) {
                  const errAcc = lineErrorsAcc.get(lineId);
                  if (errAcc) errAcc.push({ supplier, mpn: alt.mpn, error: result.error });
                  const st = lineStateMap.get(lineId);
                  st?.pending.delete(upperMpn);
                }
              }
              for (const upperMpn of mpnsInChunk) {
                for (const { lineId } of batchQueueByMpn.get(upperMpn) ?? []) {
                  tryFinalizeLine(lineId);
                }
              }
              return;
            }

            console.info(
              `[pricing-fetch] ${supplier} BATCH OK ${dur}ms — ${mpnsInChunk.length} requested, ${result.resultsByMpn.size} with quotes, ${result.emptyMpns.size} empty`
            );

            // Apply positive results to lines + write cache rows.
            for (const upperMpn of mpnsInChunk) {
              const tuples = batchQueueByMpn.get(upperMpn) ?? [];
              const quotes = result.resultsByMpn.get(upperMpn) ?? [];

              if (quotes.length > 0) {
                // Merge quotes into every line that wanted this MPN.
                for (const { lineId, alt } of tuples) {
                  const acc = lineQuotesAcc.get(lineId);
                  const stats = lineStatsAcc.get(lineId);
                  if (!acc || !stats) continue;
                  const newRows: FlatQuote[] = [];
                  const accSigs = new Set(
                    acc.map((x) => `${x.source}|${x.supplier_part_number ?? ""}|${x.warehouse_code ?? ""}|${x.unit_price}`)
                  );
                  for (const q of quotes) {
                    const sig = `${q.source}|${q.supplier_part_number ?? ""}|${q.warehouse_code ?? ""}|${q.unit_price}`;
                    if (accSigs.has(sig)) continue;
                    accSigs.add(sig);
                    const conv = await toCad(q.unit_price, q.currency);
                    const flat: FlatQuote = {
                      ...q,
                      unit_price_cad: conv?.cad ?? null,
                      fx_rate_applied: conv?.rate ?? null,
                      quoted_mpn: alt.mpn,
                      from_cache: false,
                      cache_age_hours: null,
                    };
                    acc.push(flat);
                    newRows.push(flat);
                  }
                  if (newRows.length > 0) {
                    write({ type: "line_quotes_append", bom_line_id: lineId, quotes: newRows });
                  }
                  stats.liveHits++;
                }

                // Cache the positive rows. One upsert per (source, search_key,
                // supplier_part_number, warehouse_code) — same shape as the
                // per-MPN path. Use the search_key the per-MPN path would
                // have used so cache lookups match.
                const firstAlt = tuples[0]?.alt;
                const searchedMpn = firstAlt?.mpn ?? upperMpn;
                await Promise.all(
                  quotes.map((q) =>
                    supabase.from("api_pricing_cache").upsert(
                      {
                        source: q.source,
                        mpn: q.mpn || searchedMpn,
                        search_key: (searchedMpn + (q.warehouse_code ? `#${q.warehouse_code}` : "")).toUpperCase(),
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
                        fetched_at: new Date().toISOString(),
                        expires_at: expiresAt,
                      },
                      { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                    )
                  )
                );
              } else if (result.emptyMpns.has(upperMpn)) {
                // Negative-cache, with the existing "don't overwrite a known
                // positive" guard. Run sequentially per MPN — needs a SELECT
                // before each upsert and the volume is bounded by chunkSize.
                const searchedMpn = tuples[0]?.alt.mpn ?? upperMpn;
                const searchKeyUp = upperMpn;
                const { data: existingPositive } = await supabase
                  .from("api_pricing_cache")
                  .select("unit_price")
                  .eq("source", supplier)
                  .eq("search_key", searchKeyUp)
                  .maybeSingle();
                const hasPositive =
                  existingPositive?.unit_price != null &&
                  Number(existingPositive.unit_price) > 0;
                if (hasPositive) {
                  console.info(
                    `[pricing-fetch] ${supplier} mpn=${searchedMpn} EMPTY-but-existing-positive → KEEPING old cache row`
                  );
                } else {
                  await supabase.from("api_pricing_cache").upsert(
                    {
                      source: supplier,
                      mpn: searchedMpn,
                      search_key: searchKeyUp,
                      response: {} as Record<string, unknown>,
                      unit_price: null,
                      stock_qty: null,
                      currency: null,
                      manufacturer: null,
                      supplier_part_number: null,
                      price_breaks: [] as unknown as Record<string, unknown>,
                      lead_time_days: null,
                      moq: null,
                      order_multiple: null,
                      lifecycle_status: null,
                      ncnr: null,
                      franchised: null,
                      warehouse_code: null,
                      fetched_at: new Date().toISOString(),
                      expires_at: expiresAt,
                    },
                    { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                  );
                }
              }

              // Whether positive, empty, or no-record-from-API, this MPN is
              // resolved for every (line, alt) that wanted it.
              for (const { lineId } of tuples) {
                const st = lineStateMap.get(lineId);
                st?.pending.delete(upperMpn);
              }
            }

            // Finalize any line whose pending set just emptied.
            for (const upperMpn of mpnsInChunk) {
              for (const { lineId } of batchQueueByMpn.get(upperMpn) ?? []) {
                tryFinalizeLine(lineId);
              }
            }
          };

          // Run chunks with the same per-supplier in-flight cap as everyone
          // else (4) so we never burst more requests at Arrow than its
          // limiter allows.
          const cap = SUPPLIER_CAP_OVERRIDES[supplier] ?? SUPPLIER_IN_FLIGHT_CAP;
          let chunkCursor = 0;
          const chunkRunner = async () => {
            while (true) {
              if (supplierSignal.aborted) return;
              const idx = chunkCursor++;
              if (idx >= chunks.length) return;
              try {
                await processChunk(chunks[idx]);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[pricing-fetch] ${supplier} chunk ${idx} dispatcher caught: ${msg}`);
              }
            }
          };
          await Promise.all(Array.from({ length: Math.max(1, Math.min(cap, chunks.length)) }, () => chunkRunner()));

          if (supplierSignal.aborted) {
            if (!cancelEmitted) {
              write({ type: "supplier_cancelled", supplier });
              cancelEmitted = true;
            }
            // Drain any not-yet-finalized lines so other suppliers' line_done
            // events can still fire.
            for (const lineId of lineStateMap.keys()) {
              const st = lineStateMap.get(lineId);
              if (st && !st.finalized) {
                st.pending.clear();
                tryFinalizeLine(lineId);
              }
            }
          }
        };

        // Launch a fully independent dispatcher per supplier. Each has its
        // own cursor, its own concurrency pool (sized by the supplier's cap),
        // and never waits on any other supplier's progress.
        await Promise.all(suppliers.map(async (supplier) => {
          // Batch-capable suppliers (arrow_com today) take the bulk path:
          // one HTTP call covers up to N MPNs, instead of one call per line.
          if (isBatchableSupplier(supplier)) {
            await processBatchSupplier(supplier);
            return;
          }
          const cap = SUPPLIER_CAP_OVERRIDES[supplier] ?? LINE_CONCURRENCY;
          const effectiveCap = Math.max(1, Math.min(cap, linesArr.length));
          // Per-supplier abort signal from the cancel registry. Aborts when
          // either /cancel is called for this supplier or the master "cancel
          // all" fires. Falls back to a never-aborted dummy when no
          // request_id was supplied.
          const supplierSignal: AbortSignal = registered
            ? registered.perSupplier.get(supplier)!.signal
            : new AbortController().signal;
          let cursor = 0;
          let doneCount = 0;
          let cancelEmitted = false;

          const lineRunner = async () => {
            while (true) {
              if (supplierSignal.aborted) return;
              const idx = cursor++;
              if (idx >= linesArr.length) return;
              const line = linesArr[idx];
              try {
                await processLineForSupplier(supplier, line);
              } catch (err) {
                // Don't let one line's exception kill the whole supplier
                // dispatcher — log and keep moving.
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(
                  `[pricing-fetch] ${supplier} line=${line.id} dispatcher caught: ${msg}`
                );
              }
              doneCount++;
              write({
                type: "supplier_progress",
                supplier,
                lines_done: doneCount,
                lines_total: linesArr.length,
              });
              finalizeLineIfDone(line.id);
              if (supplierSignal.aborted) return;
            }
          };

          await Promise.all(
            Array.from({ length: effectiveCap }, () => lineRunner())
          );

          // If we exited because the supplier was cancelled, the unprocessed
          // lines still hold a "remaining" slot for this supplier in their
          // countdown — without releasing them, no line can ever finalize
          // (and the UI never sees `line_done` for the lines that other
          // suppliers DID complete). Walk the remaining indices and
          // finalize on this supplier's behalf.
          if (supplierSignal.aborted) {
            if (!cancelEmitted) {
              write({ type: "supplier_cancelled", supplier });
              cancelEmitted = true;
            }
            // Drain whatever the dispatchers haven't pulled yet.
            while (cursor < linesArr.length) {
              const idx = cursor++;
              const line = linesArr[idx];
              finalizeLineIfDone(line.id);
            }
          }
        }));

        write({ type: "done", api_calls: apiCalls, cache_hits: totalCacheHits, lines_skipped: linesSkipped });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          write({ type: "error", error: msg });
        } catch {
          // controller already closed
        }
      } finally {
        if (requestId) {
          try { unregisterRequest(requestId); } catch { /* ignore */ }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Merge per-qty fetches from a single-qty supplier (Avnet) into one quote per
 * supplier_part_number whose `price_breaks` contains every tier's price.
 */
function mergeSingleQtyResults(
  perQtyResults: { qty: number; rows: SupplierQuote[] }[]
): SupplierQuote[] {
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
