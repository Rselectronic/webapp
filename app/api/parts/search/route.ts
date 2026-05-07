import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  runSupplierSearchDiag,
  supplierCanServiceMpn,
} from "@/lib/pricing/registry";
import {
  BUILT_IN_SUPPLIER_NAMES,
  listCredentialStatus,
} from "@/lib/supplier-credentials";
import type { BuiltInSupplierName } from "@/lib/supplier-credentials";
import { SUPPLIER_METADATA } from "@/lib/supplier-metadata";
import { getRate } from "@/lib/pricing/fx";
import type { SupplierQuote, PriceBreak } from "@/lib/pricing/types";

// Octopart-style unified live search. Fans out to every configured supplier
// in parallel, normalizes currency to CAD, returns a flat per-supplier
// summary plus aggregated totals. No cache writes — this is a live lookup.

const SINGLE_QTY_SUPPLIERS: ReadonlySet<BuiltInSupplierName> = new Set(["avnet"]);

type SupplierStatus = "ok" | "empty" | "error" | "filtered" | "no_credentials";

interface SearchBody {
  mpn?: unknown;
  manufacturer?: unknown;
  quantity?: unknown;
}

interface EnrichedQuote {
  source: string;
  display_name: string;
  mpn: string;
  manufacturer: string | null;
  supplier_part_number: string | null;
  warehouse_code: string | null;
  unit_price: number;
  unit_price_cad: number | null;
  currency: string;
  fx_rate: number | null;
  extended_cad: number | null;
  effective_qty: number;
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  lead_time_days: number | null;
  lifecycle_status: string | null;
  ncnr: boolean | null;
  franchised: boolean | null;
  price_breaks: PriceBreak[];
  datasheet_url: string | null;
  product_url: string | null;
  description: string | null;
}

interface SupplierResult {
  source: string;
  display_name: string;
  status: SupplierStatus;
  duration_ms: number;
  error?: string;
  quotes: EnrichedQuote[];
}

function computeEffectiveQty(
  requested: number,
  moq: number | null,
  orderMultiple: number | null
): number {
  let q = Math.max(requested, moq ?? 0, 1);
  if (orderMultiple && orderMultiple > 1) {
    q = Math.ceil(q / orderMultiple) * orderMultiple;
  }
  return q;
}

/**
 * Resolve the unit price at a given order quantity by walking the break
 * table. Picks the highest break whose `min_qty <= qty`. Falls back to
 * `fallback` (the quote's headline unit_price) when no breaks are present
 * or nothing matches. Applies uniformly to every supplier — DigiKey, LCSC,
 * Mouser, etc. all return the same shape via their adapter.
 */
function pickUnitPriceAtQty(
  breaks: PriceBreak[] | undefined,
  qty: number,
  fallback: number
): number {
  if (!Array.isArray(breaks) || breaks.length === 0) return fallback;
  const sorted = [...breaks].sort((a, b) => a.min_qty - b.min_qty);
  let pick: PriceBreak | undefined;
  for (const b of sorted) {
    if (!Number.isFinite(b.unit_price) || b.unit_price <= 0) continue;
    if (qty >= b.min_qty) pick = b;
  }
  return pick?.unit_price ?? fallback;
}

