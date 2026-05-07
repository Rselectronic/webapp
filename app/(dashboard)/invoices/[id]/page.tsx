// ----------------------------------------------------------------------------
// Invoice detail page
//
// Multi-line aware: the meat of the page is a Lines table (one row per
// invoice_line). Totals come from the invoice itself; lines should sum to
// the invoice subtotal but we display whatever's stored.
//
// Layout: lines first (the meat), totals next, payment / status / actions last.
// ----------------------------------------------------------------------------
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Download,
  FileText,
  History,
  ListChecks,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { DeleteInvoiceButton } from "@/components/invoices/delete-invoice-button";
import { PaymentsList } from "@/components/payments/payments-list";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";

interface InvoiceCustomer {
  code: string;
  company_name: string;
  contact_name: string | null;
  payment_terms: string | null;
}

interface InvoiceLineRow {
  id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  description: string | null;
  is_nre: boolean | null;
  job_id: string;
  jobs: {
    id: string;
    job_number: string;
    customers: { code: string; company_name: string } | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
  } | null;
}

interface InvoiceWithLines {
  id: string;
  invoice_number: string;
  status: string;
  job_id: string | null;
  subtotal: number | null;
  tps_gst: number | null;
  tvq_qst: number | null;
  hst: number | null;
  freight: number | null;
  discount: number | null;
  total: number | null;
  issued_date: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  currency: "CAD" | "USD" | null;
  fx_rate_to_cad: number | null;
  tax_region:
    | "QC"
    | "CA_OTHER"
    | "HST_ON"
    | "HST_15"
    | "INTERNATIONAL"
    | null;
  customers: InvoiceCustomer | null;
  invoice_lines: InvoiceLineRow[] | null;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `*, customers(code, company_name, contact_name, payment_terms),
       invoice_lines(
         id, quantity, unit_price, line_total, description, is_nre, job_id,
         jobs(id, job_number, customers(code, company_name), gmps(gmp_number, board_name))
       )`
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const invoice = data as unknown as InvoiceWithLines;
  const customer = invoice.customers;
  const lines = (invoice.invoice_lines ?? []).slice().sort((a, b) => {
    const an = a.jobs?.job_number ?? "";
    const bn = b.jobs?.job_number ?? "";
    return an.localeCompare(bn);
  });

  // Compute effective status (overdue detection)
  let effectiveStatus = invoice.status;
  if (
    invoice.status === "sent" &&
    invoice.due_date &&
    new Date(invoice.due_date).getTime() < Date.now()
  ) {
    effectiveStatus = "overdue";
  }

  const subtotal = Number(invoice.subtotal ?? 0);
  const tpsGst = Number(invoice.tps_gst ?? 0);
  const tvqQst = Number(invoice.tvq_qst ?? 0);
  const hstAmt = Number(invoice.hst ?? 0);
  const freight = Number(invoice.freight ?? 0);
  const discount = Number(invoice.discount ?? 0);
  const total = Number(invoice.total ?? 0);
  const invoiceCurrency = invoice.currency ?? "CAD";
  const invoiceFxRate = Number(invoice.fx_rate_to_cad ?? 1);

  // Sum non-cancelled payments for this invoice — needed by both the
  // header InvoiceActions (to disable Record Payment when fully paid)
  // and the PaymentsSection further down. Single read, two consumers.
  // For USD invoices we also pull each payment's FX rate so we can compute
  // the realized FX delta vs. the invoice's snapshot rate.
  const { data: paymentRows } = await supabase
    .from("payments")
    .select("amount, fx_rate_to_cad, currency")
    .eq("invoice_id", id);
  const paidSoFar = (paymentRows ?? []).reduce(
    (s, p) => s + Number(p.amount ?? 0),
    0
  );

