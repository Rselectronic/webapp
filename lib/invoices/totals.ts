/**
 * Invoice-quantity totals for a job.
 *
 * After migration 100, an invoice carries 1..N jobs at varying quantities via
 * `invoice_lines`, and a single job's total may be split across multiple
 * invoices (partial invoicing). The per-job total is therefore a sum over
 * `invoice_lines` filtered to invoices that aren't cancelled.
 *
 *   invoiced     = SUM(invoice_lines.quantity) for non-cancelled invoices
 *   remaining    = max(0, jobs.quantity - invoiced)
 *   jobQuantity  = jobs.quantity
 *
 * Cancelled invoices are excluded — they're voided.
 *
 * Mirrors lib/shipments/totals.ts in shape and intent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceTotals = {
  invoiced: number;
  remaining: number;
  jobQuantity: number;
};

export async function getJobInvoiceTotals(
  supabase: SupabaseClient,
  jobId: string
): Promise<InvoiceTotals> {
  const empty: InvoiceTotals = { invoiced: 0, remaining: 0, jobQuantity: 0 };
  if (!jobId) return empty;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("quantity")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    console.error("[invoices/totals] job read failed", jobErr.message);
  }
  if (jobErr || !job) return empty;
  const jobQuantity: number = Number(job.quantity ?? 0);

  // Sum invoice_lines.quantity across non-cancelled invoices. NRE lines
  // (is_nre=true) carry qty=1 but represent an engineering charge, not a
  // board — they're excluded from the board-quantity total.
  const { data: rows, error: linesErr } = await supabase
    .from("invoice_lines")
    .select("quantity, invoices!inner(status)")
    .eq("job_id", jobId)
    .eq("is_nre", false);

  if (linesErr) {
    console.error("[invoices/totals] invoice_lines read failed", linesErr.message);
  }
  if (linesErr || !rows) {
    return { invoiced: 0, remaining: jobQuantity, jobQuantity };
  }

  const invoiced = rows.reduce(
    (
      acc: number,
      r: {
        quantity: number | null;
        invoices: { status?: string | null } | { status?: string | null }[] | null;
      }
    ) => {
      const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
      if (inv?.status === "cancelled") return acc;
      const q = Number(r.quantity ?? 0);
      return acc + (Number.isFinite(q) ? q : 0);
    },
    0
  );

  const remaining = Math.max(0, jobQuantity - invoiced);
  return { invoiced, remaining, jobQuantity };
}

/**
 * List of jobs that have been delivered (or shipped) but are not yet fully
 * invoiced — i.e. the candidates that should appear in a "Pending Invoice"
 * section. A job qualifies if:
 *   - status is 'delivered' OR 'invoiced' (partially invoiced jobs revert to
 *     'delivered' when not fully covered, but we also want to surface
 *     'invoiced'-marked jobs in case manual edits left them in a weird state)
 *   AND
 *   - SUM(invoice_lines.quantity for non-cancelled invoices) < jobs.quantity
 *
 * The query is bounded (status filter + limit) so it stays fast even when the
 * jobs table grows. Ordering: oldest delivered first — the operator should
 * bill those before the fresh ones.
 */
export type DeliveredNotInvoicedJob = {
  id: string;
  job_number: string;
  customer_id: string;
  quantity: number;
  invoiced_qty: number;
  remaining_qty: number;
  delivered_qty: number;
  status: string;
};

export async function getDeliveredButNotInvoicedJobs(
  supabase: SupabaseClient
): Promise<DeliveredNotInvoicedJob[]> {
  // Pull candidate jobs first (status filter); compute totals per-job in JS.
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, job_number, customer_id, quantity, status, ready_to_ship_qty")
    .in("status", ["delivered", "invoiced"])
    .order("actual_completion", { ascending: true, nullsFirst: false })
    .limit(200);

  if (jobsErr || !jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);

  // Sum delivered (shipment_lines on non-cancelled shipments).
  const { data: shipLines } = await supabase
    .from("shipment_lines")
    .select("job_id, quantity, shipments!inner(status)")
    .in("job_id", jobIds);
  const deliveredByJob = new Map<string, number>();
  for (const r of (shipLines ?? []) as Array<{
    job_id: string;
    quantity: number | null;
    shipments: { status?: string | null } | { status?: string | null }[] | null;
  }>) {
    const ship = Array.isArray(r.shipments) ? r.shipments[0] : r.shipments;
    if (ship?.status === "cancelled") continue;
    const q = Number(r.quantity ?? 0);
    deliveredByJob.set(r.job_id, (deliveredByJob.get(r.job_id) ?? 0) + (Number.isFinite(q) ? q : 0));
  }

  // Sum invoiced (invoice_lines on non-cancelled invoices). NRE lines
  // are excluded — they're engineering charges, not boards.
  const { data: invLines } = await supabase
    .from("invoice_lines")
    .select("job_id, quantity, invoices!inner(status)")
    .in("job_id", jobIds)
    .eq("is_nre", false);
  const invoicedByJob = new Map<string, number>();
  for (const r of (invLines ?? []) as Array<{
    job_id: string;
    quantity: number | null;
    invoices: { status?: string | null } | { status?: string | null }[] | null;
  }>) {
    const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
    if (inv?.status === "cancelled") continue;
    const q = Number(r.quantity ?? 0);
    invoicedByJob.set(r.job_id, (invoicedByJob.get(r.job_id) ?? 0) + (Number.isFinite(q) ? q : 0));
  }

  const results: DeliveredNotInvoicedJob[] = [];
  for (const j of jobs) {
    const invoiced = invoicedByJob.get(j.id) ?? 0;
    const delivered = deliveredByJob.get(j.id) ?? 0;
    const remaining = Math.max(0, Number(j.quantity ?? 0) - invoiced);
    if (remaining <= 0) continue; // fully invoiced — not pending
    results.push({
      id: j.id,
      job_number: j.job_number,
      customer_id: j.customer_id,
      quantity: Number(j.quantity ?? 0),
      invoiced_qty: invoiced,
      delivered_qty: delivered,
      remaining_qty: remaining,
      status: j.status,
    });
  }
  return results;
}
