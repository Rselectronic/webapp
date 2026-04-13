"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Job {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  assembly_type: string | null;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

interface MonthlyGanttProps {
  jobs: Job[];
}

const STATUS_COLORS: Record<string, string> = {
  parts_received: "bg-amber-500",
  production: "bg-blue-500",
  inspection: "bg-purple-500",
  shipping: "bg-green-500",
  created: "bg-gray-400",
  procurement: "bg-gray-400",
  parts_ordered: "bg-gray-400",
  delivered: "bg-emerald-600",
};

const STATUS_LABELS: Record<string, string> = {
  parts_received: "Parts Received",
  production: "In Production",
  inspection: "Inspection",
  shipping: "Shipping",
  created: "Created",
  procurement: "Procurement",
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dayOfMonth(dateStr: string): number {
  return new Date(dateStr).getDate();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function MonthlyGantt({ jobs }: MonthlyGanttProps) {
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  const todayDate = now.toISOString().split("T")[0];
  const todayDay = now.getFullYear() === viewYear && now.getMonth() === viewMonth
    ? now.getDate()
    : null;

  // Filter jobs that overlap with this month
  const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const scheduledJobs = useMemo(() => {
    return jobs
      .filter((j) => j.scheduled_start && j.scheduled_completion)
      .filter((j) => {
        const start = j.scheduled_start!;
        const end = j.scheduled_completion!;
        return start <= monthEnd && end >= monthStart;
      })
      .sort((a, b) => (a.scheduled_start! > b.scheduled_start! ? 1 : -1));
  }, [jobs, monthStart, monthEnd]);

  const unscheduledJobs = jobs.filter((j) => !j.scheduled_start || !j.scheduled_completion);

  // Calculate bar position for each job
  function getBarStyle(job: Job) {
    const startDate = new Date(job.scheduled_start!);
    const endDate = new Date(job.scheduled_completion!);

    const startDay = startDate.getFullYear() === viewYear && startDate.getMonth() === viewMonth
      ? dayOfMonth(job.scheduled_start!)
      : (job.scheduled_start! < monthStart ? 1 : daysInMonth);

    const endDay = endDate.getFullYear() === viewYear && endDate.getMonth() === viewMonth
      ? dayOfMonth(job.scheduled_completion!)
      : (job.scheduled_completion! > monthEnd ? daysInMonth : 1);

    const clampedStart = clamp(startDay, 1, daysInMonth);
    const clampedEnd = clamp(endDay, 1, daysInMonth);

    const left = ((clampedStart - 1) / daysInMonth) * 100;
    const width = Math.max(((clampedEnd - clampedStart + 1) / daysInMonth) * 100, 2);

    return { left: `${left}%`, width: `${width}%` };
  }

  function getDurationDays(job: Job): number {
    const start = new Date(job.scheduled_start!);
    const end = new Date(job.scheduled_completion!);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  // Generate day markers
  const dayMarkers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekStarts = dayMarkers.filter((d) => new Date(viewYear, viewMonth, d).getDay() === 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Monthly Schedule</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonthOffset((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
            <Button variant="outline" size="sm" onClick={() => setMonthOffset((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {monthOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)}>
                Today
              </Button>
            )}
          </div>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLORS[key]}`} />
              <span className="text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {/* Day header */}
        <div className="relative mb-1 border-b pb-1">
          <div className="flex">
            {/* Job label column */}
            <div className="w-48 shrink-0" />
            {/* Days grid */}
            <div className="relative flex-1">
              <div className="flex">
                {dayMarkers.map((d) => {
                  const isWeekend = [0, 6].includes(new Date(viewYear, viewMonth, d).getDay());
                  const isToday = d === todayDay;
                  return (
                    <div
                      key={d}
                      className={`flex-1 text-center text-[10px] leading-5 ${
                        isToday
                          ? "font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded"
                          : isWeekend
                            ? "text-gray-300 dark:text-gray-600"
                            : "text-gray-400"
                      }`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Job rows */}
        {scheduledJobs.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No scheduled jobs this month.
          </div>
        ) : (
          <div className="space-y-1">
            {scheduledJobs.map((job) => {
              const barStyle = getBarStyle(job);
              const duration = getDurationDays(job);
              const barColor = STATUS_COLORS[job.status] ?? "bg-gray-400";
              const custCode = job.customers?.code ?? "";
              const gmpNum = job.gmps?.gmp_number ?? "";
              const barLabel = `${custCode} ${gmpNum}`.trim();
              const isOverdue = job.scheduled_completion! < todayDate && !["delivered", "shipping"].includes(job.status);

              return (
                <div key={job.id} className="flex items-center group hover:bg-gray-50 dark:hover:bg-gray-900/30 rounded transition-colors">
                  {/* Job label */}
                  <div className="w-48 shrink-0 pr-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-mono font-medium truncate ${isOverdue ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`}>
                        {job.job_number}
                      </span>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">LATE</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {custCode} · {gmpNum} · {job.quantity} pcs · {duration}d
                    </div>
                  </div>

                  {/* Gantt bar area */}
                  <div className="relative flex-1 h-8">
                    {/* Weekend shading */}
                    {dayMarkers.map((d) => {
                      const isWeekend = [0, 6].includes(new Date(viewYear, viewMonth, d).getDay());
                      if (!isWeekend) return null;
                      const left = ((d - 1) / daysInMonth) * 100;
                      const width = (1 / daysInMonth) * 100;
                      return (
                        <div
                          key={d}
                          className="absolute top-0 bottom-0 bg-gray-50 dark:bg-gray-900/20"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    })}

                    {/* Today line */}
                    {todayDay && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-blue-400 z-10"
                        style={{ left: `${((todayDay - 0.5) / daysInMonth) * 100}%` }}
                      />
                    )}

                    {/* Week start lines */}
                    {weekStarts.map((d) => (
                      <div
                        key={`ws-${d}`}
                        className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-800"
                        style={{ left: `${((d - 1) / daysInMonth) * 100}%` }}
                      />
                    ))}

                    {/* The bar */}
                    <div
                      className={`absolute top-1 h-6 rounded ${barColor} ${
                        isOverdue ? "ring-2 ring-red-400 ring-offset-1" : ""
                      } shadow-sm transition-all group-hover:brightness-110 cursor-default`}
                      style={barStyle}
                      title={`${job.job_number} — ${barLabel}\n${job.scheduled_start} → ${job.scheduled_completion} (${duration} days)\nStatus: ${job.status} · Qty: ${job.quantity}`}
                    >
                      {/* Bar text (only if wide enough) */}
                      <div className="flex items-center h-full px-1.5 overflow-hidden">
                        <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                          {barLabel || job.job_number}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Unscheduled jobs */}
        {unscheduledJobs.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-amber-600 mb-2">
              {unscheduledJobs.length} unscheduled job{unscheduledJobs.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {unscheduledJobs.map((j) => (
                <Badge key={j.id} variant="outline" className="text-xs">
                  {j.job_number} — {j.customers?.code ?? "?"} · {j.quantity} pcs
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Month summary */}
        {scheduledJobs.length > 0 && (
          <div className="mt-4 border-t pt-3 flex gap-6 text-xs text-gray-500">
            <span><strong className="text-gray-700 dark:text-gray-300">{scheduledJobs.length}</strong> scheduled jobs</span>
            <span><strong className="text-gray-700 dark:text-gray-300">{scheduledJobs.reduce((s, j) => s + j.quantity, 0)}</strong> total boards</span>
            <span><strong className="text-gray-700 dark:text-gray-300">{scheduledJobs.filter((j) => j.scheduled_completion! < todayDate && !["delivered", "shipping"].includes(j.status)).length}</strong> overdue</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