  // FX delta (USD invoices only). Invoice CAD-equivalent = total × invoice_fx.
  // Payment CAD-equivalent = SUM(amount × payment_fx). Difference = realized
  // FX gain (positive) or loss (negative) — a real cash effect that hits
  // the bank because rates moved between issue date and payment date.
  let fxDelta: number | null = null;
  let invoiceCadEquiv: number | null = null;
  let paidCadEquiv: number | null = null;
  if (invoiceCurrency === "USD") {
    invoiceCadEquiv = Math.round(total * invoiceFxRate * 100) / 100;
    paidCadEquiv =
      Math.round(
        (paymentRows ?? []).reduce(
          (s, p) =>
            s +
            Number(p.amount ?? 0) * Number(p.fx_rate_to_cad ?? invoiceFxRate),
          0
        ) * 100
      ) / 100;
    // Delta only meaningful when something has been paid; otherwise it's just
    // the invoice CAD value, which is information already shown elsewhere.
    if ((paymentRows ?? []).length > 0) {
      // Pro-rate the invoice CAD-equivalent by paid fraction so we compare
      // apples to apples (the realised gain/loss reflects what's actually
      // settled to date, not an unrealised mark-to-market).
      const paidFraction = total > 0 ? paidSoFar / total : 0;
      const proratedInvoiceCad =
        Math.round(invoiceCadEquiv * paidFraction * 100) / 100;
      fxDelta =
        Math.round(((paidCadEquiv ?? 0) - proratedInvoiceCad) * 100) / 100;
    }
  }

