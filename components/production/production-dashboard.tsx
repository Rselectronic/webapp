"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  Factory,
  Package,
  Truck,
  CheckCircle,
  Activity,
} from "lucide-react";
import type { ProductionJob } from "./production-kanban";

interface ProductionDashboardProps {
  jobs: ProductionJob[];
  recentEvents: {
    id: string;
    job_id: string;
    event_type: string;
    created_at: string;
    job_number?: string;
    customer_code?: string;
  }[];
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

export function ProductionDashboard({ jobs, recentEvents }: ProductionDashboardProps) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  // Categorize jobs
  const overdueJobs = jobs.filter((j) => {
    if (!j.scheduled_completion) return false;
    const due = new Date(j.scheduled_completion);
    due.setHours(0, 0, 0, 0);
    return due < now && !["delivered", "invoiced", "archived", "shipping"].includes(j.status);
  });

  const todaysJobs = jobs.filter((j) => {
    if (!j.scheduled_start && !j.scheduled_completion) return false;
    const start = j.scheduled_start ? new Date(j.scheduled_start) : null;
    const end = j.scheduled_completion ? new Date(j.scheduled_completion) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (start && end) {
      return start <= tomorrow && end >= today;
    }
    if (start) {
      const s = new Date(start);
      s.setHours(0, 0, 0, 0);
      return s.getTime() === today.getTime();
    }
    if (end) {
      const e = new Date(end);
      e.setHours(0, 0, 0, 0);
      return e.getTime() === today.getTime();
    }
    return false;
  });

  const upcomingJobs = jobs.filter((j) => {
    if (!j.scheduled_start) return false;
    const start = new Date(j.scheduled_start);
    start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return start > now && start <= in7Days;
  });

  // Stats by status
  const statusCounts = {
    parts_received: jobs.filter((j) => j.status === "parts_received").length,
    production: jobs.filter((j) => j.status === "production").length,
    inspection: jobs.filter((j) => j.status === "inspection").length,
    shipping: jobs.filter((j) => j.status === "shipping").length,
  };

  const totalBoards = jobs.reduce((sum, j) => sum + j.quantity, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
              <Factory className="h-3.5 w-3.5" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{jobs.length}</p>
            <p className="text-xs text-muted-foreground">{totalBoards} total boards</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Parts Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusCounts.parts_received}</p>
            <p className="text-xs text-muted-foreground">Awaiting production</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              In Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusCounts.production}</p>
            <p className="text-xs text-muted-foreground">SMT / TH / Reflow</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5" />
              Inspection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusCounts.inspection}</p>
            <p className="text-xs text-muted-foreground">AOI / QC</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              Ready to Ship
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statusCounts.shipping}</p>
            <p className="text-xs text-muted-foreground">Packing / awaiting pickup</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overdue Jobs */}
        <Card className={overdueJobs.length > 0 ? "border-red-300 dark:border-red-700" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className={`h-4 w-4 ${overdueJobs.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              Overdue Jobs
              {overdueJobs.length > 0 && (
                <Badge variant="destructive" className="ml-1">{overdueJobs.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueJobs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No overdue jobs. All on track.
              </p>
            ) : (
              <div className="divide-y">
                {overdueJobs.map((job) => {
                  const due = new Date(job.scheduled_completion!);
                  const daysOverdue = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-accent/50 -mx-2 px-2 rounded"
                    >
                      <div>
                        <span className="font-mono font-semibold">{job.job_number}</span>
                        <span className="ml-2 text-muted-foreground">
                          {job.customers?.code ?? "N/A"} - {job.gmps?.gmp_number ?? ""}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        {daysOverdue}d overdue
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Active Jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              Today&apos;s Active Jobs
              <Badge variant="secondary" className="ml-1">{todaysJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaysJobs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No jobs scheduled for today.
              </p>
            ) : (
              <div className="divide-y">
                {todaysJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:bg-accent/50 -mx-2 px-2 rounded"
                  >
                    <div>
                      <span className="font-mono font-semibold">{job.job_number}</span>
                      <span className="ml-2 text-muted-foreground">
                        {job.customers?.code ?? "N/A"} - Qty: {job.quantity}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {job.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Jobs (Next 7 Days) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              Upcoming (Next 7 Days)
              <Badge variant="secondary" className="ml-1">{upcomingJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingJobs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No upcoming jobs scheduled.
              </p>
            ) : (
              <div className="divide-y">
                {upcomingJobs
                  .sort((a, b) => {
                    const aDate = new Date(a.scheduled_start!).getTime();
                    const bDate = new Date(b.scheduled_start!).getTime();
                    return aDate - bDate;
                  })
                  .map((job) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-accent/50 -mx-2 px-2 rounded"
                    >
                      <div>
                        <span className="font-mono font-semibold">{job.job_number}</span>
                        <span className="ml-2 text-muted-foreground">
                          {job.customers?.code ?? "N/A"} - Qty: {job.quantity}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.scheduled_start!).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </Link>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Production Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Recent Production Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No production events recorded yet.
              </p>
            ) : (
              <div className="divide-y">
                {recentEvents.slice(0, 10).map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start justify-between py-2.5"
                  >
                    <div>
                      <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                        {formatEventType(evt.event_type)}
                      </span>
                      {evt.job_number && (
                        <Link
                          href={`/jobs/${evt.job_id}`}
                          className="ml-2 text-xs font-mono text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {evt.job_number}
                        </Link>
                      )}
                      {evt.customer_code && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({evt.customer_code})
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(evt.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