export async function POST(req: Request) {
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mpn = typeof body.mpn === "string" ? body.mpn.trim() : "";
  if (!mpn) {
    return NextResponse.json({ error: "mpn is required" }, { status: 400 });
  }
  const manufacturer =
    typeof body.manufacturer === "string" && body.manufacturer.trim().length > 0
      ? body.manufacturer.trim()
      : null;
  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity > 0
      ? Math.floor(body.quantity)
      : 1;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine which built-in suppliers have credentials configured.
  const credStatuses = await listCredentialStatus();
  const configured = new Set(
    credStatuses.filter((c) => c.configured && !c.is_custom).map((c) => c.supplier)
  );

  // Shared FX cache for this request.
  const fxCache = new Map<string, number>();
  fxCache.set("CAD", 1.0);
  const toCad = async (currency: string): Promise<number | null> => {
    if (fxCache.has(currency)) return fxCache.get(currency)!;
    const fx = await getRate(currency, "CAD");
    if (!fx) return null;
    fxCache.set(currency, fx.rate);
    return fx.rate;
  };

  const querySupplier = async (
    supplier: BuiltInSupplierName
  ): Promise<SupplierResult> => {
    const display_name = SUPPLIER_METADATA[supplier].display_name;
    const t0 = Date.now();

    if (!configured.has(supplier)) {
      console.info(
        `[parts-search] ${supplier} mpn=${mpn} NO_CREDS — skipping`
      );
      return {
        source: supplier,
        display_name,
        status: "no_credentials",
        duration_ms: 0,
        quotes: [],
      };
    }

    if (!supplierCanServiceMpn(supplier, mpn, manufacturer)) {
      console.info(
        `[parts-search] ${supplier} mpn=${mpn} FILTERED — does not franchise manufacturer=${manufacturer ?? "—"}`
      );
      return {
        source: supplier,
        display_name,
        status: "filtered",
        duration_ms: 0,
        quotes: [],
      };
    }

    try {
      const ctx = SINGLE_QTY_SUPPLIERS.has(supplier)
        ? { mpn, manufacturer, quantity }
        : { mpn, manufacturer };
      const diag = await runSupplierSearchDiag(supplier, ctx);
      const duration_ms = Date.now() - t0;

      if (diag.error) {
        console.warn(
          `[parts-search] ${supplier} mpn=${mpn} FAIL ${duration_ms}ms — ${diag.error}`
        );
        return {
          source: supplier,
          display_name,
          status: "error",
          duration_ms,
          error: diag.error,
          quotes: [],
        };
      }

      if (diag.quotes.length === 0) {
        console.info(
          `[parts-search] ${supplier} mpn=${mpn} EMPTY ${duration_ms}ms — no products match`
        );
        return {
          source: supplier,
          display_name,
          status: "empty",
          duration_ms,
          quotes: [],
        };
      }

      const enriched: EnrichedQuote[] = [];
      for (const q of diag.quotes as SupplierQuote[]) {
        const rate = await toCad(q.currency);
        const effective_qty = computeEffectiveQty(quantity, q.moq, q.order_multiple);
        // Resolve the actual price at the effective order quantity by
        // walking the break table. `q.unit_price` is usually the break-1
        // price (single-piece / small-qty rate), which massively overstates
        // the cost for high-volume orders where the supplier has a 1k+
        // break far below the headline price. Pick the highest break whose
        // min_qty <= effective_qty; fall back to unit_price if breaks are
        // empty or nothing matches.
        const unitAtQty = pickUnitPriceAtQty(q.price_breaks, effective_qty, q.unit_price);
        const unit_price_cad = rate != null ? unitAtQty * rate : null;
        const extended_cad = unit_price_cad != null ? unit_price_cad * effective_qty : null;
        enriched.push({
          source: q.source,
          display_name,
          mpn: q.mpn,
          manufacturer: q.manufacturer,
          supplier_part_number: q.supplier_part_number,
          warehouse_code: q.warehouse_code,
          unit_price: unitAtQty,
          unit_price_cad,
          currency: q.currency,
          fx_rate: rate,
          extended_cad,
          effective_qty,
          stock_qty: q.stock_qty,
          moq: q.moq,
          order_multiple: q.order_multiple,
          lead_time_days: q.lead_time_days,
          lifecycle_status: q.lifecycle_status,
          ncnr: q.ncnr,
          franchised: q.franchised,
          price_breaks: q.price_breaks,
          datasheet_url: q.datasheet_url,
          product_url: q.product_url,
          description: q.description ?? null,
        });
      }

      const sampleBreaks = enriched[0]?.price_breaks?.length ?? 0;
      const samplePrice = enriched[0]?.unit_price;
      console.info(
        `[parts-search] ${supplier} mpn=${mpn} qty=${quantity} OK ${duration_ms}ms — ${enriched.length} quote(s)${
          sampleBreaks > 0 && samplePrice != null
            ? ` · first quote @ qty ${quantity}: $${samplePrice.toFixed(4)} ${enriched[0]?.currency ?? ""} (${sampleBreaks} breaks)`
            : ""
        }`
      );
      return {
        source: supplier,
        display_name,
        status: "ok",
        duration_ms,
        quotes: enriched,
      };
    } catch (e) {
      const duration_ms = Date.now() - t0;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[parts-search] ${supplier} mpn=${mpn} THROW ${duration_ms}ms — ${msg}`
      );
      return {
        source: supplier,
        display_name,
        status: "error",
        duration_ms,
        error: msg,
        quotes: [],
      };
    }
  };

  // Streaming variant. Instead of awaiting every supplier before replying,
  // we open an NDJSON stream and write one event per supplier as soon as it
  // resolves. The UI can render rows incrementally — LCSC (~500ms) shows up
  // long before DigiKey (~3s), which dramatically improves perceived
  // responsiveness for the 12-supplier fan-out.
  //
  // Event shape (one per line, newline-delimited JSON):
  //   { type: "init",     mpn, suppliers: [names], queried_at }
  //   { type: "supplier", result: SupplierResult }   // one per supplier
  //   { type: "done",     totals, description }      // fired after the last
  //                                                  //   supplier lands
  //
  // The client reader merges these events into SearchResponse shape so the
  // rest of the page stays oblivious to the transport change.
  const queried_at = new Date().toISOString();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      write({
        type: "init",
        mpn,
        queried_at,
        suppliers: BUILT_IN_SUPPLIER_NAMES.map((s) => ({
          source: s,
          display_name: SUPPLIER_METADATA[s].display_name,
        })),
      });

      // Accumulators for the final "done" event.
      let total_quotes = 0;
      let suppliers_with_stock = 0;
      let cheapest_extended_cad: number | null = null;
      let cheapest_source: string | null = null;
      let best_description: string | null = null;
      let suppliers_count = 0;

      // Fire every supplier in parallel. As each promise resolves (or the
      // querySupplier handler converts a throw to an "error" result), emit
      // its event immediately.
      await Promise.all(
        BUILT_IN_SUPPLIER_NAMES.map(async (name) => {
          let result: SupplierResult;
          try {
            result = await querySupplier(name);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result = {
              source: name,
              display_name: SUPPLIER_METADATA[name].display_name,
              status: "error",
              duration_ms: 0,
              error: msg,
              quotes: [],
            };
          }

          suppliers_count++;
          total_quotes += result.quotes.length;
          if (result.quotes.some((q) => q.stock_qty != null && q.stock_qty > 0)) {
            suppliers_with_stock++;
          }
          for (const q of result.quotes) {
            if (q.extended_cad != null) {
              if (cheapest_extended_cad == null || q.extended_cad < cheapest_extended_cad) {
                cheapest_extended_cad = q.extended_cad;
                cheapest_source = q.source;
              }
            }
            if (q.description) {
              const d = q.description.trim();
              if (d.length > 0 && (best_description == null || d.length > best_description.length)) {
                best_description = d;
              }
            }
          }

          write({ type: "supplier", result });
        })
      );

      write({
        type: "done",
        description: best_description,
        totals: {
          total_suppliers_queried: suppliers_count,
          suppliers_with_stock,
          total_quotes,
          cheapest_extended_cad,
          cheapest_source,
        },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
