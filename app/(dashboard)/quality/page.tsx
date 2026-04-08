import Link from "next/link";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
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
import { NCRStatusBadge } from "@/components/ncr/ncr-status-badge";
import { NCRSeverityBadge } from "@/components/ncr/ncr-severity-badge";
import { formatDate, formatDateTime } from "@/lib/utils/format";

const STATUSES = ["all", "open", "investigating", "corrective_action", "closed"] as const;

interface SearchParams {
  status?: string;
  customer_id?: string;
}

interface NCRCustomer {
  code: string;
  company_name: string;
}

interface NCRJob {
  job_number: string;
}

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const activeCustomerId = params.customer_id;
  const supabase = await createClient();

  let query = supabase
    .from("ncr_reports")
    .select(
      "id, ncr_number, category, subcategory, severity, status, description, created_at, closed_at, customers(code, company_name), jobs(job_number)"
    )
    .order("created_at", { ascending: false });

  if (activeCustomerId) {
    query = query.eq("customer_id", activeCustomerId);
  }

  const { data: ncrs, error } = await query;

  const enriched = (ncrs ?? []).map((ncr) => {
    const customer = ncr.customers as unknown as NCRCustomer | null;
    const job = ncr.jobs as unknown as NCRJob | null;
    return { ...ncr, customer, job };
  });

  // Filter by status tab
  const filtered =
    activeStatus === "all"
      ? enriched
      : enriched.filter((ncr) => ncr.status === activeStatus);

  // KPI counts
  const openCount = enriched.filter((n) => n.status === "open").length;
  const investigatingCount = enriched.filter(
    (n) => n.status === "investigating"
  ).length;
  const correctiveCount = enriched.filter(
    (n) => n.status === "corrective_action"
  ).length;
  const closedCount = enriched.filter((n) => n.status === "closed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Quality / NCR</h2>
        <p className="text-gray-500">
          {filtered.length} report{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Open
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">{openCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Investigating
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">
              {investigatingCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Corrective Action
            </CardTitle>
            <ShieldX className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-700">
              {correctiveCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Closed
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">{closedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const label =
            s === "corrective_action"
              ? "Corrective Action"
              : s.charAt(0).toUpperCase() + s.slice(1);
          return (
            <Link
              key={s}
              href={s === "all" ? "/quality" : `/quality?status=${s}`}
            >
              <Button
                variant={activeStatus === s ? "default" : "outline"}
                size="sm"
              >
                {label}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load NCR reports. Make sure your Supabase connection is
          configured.
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">
              No NCR reports found
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-500">
            NCR reports can be created from the job detail page when a customer
            complaint is received.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCR #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Closed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ncr) => (
                <TableRow key={ncr.id}>
                  <TableCell>
                    <Link
                      href={`/quality/${ncr.id}`}
                      className="font-mono font-medium text-blue-600 hover:underline"
                    >
                      {ncr.ncr_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {ncr.customer
                      ? `${ncr.customer.code} — ${ncr.customer.company_name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {ncr.job?.job_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {ncr.category}
                    {ncr.subcategory ? ` / ${ncr.subcategory}` : ""}
                  </TableCell>
                  <TableCell>
                    <NCRSeverityBadge severity={ncr.severity} />
                  </TableCell>
                  <TableCell>
                    <NCRStatusBadge status={ncr.status} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(ncr.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {ncr.closed_at ? formatDate(ncr.closed_at) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
