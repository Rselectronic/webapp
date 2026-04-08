import Link from "next/link";
import { ArrowLeft, CircuitBoard, Download, Layers } from "lucide-react";
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
import { FabricationStatusBadge } from "@/components/fabrication-orders/fabrication-status-badge";
import { UpdateFabricationStatus } from "@/components/fabrication-orders/update-fabrication-status";
import { CreateFabricationOrderDialog } from "@/components/fabrication-orders/create-fabrication-order-dialog";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const STATUSES = ["all", "ordered", "in_production", "shipped", "received"] as const;
const TYPES = ["all", "pcb", "stencil"] as const;

interface SearchParams {
  status?: string;
  type?: string;
}

interface FabJob {
  job_number: string;
  customer_id: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

export default async function StencilsPcbPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const activeType = params.type ?? "all";
  const supabase = await createClient();

  let query = supabase
    .from("fabrication_orders")
    .select(
      "*, jobs(job_number, customer_id, customers(code, company_name), gmps(gmp_number, board_name))"
    )
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") query = query.eq("status", activeStatus);
  if (activeType !== "all") query = query.eq("order_type", activeType);

  const { data: orders, error } = await query;

  const all = orders ?? [];
  const pcbCount = all.filter((o) => o.order_type === "pcb").length;
  const stencilCount = all.filter((o) => o.order_type === "stencil").length;
  const pendingCount = all.filter((o) => o.status !== "received").length;
  const totalCost = all.reduce((sum, o) => sum + Number(o.total_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/procurement">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Procurement
            </Button>
          </Link>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            PCB &amp; Stencil Orders
          </h2>
          <p className="text-gray-500">
            {all.length} order{all.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <CreateFabricationOrderDialog />
          <a href="/api/export?table=fabrication_orders" download>
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
            <CardTitle className="text-sm font-medium text-gray-500">PCB Orders</CardTitle>
            <CircuitBoard className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pcbCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Stencil Orders</CardTitle>
            <Layers className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stencilCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pending</CardTitle>
            <CircuitBoard className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Cost</CardTitle>
            <CircuitBoard className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1">
          {TYPES.map((t) => {
            const label = t === "all" ? "All Types" : t === "pcb" ? "PCB" : "Stencil";
            const href = `/procurement/stencils?type=${t}${activeStatus !== "all" ? `&status=${activeStatus}` : ""}`;
            return (
              <Link key={t} href={t === "all" ? "/procurement/stencils" : href}>
                <Button variant={activeType === t ? "default" : "outline"} size="sm">
                  {label}
                </Button>
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1">
          {STATUSES.map((s) => {
            const label =
              s === "in_production"
                ? "In Production"
                : s.charAt(0).toUpperCase() + s.slice(1);
            const href = `/procurement/stencils?status=${s}${activeType !== "all" ? `&type=${activeType}` : ""}`;
            return (
              <Link key={s} href={s === "all" ? "/procurement/stencils" : href}>
                <Button variant={activeStatus === s ? "default" : "outline"} size="sm">
                  {label}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load fabrication orders. Make sure the database migration has been applied.
        </div>
      ) : all.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CircuitBoard className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">No orders found</p>
            <p className="mt-1 text-gray-500">
              Create a PCB or stencil order when a job enters procurement.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Ref #</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((order) => {
                const job = order.jobs as unknown as FabJob | null;
                const customer = job?.customers;
                const gmp = job?.gmps;
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Badge variant={order.order_type === "pcb" ? "default" : "secondary"}>
                        {order.order_type === "pcb" ? "PCB" : "Stencil"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job ? (
                        <Link
                          href={`/jobs/${order.job_id}`}
                          className="font-mono font-medium text-blue-600 hover:underline"
                        >
                          {job.job_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer ? `${customer.code}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{order.supplier}</TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">
                      {order.supplier_ref ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {order.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {order.total_cost
                        ? formatCurrency(Number(order.total_cost))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {order.ordered_date ? formatDate(order.ordered_date) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {order.expected_date ? formatDate(order.expected_date) : "—"}
                    </TableCell>
                    <TableCell>
                      <FabricationStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <UpdateFabricationStatus
                        orderId={order.id}
                        currentStatus={order.status}
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