  // Board count excludes NRE lines (qty=1 engineering charge, not a board).
  const totalQty = lines.reduce(
    (s, l) => s + (l.is_nre ? 0 : Number(l.quantity ?? 0)),
    0
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/invoices">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
      </Link>

      {/* Workflow Banner — anchored to the FIRST line's job (best-effort) */}
      <WorkflowBanner
        currentPageStep="invoice"
        entities={{
          jobId: lines[0]?.job_id ?? invoice.job_id ?? undefined,
          jobStatus: "invoiced",
          invoiceId: id,
          invoiceStatus: effectiveStatus,
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900 dark:text-gray-100">
              {invoice.invoice_number}
            </h2>
            <InvoiceStatusBadge status={effectiveStatus} />
          </div>
          <p className="mt-1 text-gray-500">
            {customer
              ? `${customer.code} — ${customer.company_name}`
              : "Unknown customer"}
            {lines.length > 0 ? (
              <span className="ml-2 text-sm">
                · {lines.length} job{lines.length === 1 ? "" : "s"} · {totalQty}{" "}
                board{totalQty === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
        </div>

        {/* items-start prevents the right-side Delete button from stretching
            vertically when an action child grows (the old InvoiceActions
            inline form was the culprit). The actions are now a modal so
            this is also defence-in-depth. */}
        <div className="flex items-start gap-2">
          <InvoiceActions
            invoiceId={id}
            invoiceNumber={invoice.invoice_number}
            invoiceTotal={total}
            paidSoFar={paidSoFar}
            currentStatus={effectiveStatus}
            invoiceCurrency={invoiceCurrency}
          />
          <Link href={`/api/invoices/${id}/pdf`} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </Link>
          <DeleteInvoiceButton
            invoiceId={id}
            invoiceNumber={invoice.invoice_number}
          />
        </div>
      </div>

      {/* Lines — the meat of the invoice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Lines
            <span className="ml-1 text-sm font-normal text-gray-500">
              ({lines.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm italic text-gray-500">
              No invoice lines on this record.
            </p>
          ) : (
            <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>GMP / Board</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const job = l.jobs;
                    const lineCustomer = job?.customers;
                    const gmp = job?.gmps;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          {job ? (
                            <Link
                              href={`/jobs/${job.id}`}
                              className="font-mono font-medium text-blue-600 hover:underline"
                            >
                              {job.job_number}
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {lineCustomer
                            ? `${lineCustomer.code}`
                            : customer?.code ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {l.is_nre ? (
                            <>
                              <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                                NRE
                              </span>
                              <span className="font-mono">
                                {gmp?.gmp_number ?? ""}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-mono">
                                {gmp?.gmp_number ?? "—"}
                              </span>
                              {gmp?.board_name ? (
                                <span className="ml-1 text-gray-500">
                                  ({gmp.board_name})
                                </span>
                              ) : null}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {l.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(Number(l.unit_price ?? 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatCurrency(Number(l.line_total ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Totals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Discount</span>
                <span className="font-mono text-green-600">
                  -{formatCurrency(discount)}
                </span>
              </div>
            )}

            {tpsGst > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">TPS/GST (5%)</span>
                <span className="font-mono">{formatCurrency(tpsGst)}</span>
              </div>
            )}

            {tvqQst > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">TVQ/QST (9.975%)</span>
                <span className="font-mono">{formatCurrency(tvqQst)}</span>
              </div>
            )}

            {hstAmt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  HST{" "}
                  {invoice.tax_region === "HST_15" ? "(15%)" : "(13%)"}
                </span>
                <span className="font-mono">{formatCurrency(hstAmt)}</span>
              </div>
            )}

            {freight > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Freight</span>
                <span className="font-mono">{formatCurrency(freight)}</span>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="text-lg font-bold">Total Due</span>
                <span className="font-mono text-lg font-bold">
                  {formatCurrency(total)} {invoiceCurrency}
                </span>
              </div>
              {invoiceCurrency === "USD" && invoiceCadEquiv != null ? (
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>
                    CAD-equivalent (FX {invoiceFxRate.toFixed(4)})
                  </span>
                  <span className="font-mono">
                    {formatCurrency(invoiceCadEquiv)} CAD
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FX delta — USD invoices only, only shown after payment(s) recorded */}
      {invoiceCurrency === "USD" && fxDelta != null && paidCadEquiv != null ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">FX Reconciliation (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Paid in USD
                </span>
                <span className="font-mono">
                  {formatCurrency(paidSoFar)} USD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  CAD received (per payment-date FX)
                </span>
                <span className="font-mono">
                  {formatCurrency(paidCadEquiv)} CAD
                </span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="font-medium">
                    Realised FX {fxDelta >= 0 ? "Gain" : "Loss"}
                  </span>
                  <span
                    className={`font-mono font-medium ${
                      fxDelta >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fxDelta >= 0 ? "+" : ""}
                    {formatCurrency(fxDelta)} CAD
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Difference between invoice issue-date rate
                  ({invoiceFxRate.toFixed(4)}) and payment-date rate(s).
                  Customer was billed and paid the agreed USD amount; the CAD
                  variance hits your books.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Status / dates */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              Issued Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {invoice.issued_date ? formatDate(invoice.issued_date) : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              Due Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`font-medium ${
                effectiveStatus === "overdue" ? "text-red-600" : ""
              }`}
            >
              {invoice.due_date ? formatDate(invoice.due_date) : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <FileText className="h-4 w-4" />
              Payment Terms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {customer?.payment_terms ?? "Net 30"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Section */}
      <PaymentsSection
        invoiceId={id}
        invoiceNumber={invoice.invoice_number}
        total={total}
        currentStatus={effectiveStatus}
        invoiceCurrency={invoiceCurrency}
      />

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {invoice.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex flex-wrap gap-6 border-t pt-4 text-xs text-gray-400">
        <span>Created: {formatDateTime(invoice.created_at)}</span>
        <span>Updated: {formatDateTime(invoice.updated_at)}</span>
      </div>
    </div>
  );
}

async function PaymentsSection({
  invoiceId,
  invoiceNumber,
  total,
  currentStatus,
  invoiceCurrency,
}: {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  currentStatus: string;
  invoiceCurrency: "CAD" | "USD";
}) {
  const supabase = await createClient();

  // Migration 101 renamed the columns: payment_method → method,
  // reference_number → reference. Read using the new names but keep
  // the old field names on the row shape so PaymentsList /
  // RecordPaymentDialog (which still use the legacy names internally)
  // can stay unchanged.
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, method, reference, notes")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });

  const rows = (payments ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    payment_date: p.payment_date as string,
    payment_method: p.method as string,
    reference_number: (p.reference as string | null) ?? null,
    notes: (p.notes as string | null) ?? null,
  }));

  const totalPaid = rows.reduce((s, p) => s + p.amount, 0);
  const recordingDisabled =
    currentStatus === "cancelled" || totalPaid >= total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Payments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PaymentsList
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          invoiceTotal={total}
          payments={rows}
          recordingDisabled={recordingDisabled}
          invoiceCurrency={invoiceCurrency}
        />
      </CardContent>
    </Card>
  );
}
