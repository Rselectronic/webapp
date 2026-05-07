"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { ProductionJob } from "./production-kanban";

interface WeeklyScheduleProps {
  jobs: ProductionJob[];
}

function getWeekDays(startOfWeek: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 5; i++) {
    // Mon-Fri
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }
  return days;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinRange(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return d >= s && d <= e;
}

const STATUS_COLORS: Record<string, string> = {
  parts_received: "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200",
  production: "bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200",
  inspection: "bg-purple-100 border-purple-300 text-purple-900 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-200",
  shipping: "bg-green-100 border-green-300 text-green-900 dark:bg-green-900/30 dark:border-green-700 dark:text-green-200",
};

export function WeeklySchedule({ jobs }: WeeklyScheduleProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekDays = useMemo(() => getWeekDays(monday), [monday]);
  const friday = weekDays[weekDays.length - 1];

  // Jobs that overlap this week: either scheduled_start or scheduled_completion falls within,
  // or the job spans the entire week
  const weekJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (!job.scheduled_start && !job.scheduled_completion) return false;
      const start = job.scheduled_start ? new Date(job.scheduled_start) : null;
      const end = job.scheduled_completion ? new Date(job.scheduled_completion) : null;

      // If only start date, show on that day's week
      if (start && !end) {
        return isWithinRange(start, monday, friday);
      }
      // If only end date, show on that day's week
      if (!start && end) {
        return isWithinRange(end, monday, friday);
      }
      // If both, check overlap with week
      if (start && end) {
        const weekStart = new Date(monday);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(friday);
        weekEnd.setHours(23, 59, 59, 999);
        return start <= weekEnd && end >= weekStart;
      }
      return false;
    });
  }, [jobs, monday, friday]);

  // Unscheduled jobs (no dates set at all)
  const unscheduledJobs = useMemo(
    () => jobs.filter((j) => !j.scheduled_start && !j.scheduled_completion),
    [jobs]
  );

  // Group jobs by day they start (or are active on)
  function getJobsForDay(day: Date): ProductionJob[] {
    return weekJobs.filter((job) => {
      const start = job.scheduled_start ? new Date(job.scheduled_start) : null;
      const end = job.scheduled_completion ? new Date(job.scheduled_completion) : null;

      if (start && end) {
        return isWithinRange(day, start, end);
      }
      if (start) return isSameDay(day, start);
      if (end) return isSameDay(day, end);
      return false;
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pin labels to Montreal so Piyush (India) and Anas (Montreal) see the
  // same Mon–Fri week. NOTE: the week-boundary math above (monday/friday
  // computed off `new Date()` in local time) still reflects the viewer's
  // local week — a bigger refactor would Montreal-anchor that too.
  const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" })} - ${friday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Toronto" })}`;

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <div className="text-center">
          <h3 className="text-sm font-semibold">{weekLabel}</h3>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Back to this week
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-5 gap-2">
        {weekDays.map((day) => {
          const dayJobs = getJobsForDay(day);
          const isToday = isSameDay(day, today);
          const isPast = day < today && !isToday;

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[200px] rounded-lg border p-2 ${
                isToday
                  ? "border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/20"
                  : isPast
                    ? "border-dashed bg-muted/30"
                    : "border-border"
              }`}
            >
              {/* Day header */}
              <div className={`mb-2 text-center ${isToday ? "font-bold text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                <div className="text-xs uppercase">
                  {day.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Toronto" })}
                </div>
                <div className={`text-lg ${isToday ? "" : "text-foreground"}`}>
                  {day.getDate()}
                </div>
              </div>

              {/* Jobs for this day */}
              <div className="flex flex-col gap-1.5">
                {dayJobs.map((job) => (
                  <Link
                    key={`${job.id}-${day.toISOString()}`}
                    href={`/jobs/${job.id}`}
                    className={`block rounded border p-1.5 text-xs transition-colors hover:opacity-80 ${STATUS_COLORS[job.status] ?? "bg-gray-100 border-gray-300 text-gray-900"}`}
                  >
                    <div className="font-mono font-semibold">{job.job_number}</div>
                    <div className="truncate">{job.customers?.code ?? "N/A"} - {job.gmps?.gmp_number ?? ""}</div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span>Qty: {job.quantity}</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                        {job.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </Link>
                ))}
                {dayJobs.length === 0 && (
                  <p className="py-4 text-center text-[10px] text-muted-foreground">
                    {isPast ? "" : "No jobs"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Capacity indicator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Week Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Scheduled this week</p>
              <p className="text-xl font-bold">{weekJobs.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total boards</p>
              <p className="text-xl font-bold">
                {weekJobs.reduce((sum, j) => sum + j.quantity, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg per day</p>
              <p className="text-xl font-bold">
                {weekJobs.length > 0 ? Math.ceil(weekJobs.length / 5) : 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unscheduled</p>
              <p className="text-xl font-bold">
                {unscheduledJobs.length > 0 ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    {unscheduledJobs.length}
                  </span>
                ) : (
                  "0"
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unscheduled jobs list */}
      {unscheduledJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Unscheduled Jobs ({unscheduledJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unscheduledJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between rounded-md border border-dashed p-2 text-xs hover:bg-accent"
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
