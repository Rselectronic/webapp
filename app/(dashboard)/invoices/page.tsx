import Link from "next/link";
import { DollarSign, Clock, AlertTriangle, AlertCircle } from "lucide-react";
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
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";

const STATUSES = ["all", "draft", "sent", "paid", "overdue"] as const;

interface SearchParams {
  status?: string;
}

interface InvoiceCustomer {
  code: string;
  company_name: string;
}

interface InvoiceJob {
  job_number: string;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, subtotal, total, tps_gst, tvq_qst, freight, discount, issued_date, due_date, paid_date, created_at, customers(code, company_name), jobs(job_number)"
    )
    .order("created_at", { ascending: false });

  const now = Date.now();
  const DAY_MS = 86_400_000;

  // Compute days outstanding and effective status (overdue) for each invoice
  const enriched = (invoices ?? []).map((inv) => {
    const customer = inv.customers as unknown as InvoiceCustomer | null;
    const job = inv.jobs as unknown as InvoiceJob | null;

    let daysOutstanding: number | null = null;
    let effectiveStatus = inv.status;

    if (
      inv.issued_date &&
      inv.status !== "paid" &&
      inv.status !== "cancelled"
    ) {
      daysOutstanding = Math.floor(
        (now - new Date(inv.issued_date).getTime()) / DAY_MS
      );
    }

    if (
      inv.status === "sent" &&
      inv.due_date &&
      new Date(inv.due_date).getTime() < now
    ) {
      effectiveStatus = "overdue";
    }

    return { ...inv, customer, job, daysOutstanding, effectiveStatus };
  });

  // Filter by tab
  const filtered =
    activeStatus === "all"
      ? enriched
      : enriched.filter((inv) => inv.effectiveStatus === activeStatus);

  // Aging KPIs (unpaid only)
  const unpaid = enriched.filter(
    (inv) => inv.status !== "paid" && inv.status !== "cancelled"
  );

  const totalOutstanding = unpaid.reduce(
    (sum, inv) => sum + Number(inv.total ?? 0),
    0
  );

  const currentAmount = unpaid
    .filter((inv) => {
      if (!inv.due_date) return true;
      return new Date(inv.due_date).getTime() >= now;
    })
    .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  const over30Amount = unpaid
    .filter(
      (inv) =>
        inv.due_date &&
        new Date(inv.due_date).getTime() < now - 30 * DAY_MS
    )
    .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  const over60Amount = unpaid
    .filter(
      (inv) =>
        inv.due_date &&
        new Date(inv.due_date).getTime() < now - 60 * DAY_MS
    )
    .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
        <p className="text-gray-500">
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Aging KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Outstanding
            </CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalOutstanding)}
            </p>
            <p className="text-xs text-gray-500">
              {unpaid.length} unpaid invoice{unpaid.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Current
            </CardTitle>
            <Clock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {formatCurrency(currentAmount)}
            </p>
            <p className="text-xs text-gray-500">Not yet due</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              30+ Days
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">
              {formatCurrency(over30Amount)}
            </p>
            <p className="text-xs text-gray-500">Past due over 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              60+ Days
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">
              {formatCurrency(over60Amount)}
            </p>
            <p className="text-xs text-gray-500">Past due over 60 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/invoices" : `/invoices?status=${s}`}
          >
            <Button
              variant={activeStatus === s ? "default" : "outline"}
              size="sm"
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          </Link>
        ))}
      </div>

      {/* Error state */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load invoices. Make sure your Supabase connection is
          configured.
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">
              No invoices found
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-500">
            Invoices are created from the job detail page once a job is ready to
            be invoiced.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Days Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const isOverdue = inv.effectiveStatus === "overdue";

                return (
                  <TableRow
                    key={inv.id}
                    className={isOverdue ? "bg-red-50" : undefined}
                  >
                    <TableCell>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {inv.customer
                        ? `${inv.customer.code} — ${inv.customer.company_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {inv.job?.job_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {inv.total != null
                        ? formatCurrency(Number(inv.total))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.effectiveStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {inv.issued_date ? formatDate(inv.issued_date) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {inv.due_date ? formatDate(inv.due_date) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {inv.daysOutstanding != null ? (
                        <span
                          className={
                            isOverdue
                              ? "font-medium text-red-600"
                              : "text-gray-500"
                          }
                        >
                          {inv.daysOutstanding}d
                        </span>
                      ) : inv.status === "paid" ? (
                        <span className="text-green-600">Paid</span>
                      ) : (
                        "—"
                      )}
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
