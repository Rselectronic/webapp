import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { QuoteWizard } from "@/components/quote-wizard/quote-wizard";
import { listCredentialStatus, BUILT_IN_SUPPLIER_NAMES } from "@/lib/supplier-credentials";

export default async function QuoteWizardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(`
      id, quote_number, status, wizard_status, procurement_mode,
      customer_id, gmp_id, bom_id, quantities, pricing,
      boards_per_panel, ipc_class, solder_type,
      pinned_preference,
      customers(code, company_name),
      gmps(gmp_number, board_name, boards_per_panel, board_side, ipc_class, solder_type),
      boms(file_name, revision)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();

  // The GMP is the source of truth for board geometry. Every BOM revision
  // and every quote under the same GMP shares the same physical board, so
  // we prefer the GMP values over whatever this quote happened to be saved
  // with — older quotes calculated before the operator filled the GMP can
  // otherwise show stale defaults forever. If the GMP itself is blank
  // (legacy data), we fall back to the quote's own copy.
  const gmpBoard = (quote.gmps as {
    boards_per_panel?: number | null;
    board_side?: string | null;
    ipc_class?: string | null;
    solder_type?: string | null;
  } | null) ?? null;
  const initialBoardsPerPanel = gmpBoard?.boards_per_panel ?? quote.boards_per_panel ?? null;
  const ipcFromGmp = gmpBoard?.ipc_class != null ? Number(gmpBoard.ipc_class) : null;
  const ipcRaw =
    ipcFromGmp === 1 || ipcFromGmp === 2 || ipcFromGmp === 3
      ? ipcFromGmp
      : quote.ipc_class ?? null;
  const initialIpcClass = ipcRaw === 1 || ipcRaw === 2 || ipcRaw === 3 ? ipcRaw : null;
  // gmps.solder_type uses "lead-free", quotes.solder_type uses "leadfree".
  const solderRaw = gmpBoard?.solder_type ?? quote.solder_type ?? null;
  const initialSolderType =
    solderRaw === "leaded" ? "leaded"
    : solderRaw === "leadfree" || solderRaw === "lead-free" ? "leadfree"
    : null;
  // Physical layout — sourced from gmps.board_side. The wizard form writes
  // changes back to the GMP via the calculate route, so the GMP stays the
  // single source of truth.
  const initialBoardSide: "single" | "double" | null =
    gmpBoard?.board_side === "single" || gmpBoard?.board_side === "double"
      ? gmpBoard.board_side
      : null;

  // Pull tiers out of quantities JSONB (stored there by the step-1 saver).
  const tierQtys = Array.isArray((quote.quantities as { tiers?: unknown })?.tiers)
    ? ((quote.quantities as { tiers: number[] }).tiers)
    : [];

  // Pull step-3 inputs (tier_pcb_prices, nre, shipping_flat) out of
  // quantities JSONB so the wizard can rehydrate them on edit.
  const qty = (quote.quantities ?? {}) as {
    tier_pcb_prices?: Record<string, number>;
    nre?: { programming?: number; stencil?: number; pcb_fab?: number };
    shipping_flat?: number;
    pcb_input_mode?: "unit" | "extended";
  };
  const tierPcbPrices = qty.tier_pcb_prices ?? {};
  const nre = qty.nre ?? {};
  const shippingFlat = qty.shipping_flat ?? null;
  const pcbInputMode =
    qty.pcb_input_mode === "extended" ? "extended" : qty.pcb_input_mode === "unit" ? "unit" : null;

  // -------------------------------------------------------------------------
  // Load everything Step 2's PricingReviewPanel needs. Step 2 won't render
  // for assembly_only, but fetching these is cheap
  // and keeps the wizard page purely server-rendered for SSR consistency.
  // -------------------------------------------------------------------------
  const [
    { data: bomLines },
    { data: fxRates },
    { data: overageRows },
    { data: preferences },
    { data: customerSupplied },
  ] = await Promise.all([
    // Skip qty=0 lines in every pricing path — they're kept in the BOM only
    // so production's print-out shows unpopulated designators, and should
    // not be priced, classified, or procured.
    supabase
      .from("bom_lines")
      .select("id, line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, is_pcb, is_dni")
      .eq("bom_id", quote.bom_id)
      .eq("is_pcb", false)
      .eq("is_dni", false)
      .gt("quantity", 0)
      .order("line_number"),
    supabase
      .from("fx_rates")
      .select("from_currency, to_currency, rate, source, fetched_at"),
    supabase
      .from("overage_table")
      .select("m_code, qty_threshold, extras"),
    supabase
      .from("pricing_preferences")
      .select("id, name, rule, config, is_system, created_by, created_at, updated_at")
      .order("is_system", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .eq("quote_id", id),
  ]);

  // Prior customer-supplied history — scoped to THIS customer's other
  // quotes. For every bom_line on this BOM, surface any earlier quotes
  // where a line with the matching CPC (or MPN fallback) was flagged as
  // customer-supplied. We only read it to display a reminder badge on the
  // pricing review; the operator still has to explicitly mark the line as
  // CS on this quote if they want the same treatment.
  const priorCsLookup = new Map<
    string,
    Array<{ quote_number: string; gmp_number: string | null; board_name: string | null; marked_at: string | null; bom_id: string }>
  >();
  const currentCustomerId = (quote as { customer_id?: string | null }).customer_id ?? null;
  if (currentCustomerId && (bomLines?.length ?? 0) > 0) {
    const cpcs = new Set<string>();
    const mpns = new Set<string>();
    for (const l of bomLines ?? []) {
      if (l.cpc && l.cpc.trim()) cpcs.add(l.cpc.trim().toUpperCase());
      if (l.mpn && l.mpn.trim()) mpns.add(l.mpn.trim().toUpperCase());
    }
    // Pull every CS row for any other quote belonging to this customer, then
    // hydrate the linked bom_line's cpc/mpn + parent quote_number + gmp.
    const { data: priorRows, error: priorErr } = await supabase
      .from("quote_customer_supplied")
      .select(
        "bom_line_id, added_at, quote_id, quotes!inner(id, quote_number, customer_id, gmp_id, gmps(gmp_number, board_name)), bom_lines!inner(cpc, mpn, bom_id)"
      )
      .neq("quote_id", id)
      .eq("quotes.customer_id", currentCustomerId);
    if (priorErr) {
      console.warn(
        `[wizard/prior-cs] query error for customer=${currentCustomerId}: ${priorErr.message}`
      );
    } else {
      console.info(
        `[wizard/prior-cs] customer=${currentCustomerId} rows=${priorRows?.length ?? 0} cpcs=${cpcs.size} mpns=${mpns.size}`
      );
    }
    // Supabase types FK joins as arrays even when the relation is 1:1,
    // so we go via `unknown` and cast to the actual shape we use. This
    // is required for the strict TS check that runs during `next build`.
    for (const r of (priorRows ?? []) as unknown as Array<{
      bom_line_id: string;
      added_at: string | null;
      quote_id: string;
      quotes: { id: string; quote_number: string; gmps: { gmp_number: string | null; board_name: string | null } | null } | null;
      bom_lines: { cpc: string | null; mpn: string | null; bom_id: string } | null;
    }>) {
      const bl = r.bom_lines;
      if (!bl) continue;
      const q = r.quotes;
      const entry = {
        quote_number: q?.quote_number ?? "",
        gmp_number: q?.gmps?.gmp_number ?? null,
        board_name: q?.gmps?.board_name ?? null,
        marked_at: r.added_at,
        bom_id: bl.bom_id,
      };
      const keys: string[] = [];
      if (bl.cpc && bl.cpc.trim()) {
        const k = bl.cpc.trim().toUpperCase();
        if (cpcs.has(k)) keys.push(`cpc:${k}`);
      }
      if (bl.mpn && bl.mpn.trim()) {
        const k = bl.mpn.trim().toUpperCase();
        if (mpns.has(k)) keys.push(`mpn:${k}`);
      }
      for (const k of keys) {
        const arr = priorCsLookup.get(k) ?? [];
        arr.push(entry);
        priorCsLookup.set(k, arr);
      }
    }
  }

  // Materialize into a map keyed by bom_line.id for this BOM so the
  // PricingReviewPanel can look up by line without having to redo the
  // CPC/MPN matching on the client.
  const priorCsByLineId: Record<
    string,
    Array<{ quote_number: string; gmp_number: string | null; board_name: string | null; marked_at: string | null; bom_id: string }>
  > = {};
  for (const l of bomLines ?? []) {
    const hits: typeof priorCsByLineId[string] = [];
    const seen = new Set<string>();
    const add = (k: string) => {
      for (const e of priorCsLookup.get(k) ?? []) {
        const sig = `${e.quote_number}|${e.gmp_number}|${e.bom_id}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        hits.push(e);
      }
    };
    if (l.cpc && l.cpc.trim()) add(`cpc:${l.cpc.trim().toUpperCase()}`);
    if (l.mpn && l.mpn.trim()) add(`mpn:${l.mpn.trim().toUpperCase()}`);
    if (hits.length > 0) {
      // Newest first, so the header badge shows the most recent quote.
      hits.sort((a, b) => (b.marked_at ?? "").localeCompare(a.marked_at ?? ""));
      priorCsByLineId[l.id] = hits;
    }
  }

  const lineIds = (bomLines ?? []).map((l) => l.id);
  const { data: lineSelections } = lineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, supplier, supplier_part_number, selected_unit_price, selected_currency, selected_unit_price_cad, fx_rate, selected_lead_time_days, selected_stock_qty, warehouse_code, notes, selected_at")
        .in("bom_line_id", lineIds)
    : { data: [] };

  const searchKeys: string[] = [];
  for (const l of bomLines ?? []) {
    if (l.mpn) searchKeys.push(l.mpn.toUpperCase());
    if (l.cpc) searchKeys.push(l.cpc.toUpperCase());
  }

  // Also pull alternate MPNs and any `customer_parts.mpn_to_use` override —
  // otherwise the cached quotes panel renders only primary-MPN rows, which
  // mismatches auto-pick (which also searches by alts + mpn_to_use). Users
  // saw "0 quotes shown but auto-pick chose LCSC for 3 tiers" because the
  // LCSC row had been fetched under an alt MPN and the UI never saw it.
  if (lineIds.length > 0) {
    const { data: altRows } = await supabase
      .from("bom_line_alternates")
      .select("mpn")
      .in("bom_line_id", lineIds);
    for (const a of altRows ?? []) {
      if (a.mpn && a.mpn.trim()) searchKeys.push(a.mpn.toUpperCase());
    }
  }
  // customer_parts.mpn_to_use: look up by (customer_id, cpc)
  const customerIdForCache = ((quote as { customer_id?: string | null })?.customer_id) ?? null;
  if (customerIdForCache) {
    const cpcsForLookup = [
      ...new Set(
        (bomLines ?? [])
          .map((l) => l.cpc)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
      ),
    ];
    if (cpcsForLookup.length > 0) {
      const { data: cpRows } = await supabase
        .from("customer_parts")
        .select("mpn_to_use")
        .eq("customer_id", customerIdForCache)
        .in("cpc", cpcsForLookup);
      for (const r of cpRows ?? []) {
        if (r.mpn_to_use && r.mpn_to_use.trim()) {
          searchKeys.push(r.mpn_to_use.trim().toUpperCase());
        }
      }
    }
  }
  // Multi-warehouse suppliers (Arrow, Newark) write their cache rows under
  // `MPN#WAREHOUSE` keys, so we match both exact MPN and MPN#* — otherwise
  // warehouse-specific quotes vanish on reload while pinned selections stay,
  // producing the "0 quotes but N picked" confusion.
  const uniqueKeys = [...new Set(searchKeys)];
  // Quote values that contain PostgREST .or() special chars (,()") so MPNs
  // like "PMEG3020EJ,115" survive the comma-separated filter.
  const pqKey = (k: string) => {
    const needsQuote = /[,()" ]/.test(k);
    return needsQuote ? `"${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : k;
  };
  const orFilter = uniqueKeys
    .flatMap((k) => [`search_key.eq.${pqKey(k)}`, `search_key.like.${pqKey(`${k}#*`)}`])
    .join(",");
  // NOTE: no expires_at filter here — when a quote is edited after the 7-day
  // cache TTL, the rows exist but are "stale". Hiding them makes the Component
  // Pricing step look wiped, even though the user's pinned selections still
  // reference those suppliers. Show them; the user can re-run Fetch Prices to
  // refresh. The floor calculation in /calculate also ignores expiry, so this
  // stays consistent.
  const { data: cachedQuotes } = uniqueKeys.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("source, search_key, unit_price, currency, stock_qty, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at")
        .or(orFilter)
        .limit(50000)
    : { data: [] };

  let credStatusMap: Record<string, boolean> = {};
  try {
    const statuses = await listCredentialStatus();
    credStatusMap = Object.fromEntries(statuses.map((s) => [s.supplier, s.configured]));
  } catch {
    credStatusMap = Object.fromEntries(BUILT_IN_SUPPLIER_NAMES.map((n) => [n, true]));
  }

  const customer = quote.customers as { code?: string; company_name?: string } | null;
  const gmp = quote.gmps as { gmp_number?: string; board_name?: string | null } | null;
  const bom = quote.boms as { file_name?: string; revision?: string } | null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/bom/${quote.bom_id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to BOM
          </Button>
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Quote {quote.quote_number}
          </h2>
          <span className="text-xs uppercase tracking-wide text-gray-500">
            {quote.wizard_status ?? "draft"}
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
          <span className="font-mono">{customer?.code}</span>
          <span>—</span>
          <span>{customer?.company_name}</span>
          <span>·</span>
          <span>{gmp?.gmp_number}</span>
          {gmp?.board_name && (
            <>
              <span>·</span>
              <span className="text-gray-400">{gmp.board_name}</span>
            </>
          )}
          <span>·</span>
          <span>{bom?.file_name} (rev {bom?.revision})</span>
        </div>
      </div>

      <QuoteWizard
        quoteId={id}
        bomId={quote.bom_id}
        initial={{
          wizard_status: quote.wizard_status ?? "draft",
          procurement_mode: quote.procurement_mode ?? null,
          tier_quantities: tierQtys,
          boards_per_panel: initialBoardsPerPanel,
          ipc_class: initialIpcClass,
          solder_type: initialSolderType,
          board_side: initialBoardSide,
          pinned_preference: quote.pinned_preference ?? null,
          tier_pcb_prices: tierPcbPrices,
          nre_programming: nre.programming ?? null,
          nre_stencil: nre.stencil ?? null,
          nre_pcb_fab: nre.pcb_fab ?? null,
          shipping_flat: shippingFlat,
          pcb_input_mode: pcbInputMode,
        }}
        pricingData={{
          lines: (bomLines ?? []).map((l) => ({
            id: l.id,
            line_number: l.line_number,
            quantity: l.quantity,
            reference_designator: l.reference_designator,
            cpc: l.cpc,
            description: l.description,
            mpn: l.mpn,
            manufacturer: l.manufacturer,
            m_code: l.m_code,
            pin_count: null,
          })),
          selections: lineSelections ?? [],
          cachedQuotes: cachedQuotes ?? [],
          fxRates: fxRates ?? [],
          overages: (overageRows ?? []).map((o) => ({
            m_code: o.m_code,
            qty_threshold: o.qty_threshold,
            extras: o.extras,
          })),
          preferences: preferences ?? [],
          customerSuppliedLineIds: (customerSupplied ?? []).map((r) => r.bom_line_id),
          priorCustomerSuppliedByLineId: priorCsByLineId,
          credentialStatus: credStatusMap,
        }}
      />
    </div>
  );
}
