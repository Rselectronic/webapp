import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";

interface InvoiceRow {
  total: number;
  status: string;
  customer_id: string;
  customers: { code: string; company_name: string } | null;
}

interface JobRow {
  status: string;
}

interface CountRow {
  created_at: string;
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "ceo") redirect("/");

  // Fetch all data in parallel
  const [invoicesRes, jobsRes, quotesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("total, status, customer_id, customers(code, company_name)"),
    supabase.from("jobs").select("status"),
    supabase.from("quotes").select("created_at"),
  ]);

  const invoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[];
  const jobs = (jobsRes.data ?? []) as unknown as JobRow[];
  const quotes = (quotesRes.data ?? []) as unknown as CountRow[];

  // Revenue summary
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);
  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);

  // Jobs by status
  const jobStatusCounts: Record<string, number> = {};
  for (const j of jobs) {
    jobStatusCounts[j.status] = (jobStatusCounts[j.status] ?? 0) + 1;
  }
  const jobStatuses = Object.entries(jobStatusCounts).sort(
    ([, a], [, b]) => b - a
  );

  // Top customers by invoiced amount
  const customerTotals: Record<
    string,
    { code: string; name: string; total: number }
  > = {};
  for (const inv of invoices.filter((i) => i.status === "paid")) {
    const cust = inv.customers as unknown as {
      code: string;
      company_name: string;
    } | null;
    const key = inv.customer_id;
    if (!customerTotals[key]) {
      customerTotals[key] = {
        code: cust?.code ?? "?",
        name: cust?.company_name ?? "Unknown",
        total: 0,
      };
    }
    customerTotals[key].total += inv.total ?? 0;
  }
  const topCustomers = Object.values(customerTotals)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Monthly activity: this month vs last month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  function countInRange(items: CountRow[], from: Date, to: Date) {
    return items.filter((item) => {
      const d = new Date(item.created_at);
      return d >= from && d < to;
    }).length;
  }

  const quotesThisMonth = countInRange(
    quotes,
    thisMonthStart,
    new Date(now.getFullYear(), now.getMonth() + 1, 1)
  );
  const quotesLastMonth = countInRange(quotes, lastMonthStart, thisMonthStart);

  const jobsWithDates = (
    (
      await supabase.from("jobs").select("created_at")
    ).data ?? []
  ) as unknown as CountRow[];
  const jobsThisMonth = countInRange(
    jobsWithDates,
    thisMonthStart,
    new Date(now.getFullYear(), now.getMonth() + 1, 1)
  );
  const jobsLastMonth = countInRange(
    jobsWithDates,
    lastMonthStart,
    thisMonthStart
  );

  const invoicesWithDates = (invoicesRes.data ?? []).map((i) => ({
    created_at: (i as unknown as CountRow).created_at,
  }));
  const invoicesThisMonth = countInRange(
    invoicesWithDates,
    thisMonthStart,
    new Date(now.getFullYear(), now.getMonth() + 1, 1)
  );
  const invoicesLastMonth = countInRange(
    invoicesWithDates,
    lastMonthStart,
    thisMonthStart
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
        <p className="text-sm text-gray-500">
          Business overview and performance metrics.
        </p>
      </div>

      {/* Revenue Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Invoiced (Paid)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{jobs.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Jobs by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {jobStatuses.length === 0 ? (
              <p className="text-sm text-gray-500">No jobs yet.</p>
            ) : (
              <div className="space-y-2">
                {jobStatuses.map(([status, count]) => {
                  const maxCount = Math.max(...jobStatuses.map(([, c]) => c));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-28 text-sm capitalize text-gray-700">
                        {status.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div
                            className="h-5 rounded bg-blue-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-8 text-right text-sm font-medium">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Top Customers (by Paid Invoices)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-gray-500">No paid invoices yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c) => (
                    <TableRow key={c.code}>
                      <TableCell className="font-medium">
                        {c.code} - {c.name}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(c.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">This Month</TableHead>
                <TableHead className="text-right">Last Month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Quotes Created</TableCell>
                <TableCell className="text-right font-mono">
                  {quotesThisMonth}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {quotesLastMonth}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Jobs Created</TableCell>
                <TableCell className="text-right font-mono">
                  {jobsThisMonth}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {jobsLastMonth}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Invoices Created</TableCell>
                <TableCell className="text-right font-mono">
                  {invoicesThisMonth}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {invoicesLastMonth}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
