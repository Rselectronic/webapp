// ----------------------------------------------------------------------------
// Shipping page
//
// Two distinct blocks rendered top-to-bottom on the same page:
//
//   1. **Pending Shipment** — jobs with ready_to_ship_qty > 0 and unshipped
//      remainder. Each row is a job (NOT a shipment). Operators select one
//      or more jobs from the SAME customer and click "New Shipment" to open
//      the multi-line dialog. The dialog is rendered once at the page level
//      and driven by the client-side selection state held inside
//      <PendingShipmentSection>.
//
//   2. **Shipped** — the existing shipments list, but each row now bundles
//      multiple jobs (via shipment_lines). The row shows N jobs / total qty,
//      and an expansion shows the line breakdown.
//
// KPI cards roll up across all visible shipments.
// ----------------------------------------------------------------------------

import Link from "next/link";
import { Download, Package, Truck } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingShipmentSection } from "@/components/shipments/pending-shipment-section";
import { ShippedShipmentsSection } from "@/components/shipments/shipped-shipments-section";
import { formatCurrency } from "@/lib/utils/format";

const STATUSES = ["all", "pending", "shipped", "in_transit", "delivered"] as const;
const CARRIERS = [
  "all",
  "FedEx",
  "Purolator",
  "UPS",
  "Canada Post",
  "Customer Pickup",
  "Other",
] as const;

interface SearchParams {
  status?: string;
  carrier?: string;
}

// Row shape for the Pending list: one row per job that has unshipped capacity.
export interface PendingJobRow {
  id: string;
  job_number: string;
  customer_id: string;
  customer_code: string;
  customer_company: string;
  gmp_number: string | null;
  board_name: string | null;
  quantity: number;
  ready_to_ship_qty: number;
  shipped: number;
  available: number;
  due_date: string | null;
}

