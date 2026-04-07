import Link from "next/link";
import { LayoutGrid, List, Download, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JobKanban } from "@/components/jobs/job-kanban";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";

interface Job {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  assembly_type: string | null;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const { view, status } = await searchParams;
  const activeView = view === "table" ? "table" : "kanban";

  const supabase = await createClient();

  let query = supabase
    .from("jobs")
    .select(
      "id, job_number, status, quantity, assembly_type, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  const jobs = (data ?? []) as unknown as Job[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
          <p className="mt-1 text-gray-500">
            Track jobs from creation through production to delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a href="/api/export?table=jobs" download>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          </a>
          <Link href={`/jobs?view=kanban${status ? `&status=${status}` : ""}`}>
            <Button
              variant={activeView === "kanban" ? "default" : "outline"}
              size="sm"
            >
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Kanban
            </Button>
          </Link>
          <Link href={`/jobs?view=table${status ? `&status=${status}` : ""}`}>
            <Button
              variant={activeView === "table" ? "default" : "outline"}
              size="sm"
            >
              <List className="mr-1.5 h-4 w-4" />
              Table
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load jobs: {error.message}
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Jobs are created when a quote is accepted. Start by creating and sending a quote to a customer."
        >
          <Link href="/quotes/new">
            <Button variant="outline">Create a Quote</Button>
          </Link>
        </EmptyState>
      ) : activeView === "kanban" ? (
        <JobKanban jobs={jobs} />
      ) : (
        <div className="table-responsive overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Job #
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Customer
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  GMP
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Qty
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Assembly
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => {
                const customer = job.customers;
                const gmp = job.gmps;
                return (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a
                        href={`/jobs/${job.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {job.job_number}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {customer
                        ? `${customer.code} — ${customer.company_name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {gmp?.gmp_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">{job.quantity}</td>
                    <td className="px-4 py-3 text-xs">
                      {job.assembly_type ?? "TB"}
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
