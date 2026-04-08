import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CreditCard,
  Download,
  FileText,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";

interface InvoiceCustomer {
  code: string;
  company_name: string;
  contact_name: string | null;
  payment_terms: string | null;
}

interface InvoiceJob {
  job_number: string;
  gmp_id: string;
  bom_id: string | null;
  quote_id: string | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
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
      "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, bom_id, quote_id, gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const invoice = data;
  const customer = invoice.customers as unknown as InvoiceCustomer | null;
  const job = invoice.jobs as unknown as InvoiceJob | null;
  const gmp = job?.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;

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
  const freight = Number(invoice.freight ?? 0);
  const discount = Number(invoice.discount ?? 0);
  const total = Number(invoice.total ?? 0);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/invoices">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
      </Link>

      {/* Workflow Banner */}
      <WorkflowBanner
        currentPageStep="invoice"
        entities={{
          bomId: job?.bom_id ?? undefined,
          bomStatus: "parsed",
          quoteId: job?.quote_id ?? undefined,
          quoteStatus: "accepted",
          jobId: invoice.job_id,
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
            {gmp ? ` / ${gmp.gmp_number}` : ""}
            {gmp?.board_name ? ` (${gmp.board_name})` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <InvoiceActions invoiceId={id} currentStatus={effectiveStatus} />
          <Link href={`/api/invoices/${id}/pdf`} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </Link>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Briefcase className="h-4 w-4" />
              Job
            </CardTitle>
          </CardHeader>
          <CardContent>
            {job ? (
              <Link
                href={`/jobs/${invoice.job_id}`}
                className="font-mono font-medium text-blue-600 hover:underline"
              >
                {job.job_number}
              </Link>
            ) : (
              <p className="font-medium">—</p>
            )}
          </CardContent>
        </Card>

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

      {/* Pricing Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pricing Breakdown
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

            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">TPS/GST (5%)</span>
              <span className="font-mono">{formatCurrency(tpsGst)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">TVQ/QST (9.975%)</span>
              <span className="font-mono">{formatCurrency(tvqQst)}</span>
            </div>

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
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments Section */}
      <PaymentsSection invoiceId={id} invoiceNumber={invoice.invoice_number} total={total} currentStatus={effectiveStatus} />

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

const METHOD_LABELS: Record<string, string> = {
  cheque: "Cheque",
  wire: "Wire Transfer",
  eft: "EFT",
  credit_card: "Credit Card",
};

async function PaymentsSection({
  invoiceId,
  invoiceNumber,
  total,
  currentStatus,
}: {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  currentStatus: string;
}) {
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });

  const allPayments = payments ?? [];
  const totalPaid = allPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );
  const outstanding = total - totalPaid;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Payments
          {allPayments.length > 0 && (
            <span className="text-sm font-normal text-gray-500">
              ({formatCurrency(totalPaid)} of {formatCurrency(total)} paid
              {outstanding > 0 ? ` — ${formatCurrency(outstanding)} outstanding` : ""})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allPayments.length > 0 ? (
          <div className="space-y-2">
            {allPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono font-medium text-green-700">
                    {formatCurrency(Number(p.amount))}
                  </span>
                  <span className="text-gray-500">
                    {formatDate(p.payment_date)}
                  </span>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                  </span>
                  {p.reference_number && (
                    <span className="font-mono text-xs text-gray-400">
                      Ref: {p.reference_number}
                    </span>
                  )}
                </div>
                {p.notes && (
                  <span className="max-w-xs truncate text-xs text-gray-400">
                    {p.notes}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payments recorded yet.</p>
        )}

        {currentStatus !== "paid" && currentStatus !== "cancelled" && (
          <RecordPaymentForm
            invoiceId={invoiceId}
            invoiceNumber={invoiceNumber}
            invoiceTotal={total}
            totalPaid={totalPaid}
          />
        )}
      </CardContent>
    </Card>
  );
}
