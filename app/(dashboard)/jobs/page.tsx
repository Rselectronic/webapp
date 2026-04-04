import { createClient } from "@/lib/supabase/server";

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

export default async function JobsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, job_number, status, quantity, assembly_type, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const jobs = (data ?? []) as unknown as Job[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
        <p className="mt-1 text-gray-500">
          Track jobs from creation through production to delivery.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load jobs: {error.message}
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
          No jobs yet. Create a job from an accepted quote.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Job #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">GMP</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Qty</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
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
                      {customer ? `${customer.code} — ${customer.company_name}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {gmp?.gmp_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">{job.quantity}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                        {job.status.replace(/_/g, " ")}
                      </span>
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
