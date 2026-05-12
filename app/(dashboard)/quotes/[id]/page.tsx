import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileText,
  Hash,
  Layers,
  Mail,
  Percent,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { QuoteCurrencyControl } from "@/components/quotes/quote-currency-control";
import { PricingTable } from "@/components/quotes/pricing-table";
import { ManualPriceEditor } from "@/components/quotes/manual-price-editor";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { LabourBreakdownPanel, type LabourSettingsContext } from "@/components/quotes/labour-breakdown-panel";
import { MarkupOverrideEditor } from "@/components/quotes/markup-override-editor";
import { LeadTimesEditor } from "@/components/quotes/lead-times-editor";
import { DeleteQuoteButton } from "@/components/quotes/delete-quote-button";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/utils/format";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";
import type { PricingTier, MissingPriceComponent } from "@/lib/pricing/types";

interface QuoteDetailCustomer {
  code: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
}

interface QuoteDetailGmp {
  gmp_number: string;
  board_name: string | null;
}

interface QuoteDetailBom {
  file_name: string;
  revision: string | null;
}

interface QuotePricingTierInputs {
  qty?: number;
  pcb_unit_price?: number;
  nre_programming?: number;
  nre_stencil?: number;
  nre_pcb_fab?: number;
}

interface QuotePricingJson {
  tiers?: PricingTier[];
  warnings?: string[];
  missing_price_components?: MissingPriceComponent[];
  tier_inputs?: QuotePricingTierInputs[];
}

function CompactStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center text-gray-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data, error },
    { data: linkedJob },
    { data: csRows },
    { data: labourRow },
    { data: pricingSettingsRow },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name, board_side), boms(file_name, revision)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("jobs")
      .select("id, status")
      .eq("quote_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .eq("quote_id", id),
    supabase
      .from("labour_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "pricing")
      .maybeSingle(),
  ]);

  if (error || !data) {
    notFound();
  }

  const quote = data;
  const customer = quote.customers as unknown as QuoteDetailCustomer | null;
  const gmp = quote.gmps as unknown as QuoteDetailGmp | null;
  const bom = quote.boms as unknown as QuoteDetailBom | null;
  const quantities = quote.quantities as unknown as Record<string, number> | null;
  const pricing = quote.pricing as unknown as QuotePricingJson | null;
  const tiers = pricing?.tiers ?? [];
  const warnings = pricing?.warnings ?? [];
  const leadTimes = (quote.lead_times ?? {}) as Record<string, string>;
  let missingPriceComponents = pricing?.missing_price_components ?? [];

  // Fallback for old quotes: compute missing-price components live from BOM lines + pricing cache
  if (missingPriceComponents.length === 0 && warnings.some((w) => w.includes("no price"))) {
    const { data: bomLines } = await supabase
      .from("bom_lines")
      .select("id, mpn, cpc, description, quantity")
      .eq("bom_id", quote.bom_id)
      .eq("is_pcb", false)
      .eq("is_dni", false);

    if (bomLines && bomLines.length > 0) {
      // Build search keys: include both MPN and CPC values for cache lookup
      const searchKeys = new Set<string>();
      for (const l of bomLines) {
        if (l.mpn) searchKeys.add(l.mpn);
        if (l.cpc) searchKeys.add(l.cpc);
      }
      const keysArr = [...searchKeys];
      const { data: cached } = keysArr.length > 0
        ? await supabase
            .from("api_pricing_cache")
            .select("search_key")
            .in("search_key", keysArr)
            .gte("expires_at", new Date().toISOString())
        : { data: [] };

      const cachedKeys = new Set((cached ?? []).map((c) => c.search_key));
      missingPriceComponents = bomLines
        .filter((l) => {
          // Component has a price if its MPN or CPC is in the cache
          const hasMpnPrice = l.mpn && cachedKeys.has(l.mpn);
          const hasCpcPrice = l.cpc && cachedKeys.has(l.cpc);
          return !hasMpnPrice && !hasCpcPrice;
        })
        .map((l) => ({
          bom_line_id: l.id,
          mpn: l.mpn || l.cpc || l.id,  // fallback to CPC then bom_line UUID
          cpc: l.cpc ?? undefined,
          description: l.description ?? "",
          qty_per_board: l.quantity,
        }));
    }
  }

  // Normalize the `quote.quantities` JSONB across two shapes:
  //   1. Legacy flat:   { qty_1: 50, qty_2: 100, ... }  (plain numbers).
  //   2. Wizard nested: { tiers: [50,100,150,500],
  //                       tier_pcb_prices: { "50": 1.2, ... },
  //                       nre: { programming, stencil, pcb_fab },
  //                       shipping_flat: N }
  // The previous render did Object.values() on the whole blob, which on
  // nested quotes produced "[object Object] / 50,100,150 / 0 / ...".
  const rawQuantities = (quote.quantities ?? {}) as Record<string, unknown>;
  const rawTiers = rawQuantities.tiers;
  const qtyValues: number[] = Array.isArray(rawTiers)
    ? rawTiers.filter((v): v is number => typeof v === "number")
    : Object.values(rawQuantities).filter(
        (v): v is number => typeof v === "number"
      );

  // NRE — prefer the wizard's nested `quantities.nre` block; fall back to
  // `pricing.tier_inputs[0]` (engine input if ever echoed) and finally to
  // the legacy flat `quotes.nre_charge` column.
  const nreBlock = (rawQuantities.nre ?? {}) as Partial<{
    programming: number;
    stencil: number;
    pcb_fab: number;
  }>;
  const firstTierInput = pricing?.tier_inputs?.[0] ?? {};
  const nreProgramming = Number(
    nreBlock.programming ?? firstTierInput.nre_programming ?? 0
  );
  const nreStencil = Number(
    nreBlock.stencil ?? firstTierInput.nre_stencil ?? 0
  );
  const nrePcbFab = Number(
    nreBlock.pcb_fab ?? firstTierInput.nre_pcb_fab ?? 0
  );
  const nreBreakdownTotal = nreProgramming + nreStencil + nrePcbFab;
  const nreTotal =
    nreBreakdownTotal > 0
      ? nreBreakdownTotal
      : quote.nre_charge != null
        ? Number(quote.nre_charge)
        : 0;
  const hasNreBreakdown = nreBreakdownTotal > 0;

  // Customer-supplied parts — loaded from the join of quote_customer_supplied
  // with bom_lines so we can show the actual MPN / description / per-board
  // qty the customer is expected to ship.
  const csLineIds = (csRows ?? []).map((r) => r.bom_line_id);
  const { data: csLineData } = csLineIds.length > 0
    ? await supabase
        .from("bom_lines")
        .select("id, line_number, mpn, cpc, description, manufacturer, quantity, reference_designator")
        .in("id", csLineIds)
        .order("line_number", { ascending: true })
    : { data: [] };
  const customerSuppliedLines = csLineData ?? [];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/quotes">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Quotes
        </Button>
      </Link>

      {/* Workflow Banner */}
      <WorkflowBanner
        currentPageStep="quote"
        entities={{
          bomId: quote.bom_id,
          bomStatus: "parsed",
          quoteId: id,
          quoteStatus: quote.status,
          jobId: linkedJob?.id ?? undefined,
          jobStatus: linkedJob?.status ?? undefined,
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900 dark:text-gray-100">
              {quote.quote_number}
            </h2>
            <QuoteStatusBadge status={quote.status} />
            <QuoteCurrencyControl
              quoteId={id}
              currency={
                (quote as { currency?: string | null }).currency === "USD"
                  ? "USD"
                  : "CAD"
              }
              fxRate={Number(
                (quote as { fx_rate_to_cad?: number | string | null })
                  .fx_rate_to_cad ?? 1
              )}
              locked={
                quote.status === "sent" ||
                quote.status === "accepted" ||
                quote.status === "expired"
              }
            />
          </div>
          <p className="mt-1 text-gray-500">
            {customer
              ? `${customer.code} — ${customer.company_name}`
              : "Unknown customer"}
            {gmp ? ` / ${gmp.gmp_number}` : ""}
            {gmp?.board_name ? ` (${gmp.board_name})` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <QuoteActions
            quoteId={id}
            currentStatus={quote.status}
            tiers={tiers.map((t) => ({
              board_qty: t.board_qty,
              subtotal: t.subtotal,
              per_unit: t.per_unit,
            }))}
          />
          <Link href={`/api/quotes/${id}/pdf`} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </Link>
          <DeleteQuoteButton quoteId={id} quoteName={quote.quote_number} />
        </div>
      </div>

      {/* Grouped summary cards — BOM Info, Pricing, Dates & Lead Times. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* BOM Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              BOM Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <CompactStat
              icon={<FileText className="h-3.5 w-3.5" />}
              label="BOM File"
              value={
                <>
                  <span className="font-medium">{bom?.file_name ?? "—"}</span>
                  {bom?.revision && (
                    <span className="ml-1 text-xs text-gray-500">Rev {bom.revision}</span>
                  )}
                </>
              }
            />
            <CompactStat
              icon={<Hash className="h-3.5 w-3.5" />}
              label="Quantities"
              value={
                <>
                  <span className="font-mono font-medium">
                    {qtyValues.length > 0 ? qtyValues.join(" / ") : "—"}
                  </span>
                  <span className="ml-1 text-xs text-gray-500">
                    ({qtyValues.length} tier{qtyValues.length !== 1 ? "s" : ""})
                  </span>
                </>
              }
            />
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <CompactStat
              icon={<Layers className="h-3.5 w-3.5" />}
              label="NRE (one-time)"
              value={
                <>
                  <span className="font-medium">
                    {nreTotal > 0 || hasNreBreakdown ? formatCurrency(nreTotal) : "—"}
                  </span>
                  {hasNreBreakdown && (
                    <span className="ml-1 text-xs text-gray-500">
                      (
                      {[
                        nreProgramming > 0 ? `Prog ${formatCurrency(nreProgramming)}` : null,
                        nreStencil > 0 ? `Stencil ${formatCurrency(nreStencil)}` : null,
                        nrePcbFab > 0 ? `PCB ${formatCurrency(nrePcbFab)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      )
                    </span>
                  )}
                </>
              }
            />
            <CompactStat
              icon={<Percent className="h-3.5 w-3.5" />}
              label="Component Markup"
              value={
                <span className="font-medium">
                  {tiers[0]?.component_markup_pct != null
                    ? `${Number(tiers[0].component_markup_pct)}%`
                    : quote.component_markup != null
                      ? `${Number(quote.component_markup)}%`
                      : "—"}
                </span>
              }
            />
            <CompactStat
              icon={<Percent className="h-3.5 w-3.5" />}
              label="PCB Markup"
              value={
                <span className="font-medium">
                  {tiers[0]?.pcb_markup_pct != null
                    ? `${Number(tiers[0].pcb_markup_pct)}%`
                    : "—"}
                </span>
              }
            />
            <CompactStat
              icon={<Percent className="h-3.5 w-3.5" />}
              label="Assembly Markup"
              value={
                <span className="font-medium">
                  {tiers[0]?.assembly_markup_pct != null
                    ? `${Number(tiers[0].assembly_markup_pct)}%`
                    : "—"}
                </span>
              }
            />
          </CardContent>
        </Card>

        {/* Dates & Lead Times */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Dates &amp; Lead Times
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <CompactStat
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Expires"
              value={
                <>
                  <span className="font-medium">
                    {quote.expires_at ? formatDate(quote.expires_at) : "Not set"}
                  </span>
                  <span className="ml-1 text-xs text-gray-500">
                    ({quote.validity_days ?? 30}d validity)
                  </span>
                </>
              }
            />
            <CompactStat
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Lead Times"
              value={
                <LeadTimesEditor
                  quoteId={id}
                  qtyValues={qtyValues}
                  initialLeadTimes={leadTimes}
                  canEdit={quote.status === "draft" || quote.status === "review"}
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Customer-supplied parts — lines the customer will ship to RS.
          Excluded from the component cost math, but the customer needs to
          see exactly which parts they're responsible for. */}
      {customerSuppliedLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Customer-Supplied Parts</CardTitle>
            <p className="text-sm text-gray-500">
              {customerSuppliedLines.length} part
              {customerSuppliedLines.length === 1 ? "" : "s"} to be supplied by
              the customer — excluded from quoted component cost.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-gray-500 dark:border-gray-800">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">CPC</th>
                    <th className="py-2 pr-3">MPN</th>
                    <th className="py-2 pr-3">Manufacturer</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Designators</th>
                    <th className="py-2 pr-3 text-right">Qty / Board</th>
                    {qtyValues.map((q) => (
                      <th key={q} className="py-2 pr-3 text-right">
                        × {q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customerSuppliedLines.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b last:border-b-0 dark:border-gray-800"
                    >
                      <td className="py-2 pr-3 text-gray-400">{l.line_number}</td>
                      <td className="py-2 pr-3 font-mono">{l.cpc ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono">{l.mpn ?? "—"}</td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                        {l.manufacturer ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                        {l.description ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 max-w-[240px] truncate">
                        {l.reference_designator ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{l.quantity}</td>
                      {qtyValues.map((q) => (
                        <td key={q} className="py-2 pr-3 text-right font-mono">
                          {l.quantity * q}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Table */}
      {tiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pricing Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <PricingTable
              tiers={tiers}
              warnings={warnings}
              missingPriceComponents={missingPriceComponents}
              displayCurrency={
                (quote as { currency?: string | null }).currency === "USD"
                  ? "USD"
                  : "CAD"
              }
              fxRateToCad={Number(
                (quote as { fx_rate_to_cad?: number | string | null })
                  .fx_rate_to_cad ?? 1
              )}
            />
          </CardContent>
        </Card>
      )}

      {/* Markup Overrides — per-tier (component / PCB / assembly) */}
      {tiers.length > 0 && (
        <MarkupOverrideEditor
          quoteId={id}
          tiers={tiers.map((t) => t.board_qty)}
          globalComponentPct={Number(
            (pricingSettingsRow?.value as { component_markup_pct?: number } | null)
              ?.component_markup_pct ?? 20
          )}
          globalPcbPct={Number(
            (pricingSettingsRow?.value as { pcb_markup_pct?: number } | null)
              ?.pcb_markup_pct ?? 30
          )}
          globalAssemblyPct={Number(
            (pricingSettingsRow?.value as { assembly_markup_pct?: number } | null)
              ?.assembly_markup_pct ?? 30
          )}
          tierOverrides={
            ((quote.quantities as Record<string, unknown> | null)
              ?.tier_markup_overrides as Record<
              string,
              {
                component_markup_pct?: number | null;
                pcb_markup_pct?: number | null;
                assembly_markup_pct?: number | null;
              }
            >) ?? {}
          }
          canEdit={quote.status === "draft" || quote.status === "review"}
        />
      )}

      {/* Labour Breakdown — step-by-step derivation for verification */}
      {tiers.length > 0 && tiers.some((t) => t.labour) && (
        <LabourBreakdownPanel
          tiers={tiers}
          labour={(labourRow ?? null) as LabourSettingsContext | null}
          isDouble={
            (quote.gmps as unknown as { board_side?: string | null } | null)
              ?.board_side !== "single"
          }
          boardsPerPanel={Number(quote.boards_per_panel ?? 1) || 1}
        />
      )}

      {/* Manual price editor — only for draft/review quotes with missing prices */}
      {missingPriceComponents.length > 0 &&
        (quote.status === "draft" || quote.status === "review") && (
          <ManualPriceEditor
            quoteId={id}
            missingComponents={missingPriceComponents}
          />
        )}

      {/* Customer contact card */}
      {customer?.contact_email && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              Customer Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {customer.contact_name && (
              <p className="font-medium">{customer.contact_name}</p>
            )}
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Mail className="h-3 w-3" />
              <a
                href={`mailto:${customer.contact_email}`}
                className="text-blue-600 hover:underline"
              >
                {customer.contact_email}
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {quote.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex flex-wrap gap-6 border-t pt-4 text-xs text-gray-400">
        <span>Created: {formatDateTime(quote.created_at)}</span>
        <span>Updated: {formatDateTime(quote.updated_at)}</span>
        {quote.issued_at && <span>Issued: {formatDateTime(quote.issued_at)}</span>}
        {quote.accepted_at && (
          <span>Accepted: {formatDateTime(quote.accepted_at)}</span>
        )}
      </div>
    </div>
  );
}
