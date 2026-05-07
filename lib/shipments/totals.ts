/**
 * Shipment-quantity totals for a job.
 *
 * A job can be split across any number of partial shipments. After 099, a
 * shipment carries 1..N jobs at varying quantities via shipment_lines, so
 * the per-job total is a sum over shipment_lines (filtered to shipments
 * that aren't cancelled).
 *
 *   shipped     = SUM(shipment_lines.quantity) for non-cancelled shipments
 *   remaining   = max(0, jobs.quantity - shipped)
 *   jobQuantity = jobs.quantity
 *
 * Cancelled shipments are excluded — they didn't actually leave the building.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShipmentTotals = {
  shipped: number;
  remaining: number;
  jobQuantity: number;
};

export async function getJobShipmentTotals(
  supabase: SupabaseClient,
  jobId: string
): Promise<ShipmentTotals> {
  const empty: ShipmentTotals = { shipped: 0, remaining: 0, jobQuantity: 0 };
  if (!jobId) return empty;

  // Job quantity — the target we're shipping toward.
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("quantity")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    console.error("[shipments/totals] job read failed", jobErr.message);
  }
  if (jobErr || !job) return empty;
  const jobQuantity: number = Number(job.quantity ?? 0);

  // Sum quantity across all non-cancelled shipment_lines for this job.
  // We pull shipments(status) inline so we can filter cancelled rows out.
  const { data: rows, error: shipErr } = await supabase
    .from("shipment_lines")
    .select("quantity, shipments!inner(status)")
    .eq("job_id", jobId);

  if (shipErr) {
    console.error("[shipments/totals] shipment_lines read failed", shipErr.message);
  }
  if (shipErr || !rows) {
    return { shipped: 0, remaining: jobQuantity, jobQuantity };
  }

  const shipped = rows.reduce((acc: number, r: { quantity: number | null; shipments: { status?: string | null } | { status?: string | null }[] | null }) => {
    // shipments(status) may come back as an object or array depending on the
    // PostgREST embed shape; handle both.
    const ship = Array.isArray(r.shipments) ? r.shipments[0] : r.shipments;
    if (ship?.status === "cancelled") return acc;
    const q = Number(r.quantity ?? 0);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);

  const remaining = Math.max(0, jobQuantity - shipped);
  return { shipped, remaining, jobQuantity };
}
