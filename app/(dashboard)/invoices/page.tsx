import Link from "next/link";
import { DollarSign, Clock, AlertTriangle, AlertCircle, Download, CreditCard, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { CreateInvoiceDialog } from "@/components/invoices/create-invoice-dialog";
import { formatCurrency, formatDate } from "@/lib/utils/format";

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

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const nowIso = new Date(now).toISOString();
  const d30Iso = new Date(now - 30 * DAY_MS).toISOString();
  const d60Iso = new Date(now - 60 * DAY_MS).toISOString();

  // Parallelize: customer list, main invoice fetch, and 4 aging amount queries
  const [
    customersListRes,
    invoicesRes,
    currentAgingRes,
    over30AgingRes,
    over60AgingRes,
    totalUnpaidRes,
  ] = await Promise.all([
    // Active customers for Create Invoice dialog
    supabase
      .from("customers")
      .select("id, code, company_name")
      .eq("is_active", true)
      .order("code"),
    // Main invoice list — narrowed columns, limit 200
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, total, issued_date, due_date, created_at, customers(code, company_name), jobs(job_number)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    // Aging buckets — fetch only `total` so we can sum in JS and get count for free.
    // Current: sent and due_date >= now (not yet due)
    supabase
      .from("invoices")
      .select("total")
      .eq("status", "sent")
      .gte("due_date", nowIso),
    // 30+ days overdue: sent and due_date < now - 30d (includes 60+ bucket, matching pre-regression semantics)
    supabase
      .from("invoices")
      .select("total")
      .eq("status", "sent")
      .lt("due_date", d30Iso),
    // 60+ days overdue: sent and due_date < now - 60d
    supabase
      .from("invoices")
      .select("total")
      .eq("status", "sent")
      .lt("due_date", d60Iso),
    // Total unpaid: not paid and not cancelled
    supabase
      .from("invoices")
      .select("total")
      .not("status", "in", '("paid","cancelled")'),
  ]);

  const customers = (customersListRes.data ?? []) as {
    id: string;
    code: string;
    company_name: string;
  }[];
  const { data: invoices, error } = invoicesRes;

  const sumTotals = (rows: { total: number | null }[] | null | undefined) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.total ?? 0), 0);

  const currentAmount = sumTotals(currentAgingRes.data);
  const currentCount = currentAgingRes.data?.length ?? 0;
  const over30Amount = sumTotals(over30AgingRes.data);
  const over30Count = over30AgingRes.data?.length ?? 0;
  const over60Amount = sumTotals(over60AgingRes.data);
  const over60Count = over60AgingRes.data?.length ?? 0;
  const totalOutstandingAmount = sumTotals(totalUnpaidRes.data);
  const unpaidCount = totalUnpaidRes.data?.length ?? 0;

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

  // Aging KPI amounts + counts come from parallelized narrow SQL queries above.
  // Each aging tile shows the dollar amount (primary) and invoice count (secondary).

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500">
            {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <CreateInvoiceDialog customers={customers} />
          <Link href="/invoices/payments">
            <Button variant="outline" size="sm">
              <CreditCard className="mr-2 h-4 w-4" />
              Payment History
            </Button>
          </Link>
          <a href="/api/export?table=invoices" download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>
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
              {formatCurrency(totalOutstandingAmount)}
            </p>
            <p className="text-xs text-gray-500">
              {unpaidCount} unpaid invoice{unpaidCount !== 1 ? "s" : ""}
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
            <p className="text-xs text-gray-500">
              {currentCount} invoice{currentCount !== 1 ? "s" : ""} — not yet due
            </p>
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
            <p className="text-xs text-gray-500">
              {over30Count} invoice{over30Count !== 1 ? "s" : ""} — past due over 30 days
            </p>
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
            <p className="text-xs text-gray-500">
              {over60Count} invoice{over60Count !== 1 ? "s" : ""} — past due over 60 days
            </p>
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
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description={activeStatus !== "all" ? `No invoices with status "${activeStatus}". Try a different filter.` : "Invoices are created from the job detail page once a job is ready to be invoiced."}
        />
      ) : (
        <div className="table-responsive rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
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
