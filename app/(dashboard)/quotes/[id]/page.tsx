import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
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
import { PricingTable } from "@/components/quotes/pricing-table";
import { QuoteActions } from "@/components/quotes/quote-actions";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/utils/format";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";
import type { PricingTier } from "@/lib/pricing/types";

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

interface QuotePricingJson {
  tiers?: PricingTier[];
  warnings?: string[];
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, { data: linkedJob }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name), boms(file_name, revision)"
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

  const qtyValues = quantities ? Object.values(quantities) : [];

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
          <QuoteActions quoteId={id} currentStatus={quote.status} quantity={qtyValues[0]} />
          <Link href={`/api/quotes/${id}/pdf`} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </Link>
        </div>
      </div>

      {/* Info cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* BOM File */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <FileText className="h-4 w-4" />
              BOM File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{bom?.file_name ?? "—"}</p>
            {bom?.revision && (
              <p className="text-sm text-gray-500">Rev {bom.revision}</p>
            )}
          </CardContent>
        </Card>

        {/* Quantities */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Hash className="h-4 w-4" />
              Quantities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono font-medium">
              {qtyValues.length > 0 ? qtyValues.join(" / ") : "—"}
            </p>
            <p className="text-sm text-gray-500">
              {qtyValues.length} tier{qtyValues.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Expires */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              Expires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {quote.expires_at ? formatDate(quote.expires_at) : "Not set"}
            </p>
            <p className="text-sm text-gray-500">
              {quote.validity_days ?? 30} day validity
            </p>
          </CardContent>
        </Card>

        {/* NRE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Layers className="h-4 w-4" />
              NRE Charge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {quote.nre_charge != null
                ? formatCurrency(Number(quote.nre_charge))
                : "—"}
            </p>
          </CardContent>
        </Card>

        {/* PCB Unit Price */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Layers className="h-4 w-4" />
              PCB Unit Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {quote.pcb_cost_per_unit != null
                ? formatCurrency(Number(quote.pcb_cost_per_unit))
                : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Component Markup */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Percent className="h-4 w-4" />
              Component Markup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {quote.component_markup != null
                ? `${Number(quote.component_markup)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Table */}
      {tiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pricing Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <PricingTable tiers={tiers} warnings={warnings} />
          </CardContent>
        </Card>
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
