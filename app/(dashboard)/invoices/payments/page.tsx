import Link from "next/link";
import { ArrowLeft, CreditCard, DollarSign, Download } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/lib/utils/format";

interface PaymentInvoice {
  invoice_number: string;
  total: number;
  customer_id: string;
  customers: { code: string; company_name: string } | null;
}

const METHOD_LABELS: Record<string, string> = {
  cheque: "Cheque",
  wire: "Wire Transfer",
  eft: "EFT",
  credit_card: "Credit Card",
};

export default async function PaymentsPage() {
  const supabase = await createClient();

  const { data: payments, error } = await supabase
    .from("payments")
    .select(
      "*, invoices(invoice_number, total, customer_id, customers(code, company_name))"
    )
    .order("payment_date", { ascending: false })
    .limit(200);

  const all = payments ?? [];

  // KPIs
  const totalReceived = all.reduce((sum, p) => sum + Number(p.amount), 0);
  const thisMonth = all.filter((p) => {
    const d = new Date(p.payment_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonth.reduce((sum, p) => sum + Number(p.amount), 0);

  // Group by method for stats
  const byMethod: Record<string, number> = {};
  for (const p of all) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/invoices">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Invoices
            </Button>
          </Link>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">Payment History</h2>
          <p className="text-gray-500">
            {all.length} payment{all.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <a href="/api/export?table=payments" download>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Received
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {formatCurrency(totalReceived)}
            </p>
            <p className="text-xs text-gray-500">{all.length} payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              This Month
            </CardTitle>
            <CreditCard className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-700">
              {formatCurrency(thisMonthTotal)}
            </p>
            <p className="text-xs text-gray-500">{thisMonth.length} payments</p>
          </CardContent>
        </Card>

        {Object.entries(byMethod)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 2)
          .map(([method, total]) => (
            <Card key={method}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {METHOD_LABELS[method] ?? method}
                </CardTitle>
                <CreditCard className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load payments. Make sure the database migration has been applied.
        </div>
      ) : all.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">No payments recorded</p>
            <p className="mt-1 text-gray-500">
              Payments are recorded from the invoice detail page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference #</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((payment) => {
                const invoice = payment.invoices as unknown as PaymentInvoice | null;
                const customer = invoice?.customers;
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {invoice ? (
                        <Link
                          href={`/invoices/${payment.invoice_id}`}
                          className="font-mono font-medium text-blue-600 hover:underline"
                        >
                          {invoice.invoice_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer
                        ? `${customer.code} — ${customer.company_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-green-700">
                      {formatCurrency(Number(payment.amount))}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(payment.payment_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {METHOD_LABELS[payment.method] ?? payment.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">
                      {payment.reference ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-gray-500">
                      {payment.notes ?? "—"}
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
