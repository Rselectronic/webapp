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
      assembly_type, boards_per_panel, ipc_class, solder_type,
      pinned_preference,
      customers(code, company_name),
      gmps(gmp_number, board_name),
      boms(file_name, revision)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();

  // Pull tiers out of quantities JSONB (stored there by the step-1 saver).
  const tierQtys = Array.isArray((quote.quantities as { tiers?: unknown })?.tiers)
    ? ((quote.quantities as { tiers: number[] }).tiers)
    : [];

  // -------------------------------------------------------------------------
  // Load everything Step 2's PricingReviewPanel needs. Step 2 won't render
  // for consign_parts_supplied / assembly_only, but fetching these is cheap
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
  // Multi-warehouse suppliers (Arrow, Newark) write their cache rows under
  // `MPN#WAREHOUSE` keys, so we match both exact MPN and MPN#* — otherwise
  // warehouse-specific quotes vanish on reload while pinned selections stay,
  // producing the "0 quotes but N picked" confusion.
  const uniqueKeys = [...new Set(searchKeys)];
  const orFilter = uniqueKeys
    .flatMap((k) => [`search_key.eq.${k}`, `search_key.like.${k}#*`])
    .join(",");
  const { data: cachedQuotes } = uniqueKeys.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("source, search_key, unit_price, currency, stock_qty, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at")
        .or(orFilter)
        .gte("expires_at", new Date().toISOString())
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
          boards_per_panel: quote.boards_per_panel ?? null,
          ipc_class: quote.ipc_class ?? null,
          solder_type: quote.solder_type ?? null,
          assembly_type: quote.assembly_type ?? null,
          pinned_preference: quote.pinned_preference ?? null,
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
          credentialStatus: credStatusMap,
        }}
      />
    </div>
  );
}
