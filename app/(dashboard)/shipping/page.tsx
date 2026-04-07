import Link from "next/link";
import { Copy, Download, Package, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import { UpdateShipmentStatus } from "@/components/shipments/update-shipment-status";
import { CreateShipmentDialog } from "@/components/shipments/create-shipment-dialog";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const STATUSES = ["all", "pending", "shipped", "in_transit", "delivered"] as const;
const CARRIERS = ["all", "FedEx", "Purolator", "UPS", "Canada Post", "Other"] as const;

interface SearchParams {
  status?: string;
  carrier?: string;
}

interface ShipmentJob {
  job_number: string;
  customer_id: string;
  quantity: number;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
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

  let query = supabase
    .from("shipments")
    .select(
      "*, jobs(job_number, customer_id, quantity, customers(code, company_name), gmps(gmp_number, board_name))"
    )
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") query = query.eq("status", activeStatus);
  if (activeCarrier !== "all") query = query.eq("carrier", activeCarrier);

  const { data: shipments, error } = await query;

  // KPIs
  const all = shipments ?? [];
  const pending = all.filter((s) => s.status === "pending").length;
  const inTransit = all.filter((s) => s.status === "shipped" || s.status === "in_transit").length;
  const delivered = all.filter((s) => s.status === "delivered").length;
  const totalCost = all.reduce((sum, s) => sum + Number(s.shipping_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shipping</h2>
          <p className="text-gray-500">
            {all.length} shipment{all.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <CreateShipmentDialog />
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
            <p className="text-2xl font-bold">{pending}</p>
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

      {/* Filters */}
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

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load shipments. Make sure the database migration has been applied.
        </div>
      ) : all.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">No shipments found</p>
            <p className="mt-1 text-gray-500">Create a shipment when a job is ready to ship.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Tracking #</TableHead>
                <TableHead>Ship Date</TableHead>
                <TableHead>Est. Delivery</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((shipment) => {
                const job = shipment.jobs as unknown as ShipmentJob | null;
                const customer = job?.customers;
                return (
                  <TableRow key={shipment.id}>
                    <TableCell>
                      {job ? (
                        <Link
                          href={`/jobs/${shipment.job_id}`}
                          className="font-mono font-medium text-blue-600 hover:underline"
                        >
                          {job.job_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer ? `${customer.code} — ${customer.company_name}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{shipment.carrier}</Badge>
                    </TableCell>
                    <TableCell>
                      {shipment.tracking_number ? (
                        <span className="font-mono text-sm">{shipment.tracking_number}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {shipment.ship_date ? formatDate(shipment.ship_date) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {shipment.estimated_delivery ? formatDate(shipment.estimated_delivery) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {shipment.shipping_cost
                        ? formatCurrency(Number(shipment.shipping_cost))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={shipment.status} />
                    </TableCell>
                    <TableCell>
                      <UpdateShipmentStatus
                        shipmentId={shipment.id}
                        currentStatus={shipment.status}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
