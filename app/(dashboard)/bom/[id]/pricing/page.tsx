import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PricingReviewPanel } from "@/components/pricing-review/pricing-review-panel";
import { listCredentialStatus } from "@/lib/supplier-credentials";
import { BUILT_IN_SUPPLIER_NAMES } from "@/lib/supplier-credentials";

export default async function BomPricingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: bom } = await supabase
    .from("boms")
    .select("id, file_name, revision, status, gmp_id, customer_id, customers(code, company_name), gmps(gmp_number, board_name)")
    .eq("id", id)
    .single();
  if (!bom) notFound();

  const [
    { data: lines },
    { data: selections },
    { data: fxRates },
    { data: overageRows },
  ] = await Promise.all([
    // NB: pin_count is intentionally excluded here — it only exists after
    // migration 041 is applied. Omitting it keeps this page functional even
    // on a DB that hasn't been migrated yet. Once 041 ships, the pricing
    // review page doesn't actually need pin_count; TH-pin UI lives on the
    // BOM detail table.
    supabase
      .from("bom_lines")
      .select("id, line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, is_pcb, is_dni")
      .eq("bom_id", id)
      .eq("is_pcb", false)
      .eq("is_dni", false)
      .gt("quantity", 0)
      .order("line_number"),
    supabase
      .from("bom_line_pricing")
      .select("bom_line_id, tier_qty, supplier, supplier_part_number, selected_unit_price, selected_currency, selected_unit_price_cad, fx_rate, selected_lead_time_days, selected_stock_qty, warehouse_code, notes, selected_at")
      .in("bom_line_id", []),   // overwritten below once we know line ids
    supabase
      .from("fx_rates")
      .select("from_currency, to_currency, rate, source, fetched_at"),
    // Overage table drives the qty/extras/order-qty math per BOM line per tier.
    supabase
      .from("overage_table")
      .select("m_code, qty_threshold, extras"),
  ]);

  // Second-pass: grab selections for this BOM's lines (the .in([]) above is
  // just a placeholder because we can't do subqueries through PostgREST easily;
  // easier to query once we know the ids).
  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: lineSelections } = lineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, supplier, supplier_part_number, selected_unit_price, selected_currency, selected_unit_price_cad, fx_rate, selected_lead_time_days, selected_stock_qty, warehouse_code, notes, selected_at")
        .in("bom_line_id", lineIds)
    : { data: [] };

  // --- Also load any cached api_pricing_cache rows so the page shows
  //     previously-fetched quotes immediately (without another round-trip). ---
  const searchKeys: string[] = [];
  for (const l of lines ?? []) {
    if (l.mpn) searchKeys.push(l.mpn.toUpperCase());
    if (l.cpc) searchKeys.push(l.cpc.toUpperCase());
  }
  // Also include alt MPNs from bom_line_alternates — otherwise cached LCSC/
  // DigiKey rows fetched under an alternate MPN are invisible to this page
  // even though auto-pick (which searches by alts too) will still pick them.
  if (lineIds.length > 0) {
    const { data: altRows } = await supabase
      .from("bom_line_alternates")
      .select("mpn")
      .in("bom_line_id", lineIds);
    for (const a of altRows ?? []) {
      if (a.mpn && a.mpn.trim()) searchKeys.push(a.mpn.toUpperCase());
    }
  }
  // And include customer_parts.mpn_to_use — same reason: if RS has a known
  // replacement for a CPC, the cache may only have rows under that MPN.
  if (bom?.customer_id) {
    const cpcsForLookup = [
      ...new Set(
        (lines ?? [])
          .map((l) => l.cpc)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
      ),
    ];
    if (cpcsForLookup.length > 0) {
      const { data: cpRows } = await supabase
        .from("customer_parts")
        .select("mpn_to_use")
        .eq("customer_id", bom.customer_id)
        .in("cpc", cpcsForLookup);
      for (const r of cpRows ?? []) {
        if (r.mpn_to_use && r.mpn_to_use.trim()) {
          searchKeys.push(r.mpn_to_use.trim().toUpperCase());
        }
      }
    }
  }
  // Multi-warehouse suppliers store cache rows with "MPN#WAREHOUSE" keys
  // (Arrow, Newark). Exact-match .in() loses them on reload; use an OR
  // filter that accepts both exact MPN and MPN#* variants.
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
  const { data: cachedQuotes } = uniqueKeys.length > 0
    ? await supabase
        .from("api_pricing_cache")
        .select("source, search_key, unit_price, currency, stock_qty, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, lifecycle_status, ncnr, franchised, warehouse_code, fetched_at")
        .or(orFilter)
        .gte("expires_at", new Date().toISOString())
    : { data: [] };

  // Know which suppliers have credentials so the UI can gray out missing ones.
  let credStatusMap: Record<string, boolean> = {};
  try {
    const statuses = await listCredentialStatus();
    credStatusMap = Object.fromEntries(
      statuses.map((s) => [s.supplier, s.configured])
    );
  } catch {
    // If SUPPLIER_CREDENTIALS_KEY is missing, we can't read creds — treat all
    // as "configured" so the UI isn't misleading; the fetch call will fail
    // gracefully with per-supplier errors.
    credStatusMap = Object.fromEntries(BUILT_IN_SUPPLIER_NAMES.map((n) => [n, true]));
  }

  // Supabase types FK joins as arrays even when the relationship is 1:1,
  // so we go via `unknown` and cast to the actual shape we use.
  const customer = bom.customers as unknown as
    | { code: string; company_name: string }
    | null;
  const gmp = bom.gmps as unknown as
    | { gmp_number: string; board_name: string | null }
    | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/bom/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to BOM
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Component Pricing Review
        </h2>
        <div className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
          <span className="font-mono">{customer?.code}</span>
          <span>—</span>
          <span>{gmp?.gmp_number ?? bom.file_name}</span>
          <span>·</span>
          <span>{lines?.length ?? 0} components</span>
        </div>
      </div>

      <PricingReviewPanel
        bomId={id}
        lines={(lines ?? []).map((l) => ({
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
        }))}
        initialSelections={lineSelections ?? []}
        initialCachedQuotes={cachedQuotes ?? []}
        initialFxRates={fxRates ?? []}
        overages={(overageRows ?? []).map((o) => ({
          m_code: o.m_code,
          qty_threshold: o.qty_threshold,
          extras: o.extras,
        }))}
        credentialStatus={credStatusMap}
      />
    </div>
  );
}