// Row shape for the Shipped list: one shipment, possibly with multiple lines.
export interface ShipmentRow {
  id: string;
  carrier: string;
  tracking_number: string | null;
  ship_date: string | null;
  estimated_delivery: string | null;
  shipping_cost: number | null;
  status: string;
  picked_up_by: string | null;
  notes: string | null;
  created_at: string;
  customer_code: string | null;
  customer_company: string | null;
  lines: Array<{
    id: string;
    quantity: number;
    job_id: string;
    job_number: string | null;
    gmp_number: string | null;
  }>;
  totalQty: number;
}

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const activeCarrier = params.carrier ?? "all";
  const supabase = await createClient();
  // Admin client for the cross-table reads — the page is gated by middleware
  // and shipping is admin-eligible. Using admin lets us pull jobs +
  // shipment_lines without per-table RLS gymnastics.
  const admin = createAdminClient();

  // -----------------------------------------------------------------
  // Block 1: Pending shipment — jobs with available capacity to ship
  // -----------------------------------------------------------------
  // Pull jobs with ready_to_ship_qty > 0 (the operator has released some
  // boards from production). Then subtract anything already drafted or sent
  // via shipment_lines for that job. `available > 0` jobs make the list.
  //
  // Bounded read: typically tens of jobs across the floor, not thousands.
  const { data: readyJobs, error: readyJobsErr } = await admin
    .from("jobs")
    .select(
      "id, job_number, customer_id, quantity, ready_to_ship_qty, due_date, status, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .gt("ready_to_ship_qty", 0)
    // Jobs that have already been invoiced/archived shouldn't appear — even
    // if a stray ready_to_ship_qty was left non-zero, the workflow is past
    // shipping at that point.
    .not("status", "in", "(archived,invoiced,delivered)")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (readyJobsErr) {
    console.error("[shipping] readyJobs read failed", readyJobsErr.message);
  }

  type ReadyJobRow = {
    id: string;
    job_number: string;
    customer_id: string;
    quantity: number;
    ready_to_ship_qty: number | null;
    due_date: string | null;
    status: string;
    customers: { code: string; company_name: string } | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
  };

  const readyJobsTyped = (readyJobs ?? []) as unknown as ReadyJobRow[];

  // Pull shipment_lines for these jobs to compute already-allocated qty per
  // job. Anything NOT cancelled (status filter applied at shipment level)
  // counts toward the allocation.
  const readyJobIds = readyJobsTyped.map((j) => j.id);
  const shippedByJob = new Map<string, number>();
  if (readyJobIds.length > 0) {
    const { data: linesForReady, error: linesForReadyErr } = await admin
      .from("shipment_lines")
      .select("job_id, quantity, shipments(status)")
      .in("job_id", readyJobIds);
    if (linesForReadyErr) {
      console.error("[shipping] linesForReady read failed", linesForReadyErr.message);
    }

    for (const row of (linesForReady ?? []) as Array<{
      job_id: string;
      quantity: number | null;
      shipments: { status: string } | { status: string }[] | null;
    }>) {
      const ship = Array.isArray(row.shipments)
        ? row.shipments[0]
        : row.shipments;
      if (ship?.status === "cancelled") continue;
      shippedByJob.set(
        row.job_id,
        (shippedByJob.get(row.job_id) ?? 0) + Number(row.quantity ?? 0)
      );
    }
  }

  const pendingRows: PendingJobRow[] = readyJobsTyped
    .map((j) => {
      const ready = Number(j.ready_to_ship_qty ?? 0);
      const shipped = shippedByJob.get(j.id) ?? 0;
      const available = Math.max(0, ready - shipped);
      return {
        id: j.id,
        job_number: j.job_number,
        customer_id: j.customer_id,
        customer_code: j.customers?.code ?? "",
        customer_company: j.customers?.company_name ?? "",
        gmp_number: j.gmps?.gmp_number ?? null,
        board_name: j.gmps?.board_name ?? null,
        quantity: Number(j.quantity ?? 0),
        ready_to_ship_qty: ready,
        shipped,
        available,
        due_date: j.due_date,
      };
    })
    .filter((r) => r.available > 0);

  // -----------------------------------------------------------------
  // Block 2: Shipped — shipments with their lines (multi-job aware)
  // -----------------------------------------------------------------
  let shipmentsQuery = supabase
    .from("shipments")
    .select(
      `id, carrier, tracking_number, ship_date, estimated_delivery,
       shipping_cost, status, picked_up_by, notes, created_at, customer_id,
       customers(code, company_name),
       shipment_lines(id, quantity, job_id, jobs(job_number, gmps(gmp_number)))`
    )
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") shipmentsQuery = shipmentsQuery.eq("status", activeStatus);
  if (activeCarrier !== "all") shipmentsQuery = shipmentsQuery.eq("carrier", activeCarrier);

  const { data: rawShipments, error: shipError } = await shipmentsQuery;

  type RawShipmentRow = {
    id: string;
    carrier: string;
    tracking_number: string | null;
    ship_date: string | null;
    estimated_delivery: string | null;
    shipping_cost: number | null;
    status: string;
    picked_up_by: string | null;
    notes: string | null;
    created_at: string;
    customer_id: string | null;
    customers: { code: string; company_name: string } | null;
    shipment_lines: Array<{
      id: string;
      quantity: number;
      job_id: string;
      jobs: {
        job_number: string;
        gmps: { gmp_number: string } | { gmp_number: string }[] | null;
      } | null;
    }> | null;
  };

  const shipmentRows: ShipmentRow[] = ((rawShipments ?? []) as unknown as RawShipmentRow[]).map(
    (s) => {
      const lines = (s.shipment_lines ?? []).map((l) => {
        const gmp = Array.isArray(l.jobs?.gmps) ? l.jobs?.gmps?.[0] : l.jobs?.gmps;
        return {
          id: l.id,
          quantity: Number(l.quantity ?? 0),
          job_id: l.job_id,
          job_number: l.jobs?.job_number ?? null,
          gmp_number: gmp?.gmp_number ?? null,
        };
      });
      const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
      return {
        id: s.id,
        carrier: s.carrier,
        tracking_number: s.tracking_number,
        ship_date: s.ship_date,
        estimated_delivery: s.estimated_delivery,
        shipping_cost: s.shipping_cost,
        status: s.status,
        picked_up_by: s.picked_up_by,
        notes: s.notes,
        created_at: s.created_at,
        customer_code: s.customers?.code ?? null,
        customer_company: s.customers?.company_name ?? null,
        lines,
        totalQty,
      };
    }
  );

  // -----------------------------------------------------------------
  // KPIs (computed from shipments after filters apply)
  // -----------------------------------------------------------------
  const pendingCount = shipmentRows.filter((s) => s.status === "pending").length;
  const inTransit = shipmentRows.filter(
    (s) => s.status === "shipped" || s.status === "in_transit"
  ).length;
  const delivered = shipmentRows.filter((s) => s.status === "delivered").length;
  const totalCost = shipmentRows.reduce(
    (sum, s) => sum + Number(s.shipping_cost ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shipping</h2>
          <p className="text-gray-500">
            {pendingRows.length} pending · {shipmentRows.length} shipment
            {shipmentRows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export?table=shipments" download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pending</CardTitle>
            <Package className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">In Transit</CardTitle>
            <Truck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-700">{inTransit}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Delivered</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">{delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Shipping Cost</CardTitle>
            <Truck className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Shipment block — selectable jobs + multi-line dialog. */}
      <PendingShipmentSection rows={pendingRows} />

      {/* Filters apply only to the Shipped list below. */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1">
          {STATUSES.map((s) => {
            const label = s === "in_transit" ? "In Transit" : s.charAt(0).toUpperCase() + s.slice(1);
            const href = `/shipping?status=${s}${activeCarrier !== "all" ? `&carrier=${activeCarrier}` : ""}`;
            return (
              <Link key={s} href={s === "all" ? "/shipping" : href}>
                <Button variant={activeStatus === s ? "default" : "outline"} size="sm">
                  {label}
                </Button>
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1">
          {CARRIERS.map((c) => {
            const href = `/shipping?carrier=${c}${activeStatus !== "all" ? `&status=${activeStatus}` : ""}`;
            return (
              <Link key={c} href={c === "all" ? "/shipping" : href}>
                <Button variant={activeCarrier === c ? "default" : "outline"} size="sm">
                  {c === "all" ? "All Carriers" : c}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Shipped block — multi-job shipments. */}
      <ShippedShipmentsSection rows={shipmentRows} hasError={Boolean(shipError)} />
    </div>
  );
}
