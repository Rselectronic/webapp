import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminRole, isProductionRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { ProductionKanban } from "@/components/production/production-kanban";
import { WeeklySchedule } from "@/components/production/weekly-schedule";
import { MonthlyGantt } from "@/components/production/monthly-gantt";
import { ProductionDashboard } from "@/components/production/production-dashboard";
import {
  LayoutGrid,
  CalendarDays,
  Calendar,
  Activity,
  ClipboardList,
} from "lucide-react";

interface ProductionJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  po_number: string | null;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  /** Physical layout (single/double-sided SMT) lives on gmps.board_side. */
  gmps: { gmp_number: string; board_name: string | null; board_side: string | null } | null;
  /** Most-recent production_event.event_type for this job, or null if
   *  the job hasn't been touched yet. Used by the kanban's smart
   *  "log next event" button. */
  latest_event?: string | null;
  /** Sum of shipments.quantity across all shipments for this job. Only
   *  meaningful for jobs in the 'shipping' status; null when no
   *  shipments exist. */
  shipped_qty?: number | null;
  /** Number of boards released into the "ready to ship" pool while the
   *  rest of the job is still in production. Operator increments this
   *  via the "Release N" dialog on each kanban card. Server auto-
   *  advances the job to status='shipping' when this equals quantity.
   *  Legacy rows have NULL — treat as 0. */
  ready_to_ship_qty?: number | null;
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

  const supabase = await createClient();

  // Resolve the caller's role so we can hide the Dashboard tab from
  // production users — they don't need the high-level KPI overview.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const adminForProfile = createAdminClient();
  const { data: profile } = await adminForProfile
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // callerIsAdmin is no longer used here — the production-schedule
  // dashboard is now visible to both roles. Kept the import for parity
  // in case future per-role gating returns.
  void isAdminRole;
  const callerIsProduction = isProductionRole(profile?.role);

  // Default landing differs by role: admins land on Dashboard (KPI
  // overview), production lands on Kanban (action-oriented). Both roles
  // can switch freely between any tab — production users have access to
  // the Dashboard view too (the production-schedule dashboard is
  // distinct from the main app `/` dashboard, which remains admin-only).
  const requested =
    view === "kanban" || view === "weekly" || view === "monthly" || view === "log" || view === "dashboard"
      ? view
      : null;

  const activeView: "kanban" | "weekly" | "monthly" | "log" | "dashboard" =
    requested ?? (callerIsProduction ? "kanban" : "dashboard");

  // Reuse the admin client we already opened for the profile read above.
  // Reads use admin to bypass RLS — production users have a narrower
  // SELECT policy on jobs that doesn't cover the joined customers/gmps.
  const client = adminForProfile;

  // Monthly view: every non-archived job.
  // Kanban / Weekly / Dashboard: include the upstream statuses
  // (created → procurement → parts_ordered) so the production floor can
  // see what's coming. Those columns are read-only on the kanban — they
  // exist for visibility only, not action.
  const statusFilter = activeView === "monthly"
    ? ["created", "procurement", "parts_ordered", "parts_received", "production", "inspection", "shipping", "delivered"]
    : ["created", "procurement", "parts_ordered", "parts_received", "production", "inspection", "shipping"];

  const { data: jobsData, error: jobsError } = await client
    .from("jobs")
    .select(
      "id, job_number, status, quantity, ready_to_ship_qty, po_number, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name, board_side)"
    )
    .in("status", statusFilter)
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as unknown as ProductionJob[];

  // Pull the LATEST production_event for every visible job so the kanban
  // can show a smart "log next event" button per card. We fetch all
  // events for these jobs and reduce to the most-recent per job_id —
  // simpler than a window-function RPC and the row count is bounded by
  // the number of jobs on screen.
  const visibleJobIds = jobs.map((j) => j.id);
  if (visibleJobIds.length > 0) {
    const { data: latestEventsData, error: latestEventsErr } = await client
      .from("production_events")
      .select("job_id, event_type, created_at")
      .in("job_id", visibleJobIds)
      .order("created_at", { ascending: false });
    if (latestEventsErr) {
      console.error("[production] latest events read failed", latestEventsErr.message);
    }

    const latestByJob = new Map<string, string>();
    for (const row of (latestEventsData ?? []) as Array<{
      job_id: string;
      event_type: string;
    }>) {
      // Order is desc; first occurrence per job_id is the most recent.
      if (!latestByJob.has(row.job_id)) {
        latestByJob.set(row.job_id, row.event_type);
      }
    }
    for (const j of jobs) {
      (j as ProductionJob & { latest_event?: string | null }).latest_event =
        latestByJob.get(j.id) ?? null;
    }

    // Roll up shipped quantity per job so the kanban can show a partial-
    // shipment badge on Ready-to-Ship cards. Bounded by visible job IDs.
    // After 099, shipments.job_id/quantity moved into shipment_lines.
    const { data: shipmentLineRows, error: shipmentLineErr } = await client
      .from("shipment_lines")
      .select("job_id, quantity, shipments!inner(status)")
      .in("job_id", visibleJobIds);
    if (shipmentLineErr) {
      console.error("[production] shipment_lines read failed", shipmentLineErr.message);
    }

    const shippedByJob = new Map<string, number>();
    for (const row of (shipmentLineRows ?? []) as Array<{
      job_id: string;
      quantity: number | null;
      shipments: { status?: string | null } | { status?: string | null }[] | null;
    }>) {
      const ship = Array.isArray(row.shipments) ? row.shipments[0] : row.shipments;
      if (ship?.status === "cancelled") continue;
      shippedByJob.set(
        row.job_id,
        (shippedByJob.get(row.job_id) ?? 0) + (row.quantity ?? 0)
      );
    }
    for (const j of jobs) {
      (j as ProductionJob & { shipped_qty?: number | null }).shipped_qty =
        shippedByJob.get(j.id) ?? null;
    }
  }

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
    const { data: eventsData, error: eventsErr } = await client
      .from("production_events")
      .select("id, job_id, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (eventsErr) {
      console.error("[production] dashboard events read failed", eventsErr.message);
    }

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
                className="rounded-none border-l"
              >
                <CalendarDays className="mr-1.5 h-4 w-4" />
                Weekly
              </Button>
            </Link>
            <Link href="/production?view=monthly">
              <Button
                variant={activeView === "monthly" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none border-l"
              >
                <Calendar className="mr-1.5 h-4 w-4" />
                Monthly
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

      {activeView === "monthly" && <MonthlyGantt jobs={jobs} />}
    </div>
  );
}
