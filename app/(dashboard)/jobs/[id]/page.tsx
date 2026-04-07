import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, FileText, Package, Plus, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { JobActions } from "@/components/jobs/job-actions";
import { ShippingActions } from "@/components/shipping/shipping-actions";
import { NCRCreateDialog } from "@/components/ncr/ncr-create-dialog";
import { PoPricingSection } from "@/components/jobs/po-pricing-section";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";

interface JobCustomer {
  code: string;
  company_name: string;
}

interface JobGmp {
  gmp_number: string;
  board_name: string | null;
}

interface JobQuote {
  quote_number: string;
  pricing: { tiers?: { board_qty: number; subtotal: number }[] } | null;
  quantities: Record<string, number> | null;
}

interface StatusLogEntry {
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
}

interface ProductionEvent {
  id: string;
  event_type: string;
  notes: string | null;
  created_at: string;
  users: { full_name: string } | null;
}

const PROCUREMENT_ELIGIBLE_STATUSES = [
  "procurement",
  "parts_ordered",
  "parts_received",
  "production",
  "inspection",
  "shipping",
  "delivered",
  "invoiced",
];

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [jobResult, statusLogResult, productionResult, procResult, invResult] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "*, customers(code, company_name), gmps(gmp_number, board_name), quotes(quote_number, pricing, quantities)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("job_status_log")
      .select("old_status, new_status, notes, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("production_events")
      .select("id, event_type, notes, created_at, users:operator_id(full_name)")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("procurements")
      .select("id, status")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("id, status")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (jobResult.error || !jobResult.data) {
    notFound();
  }

  const job = jobResult.data;
  const customer = job.customers as unknown as JobCustomer | null;
  const gmp = job.gmps as unknown as JobGmp | null;
  const quote = job.quotes as unknown as JobQuote | null;
  const statusLog = (statusLogResult.data ?? []) as unknown as StatusLogEntry[];
  const productionEvents = (productionResult.data ??
    []) as unknown as ProductionEvent[];

  const canCreateProcurement = PROCUREMENT_ELIGIBLE_STATUSES.includes(
    job.status
  );

  return (
    <div className="space-y-6">
      <Link href="/jobs">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>
      </Link>

      {/* Workflow Banner */}
      <WorkflowBanner
        currentPageStep={
          job.status === "shipping" || job.status === "delivered"
            ? "shipping"
            : job.status === "production" || job.status === "inspection"
              ? "production"
              : "job"
        }
        entities={{
          bomId: job.bom_id,
          bomStatus: "parsed",
          quoteId: job.quote_id ?? undefined,
          quoteStatus: "accepted",
          jobId: id,
          jobStatus: job.status,
          procurementId: procResult.data?.id ?? undefined,
          procurementStatus: procResult.data?.status ?? undefined,
          invoiceId: invResult.data?.id ?? undefined,
          invoiceStatus: invResult.data?.status ?? undefined,
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {job.job_number}
            </h2>
            <JobStatusBadge status={job.status} />
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
          <NCRCreateDialog jobId={id} customerId={job.customer_id} />
          <JobActions jobId={id} currentStatus={job.status} />
          {canCreateProcurement && (
            <Link href={`/procurement/new?job_id=${id}`}>
              <Button variant="outline" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Create Procurement
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.quantity}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Assembly Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.assembly_type ?? "TB"}</p>
          </CardContent>
        </Card>

        {quote && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Quote</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/quotes/${job.quote_id}`}
                className="font-mono text-blue-600 hover:underline"
              >
                {quote.quote_number}
              </Link>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Scheduled Start
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {job.scheduled_start
                ? new Date(job.scheduled_start).toLocaleDateString()
                : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Scheduled Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {job.scheduled_completion
                ? new Date(job.scheduled_completion).toLocaleDateString()
                : "Not set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {job.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {job.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* PO Pricing Validation */}
      <PoPricingSection
        jobId={id}
        jobQuantity={job.quantity}
        quoteId={job.quote_id ?? null}
        quotePricing={quote?.pricing ?? null}
        quoteQuantities={quote?.quantities ?? null}
        metadata={
          (job.metadata as { po_price?: number; [key: string]: unknown } | null) ??
          null
        }
      />

      {/* Shipping Section */}
      <ShippingActions
        jobId={id}
        jobNumber={job.job_number}
        currentStatus={job.status}
        metadata={(job.metadata ?? {}) as Record<string, unknown>}
      />

      {/* Status Timeline + Production Events side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLog.length === 0 ? (
              <p className="text-sm text-gray-500">
                No status changes recorded yet.
              </p>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2">
                {statusLog.map((entry, i) => (
                  <li key={i} className="mb-6 ml-6 last:mb-0">
                    <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                      <span className="h-2 w-2 rounded-full bg-blue-600" />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        {entry.old_status && (
                          <>
                            <span className="text-xs capitalize text-gray-400">
                              {entry.old_status.replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-gray-400">
                              &rarr;
                            </span>
                          </>
                        )}
                        <span className="text-sm font-medium capitalize text-gray-900">
                          {entry.new_status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <time className="text-xs text-gray-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </time>
                      {entry.notes && (
                        <p className="mt-1 text-xs text-gray-600">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Production Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4" />
              Production Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productionEvents.length === 0 ? (
              <p className="text-sm text-gray-500">
                No production events logged yet.
              </p>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2">
                {productionEvents.map((event) => {
                  const operator = event.users as unknown as {
                    full_name: string;
                  } | null;
                  return (
                    <li key={event.id} className="mb-6 ml-6 last:mb-0">
                      <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-green-100 ring-4 ring-white">
                        <span className="h-2 w-2 rounded-full bg-green-600" />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium capitalize text-gray-900">
                          {event.event_type.replace(/_/g, " ")}
                        </span>
                        <time className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleString()}
                          {operator ? ` by ${operator.full_name}` : ""}
                        </time>
                        {event.notes && (
                          <p className="mt-1 text-xs text-gray-600">
                            {event.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Production Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Printer className="h-4 w-4" />
            Production Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Download print-ready documents for the production floor.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a
              href={`/api/jobs/${id}/production-docs?type=job-card`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Job Card
              </Button>
            </a>
            <a
              href={`/api/jobs/${id}/production-docs?type=traveller`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileText className="h-4 w-4 text-green-600" />
                Production Traveller
              </Button>
            </a>
            <a
              href={`/api/jobs/${id}/production-docs?type=print-bom`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileText className="h-4 w-4 text-purple-600" />
                Print Copy BOM
              </Button>
            </a>
            <a
              href={`/api/jobs/${id}/production-docs?type=reception`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileText className="h-4 w-4 text-orange-600" />
                Reception File
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
