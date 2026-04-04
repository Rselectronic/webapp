import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, PackageCheck, ShoppingCart, ClipboardList } from "lucide-react";
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
import { formatDateTime } from "@/lib/utils/format";
import { ReceiveButton } from "@/components/procurement/receive-button";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ordering: "bg-blue-100 text-blue-700",
  partial_received: "bg-yellow-100 text-yellow-700",
  fully_received: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ordering: "Ordering",
  partial_received: "Partial Received",
  fully_received: "Fully Received",
  completed: "Completed",
};

const LINE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  ordered: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  backordered: "bg-red-100 text-red-700",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered",
  received: "Received",
  backordered: "Backordered",
};

interface ProcJob {
  job_number: string;
  quantity: number;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string } | null;
}

interface ProcLine {
  id: string;
  mpn: string;
  description: string | null;
  m_code: string | null;
  qty_needed: number;
  qty_extra: number;
  qty_ordered: number;
  qty_received: number;
  supplier: string | null;
  order_status: string;
  is_bg: boolean;
  notes: string | null;
}

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proc, error } = await supabase
    .from("procurements")
    .select(
      "*, jobs(job_number, quantity, customers(code, company_name), gmps(gmp_number))"
    )
    .eq("id", id)
    .single();

  if (error || !proc) {
    notFound();
  }

  const { data: lines } = await supabase
    .from("procurement_lines")
    .select("*")
    .eq("procurement_id", id)
    .order("created_at", { ascending: true });

  const job = proc.jobs as unknown as ProcJob | null;
  const customer = job?.customers as unknown as {
    code: string;
    company_name: string;
  } | null;
  const gmp = job?.gmps as unknown as { gmp_number: string } | null;
  const procLines = (lines ?? []) as unknown as ProcLine[];

  const totalLines = proc.total_lines ?? 0;
  const linesOrdered = proc.lines_ordered ?? 0;
  const linesReceived = proc.lines_received ?? 0;
  const linesPending = totalLines - linesOrdered;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/procurement">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Procurement
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {proc.proc_code}
            </h2>
            <Badge
              className={
                STATUS_COLORS[proc.status] ?? "bg-gray-100 text-gray-700"
              }
            >
              {STATUS_LABELS[proc.status] ?? proc.status}
            </Badge>
          </div>
          <p className="mt-1 text-gray-500">
            {customer
              ? `${customer.code} — ${customer.company_name}`
              : "Unknown customer"}
            {gmp ? ` / ${gmp.gmp_number}` : ""}
          </p>
          {job && (
            <p className="mt-1 text-sm text-gray-500">
              Job:{" "}
              <Link
                href={`/jobs/${proc.job_id}`}
                className="font-mono text-blue-600 hover:underline"
              >
                {job.job_number}
              </Link>
              {" "}({job.quantity} units)
            </p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <ClipboardList className="h-4 w-4" />
              Total Lines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLines}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <ShoppingCart className="h-4 w-4" />
              Ordered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{linesOrdered}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <PackageCheck className="h-4 w-4" />
              Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{linesReceived}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Package className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-600">
              {linesPending > 0 ? linesPending : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Procurement lines table */}
      {procLines.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">
              No procurement lines
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-500">
            This procurement has no component lines.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MPN</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>M-Code</TableHead>
                <TableHead className="text-right">Qty Needed</TableHead>
                <TableHead className="text-right">Extra</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procLines.map((line) => {
                const totalQty = line.qty_needed + line.qty_extra;
                const isFullyReceived = line.qty_received >= totalQty;

                return (
                  <TableRow
                    key={line.id}
                    className={isFullyReceived ? "bg-green-50/50" : undefined}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {line.mpn || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-gray-600">
                      {line.description || "—"}
                    </TableCell>
                    <TableCell>
                      {line.m_code ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {line.m_code}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.qty_needed}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-gray-500">
                      +{line.qty_extra}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.qty_received}/{totalQty}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {line.supplier || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          LINE_STATUS_COLORS[line.order_status] ??
                          "bg-gray-100 text-gray-700"
                        }
                      >
                        {LINE_STATUS_LABELS[line.order_status] ??
                          line.order_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isFullyReceived && (
                        <ReceiveButton
                          procurementId={id}
                          lineId={line.id}
                          totalQty={totalQty}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Notes */}
      {proc.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {proc.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex flex-wrap gap-6 border-t pt-4 text-xs text-gray-400">
        <span>Created: {formatDateTime(proc.created_at)}</span>
        <span>Updated: {formatDateTime(proc.updated_at)}</span>
      </div>
    </div>
  );
}
