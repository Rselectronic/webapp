import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";

interface ProductionJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

interface ProductionEvent {
  id: string;
  job_id: string;
  event_type: string;
  created_at: string;
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function ProductionPage() {
  const supabase = await createClient();

  const { data: jobsData, error: jobsError } = await supabase
    .from("jobs")
    .select(
      "id, job_number, status, quantity, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .in("status", ["production", "inspection"])
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as unknown as ProductionJob[];

  // Fetch latest production event for each job
  let latestEvents = new Map<string, ProductionEvent>();
  if (jobs.length > 0) {
    const jobIds = jobs.map((j) => j.id);
    const { data: eventsData } = await supabase
      .from("production_events")
      .select("id, job_id, event_type, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    if (eventsData) {
      for (const evt of eventsData as ProductionEvent[]) {
        if (!latestEvents.has(evt.job_id)) {
          latestEvents.set(evt.job_id, evt);
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Production</h2>
          <p className="mt-1 text-gray-500">
            Track production events and shop floor activity in real time.
          </p>
        </div>
        <Link href="/production/log">
          <Button>Log Event</Button>
        </Link>
      </div>

      {jobsError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load production data: {jobsError.message}
        </div>
      )}

      {jobs.length === 0 && !jobsError ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
          No jobs currently in production or inspection status.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
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
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Latest Event
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => {
                const latestEvent = latestEvents.get(job.id);
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
                      {job.customers
                        ? `${job.customers.code} — ${job.customers.company_name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {job.gmps?.gmp_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">{job.quantity}</td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      {latestEvent ? (
                        <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          {formatEventType(latestEvent.event_type)}
                        </span>
                      ) : (
                        <span className="text-gray-400">No events</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {latestEvent ? timeAgo(latestEvent.created_at) : "—"}
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
