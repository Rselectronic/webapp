import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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
  partial_received: "Partial",
  fully_received: "Received",
  completed: "Completed",
};

interface ProcJob {
  job_number: string;
  quantity: number;
  customers: { code: string; company_name: string } | null;
}

interface ProcRow {
  id: string;
  proc_code: string;
  status: string;
  total_lines: number | null;
  lines_ordered: number | null;
  lines_received: number | null;
  created_at: string;
  jobs: ProcJob | null;
}

const STATUSES = ["all", "draft", "ordering", "partial_received", "fully_received", "completed"] as const;

interface SearchParams {
  status?: string;
}

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const supabase = await createClient();

  let query = supabase
    .from("procurements")
    .select(
      "id, proc_code, status, total_lines, lines_ordered, lines_received, created_at, jobs(job_number, quantity, customers(code, company_name))"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: procs, error } = await query;

  const rows = (procs ?? []) as unknown as ProcRow[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Procurement</h2>
          <p className="text-gray-500">
            {rows.length} procurement{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/procurement/stencils"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
        >
          PCB &amp; Stencil Orders
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const isActive = activeStatus === s;
          return (
            <Link
              key={s}
              href={s === "all" ? "/procurement" : `/procurement?status=${s}`}
              className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {STATUS_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          );
        })}
      </div>

      {/* Error state */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load procurements. Make sure your Supabase connection is configured.
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">
              No procurements found
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-500">
            Procurements are created automatically when a job enters the procurement stage.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proc Code</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((proc) => {
                const job = proc.jobs;
                const customer = job?.customers as unknown as {
                  code: string;
                  company_name: string;
                } | null;
                const received = proc.lines_received ?? 0;
                const total = proc.total_lines ?? 0;

                return (
                  <TableRow key={proc.id}>
                    <TableCell>
                      <Link
                        href={`/procurement/${proc.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {proc.proc_code}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {job?.job_number ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer
                        ? `${customer.code} — ${customer.company_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {received}/{total} received
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          STATUS_COLORS[proc.status] ??
                          "bg-gray-100 text-gray-700"
                        }
                      >
                        {STATUS_LABELS[proc.status] ?? proc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {proc.created_at
                        ? formatDateTime(proc.created_at)
                        : "—"}
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
