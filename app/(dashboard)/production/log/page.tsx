import { createClient } from "@/lib/supabase/server";
import { EventLogger } from "@/components/production/event-logger";

interface Job {
  id: string;
  job_number: string;
  customers: { code: string } | null;
}

export default async function ProductionLogPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, customers(code)")
    .in("status", ["production", "inspection"])
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as unknown as Job[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Production Event Logger
        </h2>
        <p className="mt-1 text-gray-500">
          Log production steps for active jobs on the shop floor.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load jobs: {error.message}
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
          No jobs currently in production or inspection status.
        </div>
      ) : (
        <EventLogger jobs={jobs} />
      )}
    </div>
  );
}
