import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Cpu, FileText, Lock, Package, Plus, Printer } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminRole, isProductionRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { JobActions } from "@/components/jobs/job-actions";
import { ProgrammingStatusActions } from "@/components/jobs/programming-status-actions";
import { ShippingActions } from "@/components/shipping/shipping-actions";
import { NCRCreateDialog } from "@/components/ncr/ncr-create-dialog";
import { PoPricingSection } from "@/components/jobs/po-pricing-section";
import { DeleteJobButton } from "@/components/jobs/delete-job-button";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";
import { JobScheduler } from "@/components/production/job-scheduler";
import { DueDateEditor } from "@/components/jobs/due-date-editor";
import { formatDate, formatDateTime } from "@/lib/utils/format";

interface JobCustomer {
  code: string;
  company_name: string;
}

interface JobGmp {
  gmp_number: string;
  board_name: string | null;
  board_side: string | null;
}

interface JobQuote {
  quote_number: string;
  pricing: { tiers?: { board_qty: number; subtotal: number }[] } | null;
  quantities: Record<string, number> | null;
}

interface StatusLogEntry {
  field: "status" | "programming_status";
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
  changed_by: string | null;
  users: { full_name: string | null } | null;
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

  // Auth gate at the app layer. The reads below use the admin client because
  // production-role users have no SELECT policy that matches the joined
  // queries (jobs + nested customers/gmps/quotes), so a user-scoped read
  // returns null → the page 404s for Piyush. Middleware already enforces
  // role-based path access, so by the time we render this page we know the
  // caller has been allowed onto /jobs/[id].
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) redirect("/login?error=account_disabled");
  if (!isAdminRole(profile.role) && !isProductionRole(profile.role)) {
    redirect("/");
  }
  // Production-role users see a slimmer detail page — no commercial /
  // financial blocks. PO unit price, NRE, and the Quote vs PO comparison
  // are admin-only.
  const callerIsAdmin = isAdminRole(profile.role);

  const [
    jobResult,
    statusLogResult,
    productionResult,
    procResult,
    invResult,
    shipmentResult,
  ] = await Promise.all([
    admin
      .from("jobs")
      .select(
        "*, customers(code, company_name), gmps(gmp_number, board_name, board_side), quotes!jobs_quote_id_fkey(quote_number, pricing, quantities)"
      )
      .eq("id", id)
      .single(),
    admin
      .from("job_status_log")
      .select(
        "field, old_status, new_status, notes, created_at, changed_by, users:changed_by(full_name)"
      )
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("production_events")
      .select("id, event_type, notes, created_at, users:operator_id(full_name)")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("procurements")
      .select("id, status")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("invoices")
      .select("id, status")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // After migration 099 `shipments` no longer has job_id/quantity —
    // those moved to `shipment_lines`. Query through lines for this job
    // and reshape into the array of shipments-with-lines that
    // <ShippingActions> expects (each shipment carries its line(s) for
    // THIS job; lines for other jobs in the same multi-job shipment are
    // out of scope on the job detail card).
    admin
      .from("shipment_lines")
      .select(
        "id, quantity, job_id, shipments(id, carrier, tracking_number, ship_date, estimated_delivery, actual_delivery, shipping_cost, status, picked_up_by, notes, created_at)"
      )
      .eq("job_id", id),
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

  // Once a job is invoiced it's commercially closed — every mutating action
  // on the page is hidden so we don't get phantom edits to a settled job.
  // NCR (quality issues) is the one exception: post-delivery defects must
  // still be recordable.
  const lockedDown = job.status === "invoiced";

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

      {lockedDown && (
        <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
          <p>
            This job is invoiced — actions locked. Use Quality (NCR) to record
            any post-delivery issues.
          </p>
        </div>
      )}

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

        <div className="flex flex-wrap items-start gap-2">
          {!lockedDown && (
            <JobScheduler
              jobId={id}
              jobNumber={job.job_number}
              scheduledStart={job.scheduled_start}
              scheduledCompletion={job.scheduled_completion}
            />
          )}
          <NCRCreateDialog jobId={id} customerId={job.customer_id} />
          {!lockedDown && (
            <ProgrammingStatusActions
              jobId={id}
              initialStatus={
                ((job as { programming_status?: string }).programming_status ??
                  "not_ready") as "not_ready" | "ready" | "not_required"
              }
            />
          )}
          {!lockedDown && <JobActions jobId={id} currentStatus={job.status} />}
          {callerIsAdmin && canCreateProcurement && !lockedDown && (
            <Link href={`/proc/pending`}>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Create Procurement
              </Button>
            </Link>
          )}
          {callerIsAdmin && !lockedDown && (
            <DeleteJobButton jobId={id} jobNumber={job.job_number} />
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
              Board Side
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">
              {gmp?.board_side ?? "—"}
            </p>
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
              {job.scheduled_start ? formatDate(job.scheduled_start) : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Scheduled Completion
              <span className="ml-1 text-[10px] font-normal text-gray-400">
                (production)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {job.scheduled_completion
                ? formatDate(job.scheduled_completion)
                : "Not set"}
            </p>
            {/* Late-delivery risk: production target is past the customer
                deadline. Surface it here so it can't be missed. */}
            {job.scheduled_completion &&
              (job as { due_date?: string | null }).due_date &&
              job.scheduled_completion >
                ((job as { due_date?: string | null }).due_date as string) && (
                <p className="mt-1 text-[10px] font-medium text-red-700">
                  ⚠ Past customer due date
                </p>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Due Date
              <span className="ml-1 text-[10px] font-normal text-gray-400">
                (customer)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callerIsAdmin && !lockedDown ? (
              <DueDateEditor
                jobId={id}
                initialDueDate={
                  (job as { due_date?: string | null }).due_date ?? null
                }
              />
            ) : (
              <p className="text-sm">
                {(job as { due_date?: string | null }).due_date
                  ? formatDate((job as { due_date?: string }).due_date as string)
                  : "Not set"}
              </p>
            )}
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

      {/* PO Pricing Validation — admin-only. Production users don't see
          commercial / financial detail. Hidden once invoiced — pricing is
          settled at that point and the section's purpose is to validate
          before invoicing. */}
      {callerIsAdmin && !lockedDown && (
        <PoPricingSection
          jobId={id}
          jobQuantity={job.quantity}
          quoteId={job.quote_id ?? null}
          quotePricing={quote?.pricing ?? null}
          quoteQuantities={quote?.quantities ?? null}
          jobPoUnitPrice={
            (job as { po_unit_price?: number | null }).po_unit_price ?? null
          }
          jobNreChargeCad={
            (job as { nre_charge_cad?: number | null }).nre_charge_cad ?? null
          }
          jobNreIncludedOnPo={
            (job as { nre_included_on_po?: boolean | null }).nre_included_on_po ?? null
          }
          metadata={
            (job.metadata as { po_price?: number; [key: string]: unknown } | null) ??
            null
          }
        />
      )}

      {/* Shipping Section */}
      {/* Reshape shipment_lines query → array of shipments-with-lines for
          <ShippingActions>. Each shipment_lines row carries its parent
          shipment via the join; group by shipment.id and attach a single
          line entry for this job. Sort newest-first.
          Hidden when the job is invoiced — <ShippingActions> mixes mutating
          affordances with the shipment history, and we can't selectively
          disable only the writes from outside that component. The shipment
          history remains accessible via /shipping. */}
      {!lockedDown && (() => {
        type RawLine = {
          id: string;
          quantity: number;
          job_id: string;
          shipments:
            | {
                id: string;
                carrier: string;
                tracking_number: string | null;
                ship_date: string | null;
                estimated_delivery: string | null;
                actual_delivery: string | null;
                shipping_cost: number | null;
                status: string;
                picked_up_by: string | null;
                notes: string | null;
                created_at: string;
              }
            | null;
        };
        const rawLines = (shipmentResult.data ?? []) as unknown as RawLine[];
        const byShipment = new Map<
          string,
          {
            id: string;
            carrier: string;
            tracking_number: string | null;
            ship_date: string | null;
            estimated_delivery: string | null;
            actual_delivery: string | null;
            shipping_cost: number | null;
            status: string;
            picked_up_by: string | null;
            notes: string | null;
            created_at: string;
            lines: { id: string; job_id: string; quantity: number }[];
          }
        >();
        for (const r of rawLines) {
          if (!r.shipments) continue;
          const s = r.shipments;
          let entry = byShipment.get(s.id);
          if (!entry) {
            entry = { ...s, lines: [] };
            byShipment.set(s.id, entry);
          }
          entry.lines.push({
            id: r.id,
            job_id: r.job_id,
            quantity: Number(r.quantity ?? 0),
          });
        }
        const shipments = Array.from(byShipment.values()).sort((a, b) =>
          a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
        );
        return (
          <ShippingActions
            jobId={id}
            jobNumber={job.job_number}
            jobQuantity={job.quantity}
            currentStatus={job.status}
            metadata={(job.metadata ?? {}) as Record<string, unknown>}
            shipments={shipments}
          />
        );
      })()}

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
                {statusLog.map((entry, i) => {
                  // PostgREST returns the embedded users row as either an
                  // object or a single-element array depending on the FK
                  // metadata; normalise both shapes.
                  const u = Array.isArray(entry.users)
                    ? entry.users[0]
                    : entry.users;
                  const changedByName = u?.full_name ?? null;
                  // Programming-status changes share the timeline with
                  // lifecycle status changes, but are visually distinct so
                  // they don't get mistaken for the main status flow.
                  const isProgramming = entry.field === "programming_status";
                  const dotOuter = isProgramming
                    ? "bg-purple-100"
                    : "bg-blue-100";
                  const dotInner = isProgramming
                    ? "bg-purple-600"
                    : "bg-blue-600";
                  const prefix = isProgramming ? "Programming: " : "";
                  return (
                    <li key={i} className="mb-6 ml-6 last:mb-0">
                      <span className={`absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${dotOuter}`}>
                        {isProgramming ? (
                          <Cpu className="h-2.5 w-2.5 text-purple-700" />
                        ) : (
                          <span className={`h-2 w-2 rounded-full ${dotInner}`} />
                        )}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {entry.old_status && (
                            <>
                              <span className="text-xs capitalize text-gray-400">
                                {prefix}{entry.old_status.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs text-gray-400">
                                &rarr;
                              </span>
                            </>
                          )}
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {!entry.old_status && prefix}
                            {entry.new_status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <time className="text-xs text-gray-500">
                          {formatDateTime(entry.created_at)}
                          {changedByName ? ` by ${changedByName}` : ""}
                        </time>
                        {entry.notes && (
                          <p className="mt-1 text-xs text-gray-600">
                            {entry.notes}
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
                          {formatDateTime(event.created_at)}
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
