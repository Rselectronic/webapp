import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProductionKanban } from "@/components/production/production-kanban";
import { WeeklySchedule } from "@/components/production/weekly-schedule";
import { ProductionDashboard } from "@/components/production/production-dashboard";
import {
  LayoutGrid,
  CalendarDays,
  Activity,
  ClipboardList,
} from "lucide-react";

interface ProductionJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  assembly_type: string | null;
  po_number: string | null;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

interface ProductionEvent {
  id: string;
  job_id: string;
  event_type: string;
  created_at: string;
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const activeView = view === "kanban"
    ? "kanban"
    : view === "weekly"
      ? "weekly"
      : view === "log"
        ? "log"
        : "dashboard";

  const supabase = await createClient();

  // Fetch jobs in production-relevant statuses
  // Using admin client to avoid RLS issues with nested joins
  let adminClient: Awaited<ReturnType<typeof createAdminClient>> | null = null;
  try {
    adminClient = createAdminClient();
  } catch {
    // Fall back to regular client if admin not available
  }

  const client = adminClient ?? supabase;

  const { data: jobsData, error: jobsError } = await client
    .from("jobs")
    .select(
      "id, job_number, status, quantity, assembly_type, po_number, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .in("status", ["parts_received", "production", "inspection", "shipping"])
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as unknown as ProductionJob[];

  // Fetch latest production events for the dashboard view
  let recentEvents: {
    id: string;
    job_id: string;
    event_type: string;
    created_at: string;
    job_number?: string;
    customer_code?: string;
  }[] = [];

  if (activeView === "dashboard") {
    const { data: eventsData } = await client
      .from("production_events")
      .select("id, job_id, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (eventsData) {
      // Enrich events with job number and customer code
      const jobMap = new Map(jobs.map((j) => [j.id, j]));
      recentEvents = (eventsData as ProductionEvent[]).map((evt) => {
        const job = jobMap.get(evt.job_id);
        return {
          ...evt,
          job_number: job?.job_number,
          customer_code: job?.customers?.code,
        };
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Production Schedule
          </h2>
          <p className="mt-1 text-gray-500">
            Plan, track, and manage production floor activity.
            {jobs.length > 0 && (
              <span className="ml-1 font-medium">
                {jobs.length} active job{jobs.length !== 1 ? "s" : ""}.
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/production/log">
            <Button variant="outline" size="sm">
              <ClipboardList className="mr-1.5 h-4 w-4" />
              Log Event
            </Button>
          </Link>

          <div className="flex items-center rounded-md border">
            <Link href="/production?view=dashboard">
              <Button
                variant={activeView === "dashboard" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
              >
                <Activity className="mr-1.5 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link href="/production?view=kanban">
              <Button
                variant={activeView === "kanban" ? "default" : "ghost"}
                size="sm"
                className="rounded-none border-l"
              >
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                Kanban
              </Button>
            </Link>
            <Link href="/production?view=weekly">
              <Button
                variant={activeView === "weekly" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none border-l"
              >
                <CalendarDays className="mr-1.5 h-4 w-4" />
                Weekly
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Error state */}
      {jobsError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Failed to load production data: {jobsError.message}
        </div>
      )}

      {/* Views */}
      {activeView === "dashboard" && (
        <ProductionDashboard jobs={jobs} recentEvents={recentEvents} />
      )}

      {activeView === "kanban" && (
        <>
          {jobs.length === 0 && !jobsError ? (
            <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
              No jobs currently in production pipeline. Jobs appear here when they
              reach &quot;Parts Received&quot; status or later.
            </div>
          ) : (
            <ProductionKanban jobs={jobs} />
          )}
        </>
      )}

      {activeView === "weekly" && <WeeklySchedule jobs={jobs} />}
    </div>
  );
}
