"use client";

// ----------------------------------------------------------------------------
// monthly-gantt.tsx
//
// Monthly Gantt with drag-to-schedule. Three gestures, all pointer-event
// driven (HTML5 drag is too clunky for resize handles + visual feedback):
//
//   1. Drag a bar's middle  → moves both endpoints by the same day delta
//      (preserves duration). Cursor: grab/grabbing.
//   2. Drag a bar's left or right edge → resizes that edge only. Cursor:
//      ew-resize. Dragging past the opposite edge clamps.
//   3. Drag an unscheduled chip onto a day column → sets a 5-day window
//      starting at the dropped day. Resize from there.
//
// CROSS-MONTH DRAGGING:
// Drag math is calendar-date based (not pixel-delta based). At drag start
// we capture the CALENDAR DATE under the cursor (the "anchor date"). On
// every pointermove we look up the CALENDAR DATE currently under the
// cursor and compute the day-delta as (current - anchor). Apply that delta
// to the original schedule. This stays correct across month boundaries —
// only the visible month view changes.
//
// AUTO-SCROLL: while dragging, hovering near the gantt's left or right
// edge for ~500ms advances/retreats the visible month. Pull the cursor
// back to the centre to stop. While auto-scroll is active a banner shows
// the direction. Each tick recomputes the preview from the cursor's last
// known position so the bar tracks the new month immediately.
//
// All gestures snap to whole days. ESC during a drag cancels. Pointer up
// commits whatever the preview was; failure reverts the optimistic state.
//
// State sync: local jobs array mirrors the prop so optimistic updates can
// repaint immediately. We do not call router.refresh() — the user's
// stated preference is inline state patches over re-fetching.
// ----------------------------------------------------------------------------

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, GripHorizontal } from "lucide-react";
import { todayMontreal } from "@/lib/utils/format";

interface Job {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null; board_side?: string | null } | null;
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

// Default duration (in days) when an unscheduled job is dropped onto the
// calendar. The user can resize from the edges afterwards.
const DEFAULT_NEW_DURATION_DAYS = 5;

// Auto-scroll: how close to a horizontal edge before we trigger a month
// advance, and how fast the ticks repeat.
const EDGE_ZONE_PX = 60;
const EDGE_INITIAL_DELAY_MS = 500;
const EDGE_REPEAT_MS = 700;

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dayOfMonth(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDate();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function formatYMD(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatYMD(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateDiffDays(later: string, earlier: string): number {
  return Math.round(
    (new Date(later + "T00:00:00").getTime() -
      new Date(earlier + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

type DragMode = "move" | "resize-start" | "resize-end" | "create";

interface DragState {
  jobId: string;
  mode: DragMode;
  // Schedule at drag start. Used for delta math AND for revert-on-failure.
  // Null for "create" mode (job had no schedule).
  originalStart: string | null;
  originalEnd: string | null;
  // The calendar date that was under the cursor at drag start. Snapshotted
  // in the month view that was active at drag start. Used as the zero
  // point for the delta math — survives mid-drag month changes because it
  // is an absolute date, not a pixel offset.
  anchorDate: string;
  // Live preview of what the bar will commit to on release.
  previewStart: string;
  previewEnd: string;
}

export function MonthlyGantt({ jobs }: MonthlyGanttProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [localJobs, setLocalJobs] = useState(jobs);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [edgeZone, setEdgeZone] = useState<"left" | "right" | null>(null);

  const headerGanttRef = useRef<HTMLDivElement>(null);
  // Last known cursor X — used to recompute the preview when the month
  // auto-advances without a fresh pointermove.
  const lastClientXRef = useRef<number>(0);
  // Auto-scroll timer + the direction it is currently scrolling. Refs so
  // we don't fire stale state from setTimeout closures.
  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDirRef = useRef<"left" | "right" | null>(null);

  // Re-mirror the prop into local state when the parent passes a new
  // array (e.g. after a navigation that re-runs the server component).
  // Done via ref-comparison in render to avoid the useEffect/setState
  // anti-pattern.
  const propsJobsRef = useRef(jobs);
  if (propsJobsRef.current !== jobs) {
    propsJobsRef.current = jobs;
    setLocalJobs(jobs);
  }

  const now = new Date();
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  const todayDate = todayMontreal();
  const todayDay =
    now.getFullYear() === viewYear && now.getMonth() === viewMonth ? now.getDate() : null;

  const monthStart = formatYMD(viewYear, viewMonth, 1);
  const monthEnd = formatYMD(viewYear, viewMonth, daysInMonth);

  // ---------------------------------------------------------------------------
  // Pixel <-> day helpers (relative to the gantt grid header)
  // ---------------------------------------------------------------------------
  const pixelsPerDay = useCallback((): number => {
    const el = headerGanttRef.current;
    if (!el) return 0;
    return el.offsetWidth / daysInMonth;
  }, [daysInMonth]);

  // Convert a screen-X coordinate to the calendar date under it in the
  // currently-visible month. Returns null if the cursor is off the grid.
  const calendarDateAtX = useCallback(
    (clientX: number): string | null => {
      const rect = headerGanttRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const ppd = pixelsPerDay();
      if (ppd === 0) return null;
      const relX = clientX - rect.left;
      if (relX < 0 || relX > rect.width) return null;
      const day = clamp(Math.floor(relX / ppd) + 1, 1, daysInMonth);
      return formatYMD(viewYear, viewMonth, day);
    },
    [pixelsPerDay, daysInMonth, viewYear, viewMonth]
  );

  // ---------------------------------------------------------------------------
  // Auto-scroll on edge hover
  // ---------------------------------------------------------------------------
  const stopEdgeAutoScroll = useCallback(() => {
    if (edgeTimerRef.current) {
      clearTimeout(edgeTimerRef.current);
      edgeTimerRef.current = null;
    }
    edgeDirRef.current = null;
    setEdgeZone(null);
  }, []);

  const startEdgeAutoScroll = useCallback(
    (direction: "left" | "right") => {
      if (edgeDirRef.current === direction) return; // already running
      stopEdgeAutoScroll();
      edgeDirRef.current = direction;
      setEdgeZone(direction);
      const tick = () => {
        if (edgeDirRef.current !== direction) return;
        setMonthOffset((p) => p + (direction === "right" ? 1 : -1));
        edgeTimerRef.current = setTimeout(tick, EDGE_REPEAT_MS);
      };
      edgeTimerRef.current = setTimeout(tick, EDGE_INITIAL_DELAY_MS);
    },
    [stopEdgeAutoScroll]
  );

  // ---------------------------------------------------------------------------
  // Apply a cursor position to the drag preview. Calendar-date based, so
  // it works identically whether or not the month has shifted mid-drag.
  // ---------------------------------------------------------------------------
  const applyCursor = useCallback(
    (clientX: number) => {
      const currentDate = calendarDateAtX(clientX);
      setDrag((prev) => {
        if (!prev) return prev;

        let newStart = prev.previewStart;
        let newEnd = prev.previewEnd;

        if (prev.mode === "create") {
          // For "create", the cursor's calendar date IS the start. End is
          // start + default duration. Cursor off-grid → hold last preview.
          if (currentDate) {
            newStart = currentDate;
            newEnd = addDays(currentDate, DEFAULT_NEW_DURATION_DAYS - 1);
          }
        } else if (
          prev.originalStart &&
          prev.originalEnd &&
          prev.anchorDate &&
          currentDate
        ) {
          const dayDelta = dateDiffDays(currentDate, prev.anchorDate);
          if (prev.mode === "move") {
            newStart = addDays(prev.originalStart, dayDelta);
            newEnd = addDays(prev.originalEnd, dayDelta);
          } else if (prev.mode === "resize-start") {
            let s = addDays(prev.originalStart, dayDelta);
            if (s > prev.originalEnd) s = prev.originalEnd;
            newStart = s;
          } else if (prev.mode === "resize-end") {
            let en = addDays(prev.originalEnd, dayDelta);
            if (en < prev.originalStart) en = prev.originalStart;
            newEnd = en;
          }
        }
        if (newStart === prev.previewStart && newEnd === prev.previewEnd) return prev;
        return { ...prev, previewStart: newStart, previewEnd: newEnd };
      });
    },
    [calendarDateAtX]
  );

  // When monthOffset changes mid-drag, recompute the preview from the
  // last known cursor position. This is what makes the bar appear in the
  // new month immediately after auto-scroll fires (the user may not move
  // the cursor between ticks).
  useEffect(() => {
    if (!drag) return;
    applyCursor(lastClientXRef.current);
    // We intentionally only react to monthOffset changes; the drag
    // dependency would re-fire on every preview update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOffset]);

  // ---------------------------------------------------------------------------
  // Commit on drag end — optimistic local update, PATCH, revert on fail.
  // ---------------------------------------------------------------------------
  const commitDrag = useCallback(async (state: DragState) => {
    const { jobId, previewStart, previewEnd, originalStart, originalEnd, mode } = state;

    const sameAsOriginal =
      previewStart === (originalStart ?? "") && previewEnd === (originalEnd ?? "");
    if (sameAsOriginal) return;
    if (mode === "create" && (!previewStart || !previewEnd)) return;

    setLocalJobs((cur) =>
      cur.map((j) =>
        j.id === jobId
          ? { ...j, scheduled_start: previewStart, scheduled_completion: previewEnd }
          : j
      )
    );

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_start: previewStart,
          scheduled_completion: previewEnd,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update schedule");
      }
      const labelMap: Record<DragMode, string> = {
        move: "Job rescheduled",
        "resize-start": "Start date updated",
        "resize-end": "Completion date updated",
        create: "Job scheduled",
      };
      toast.success(labelMap[mode], {
        description: `${previewStart} → ${previewEnd}`,
      });
    } catch (err) {
      setLocalJobs((cur) =>
        cur.map((j) =>
          j.id === jobId
            ? {
                ...j,
                scheduled_start: originalStart,
                scheduled_completion: originalEnd,
              }
            : j
        )
      );
      toast.error("Failed to update schedule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Drag start handlers — each captures the anchor date under the cursor.
  // ---------------------------------------------------------------------------
  const startMove = useCallback(
    (e: React.PointerEvent, job: Job) => {
      if (!job.scheduled_start || !job.scheduled_completion) return;
      e.preventDefault();
      e.stopPropagation();
      const anchor =
        calendarDateAtX(e.clientX) ?? job.scheduled_start;
      lastClientXRef.current = e.clientX;
      setDrag({
        jobId: job.id,
        mode: "move",
        originalStart: job.scheduled_start,
        originalEnd: job.scheduled_completion,
        anchorDate: anchor,
        previewStart: job.scheduled_start,
        previewEnd: job.scheduled_completion,
      });
    },
    [calendarDateAtX]
  );

  const startResize = useCallback(
    (e: React.PointerEvent, job: Job, side: "start" | "end") => {
      if (!job.scheduled_start || !job.scheduled_completion) return;
      e.preventDefault();
      e.stopPropagation();
      const anchor =
        calendarDateAtX(e.clientX) ??
        (side === "start" ? job.scheduled_start : job.scheduled_completion);
      lastClientXRef.current = e.clientX;
      setDrag({
        jobId: job.id,
        mode: side === "start" ? "resize-start" : "resize-end",
        originalStart: job.scheduled_start,
        originalEnd: job.scheduled_completion,
        anchorDate: anchor,
        previewStart: job.scheduled_start,
        previewEnd: job.scheduled_completion,
      });
    },
    [calendarDateAtX]
  );

  const startCreate = useCallback(
    (e: React.PointerEvent, job: Job) => {
      e.preventDefault();
      e.stopPropagation();
      // Anchor is irrelevant for "create" — the preview is recomputed
      // each move from the cursor's calendar position. Capture something
      // valid anyway so the drag-state shape is uniform.
      const anchor = calendarDateAtX(e.clientX) ?? formatYMD(viewYear, viewMonth, 1);
      lastClientXRef.current = e.clientX;
      setDrag({
        jobId: job.id,
        mode: "create",
        originalStart: null,
        originalEnd: null,
        anchorDate: anchor,
        previewStart: "",
        previewEnd: "",
      });
    },
    [calendarDateAtX, viewYear, viewMonth]
  );

  // ---------------------------------------------------------------------------
  // Window-level pointer/keyboard handlers (only attached while dragging).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!drag) return;

    function onPointerMove(e: PointerEvent) {
      lastClientXRef.current = e.clientX;

      // Edge auto-scroll detection.
      const rect = headerGanttRef.current?.getBoundingClientRect();
      if (rect) {
        if (e.clientX < rect.left + EDGE_ZONE_PX) {
          startEdgeAutoScroll("left");
        } else if (e.clientX > rect.right - EDGE_ZONE_PX) {
          startEdgeAutoScroll("right");
        } else {
          stopEdgeAutoScroll();
        }
      }

      applyCursor(e.clientX);
    }

    function onPointerUp() {
      stopEdgeAutoScroll();
      setDrag((prev) => {
        if (prev) void commitDrag(prev);
        return null;
      });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopEdgeAutoScroll();
        setDrag(null);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, applyCursor, startEdgeAutoScroll, stopEdgeAutoScroll, commitDrag]);

  // Cleanup any lingering timer on unmount.
  useEffect(() => {
    return () => {
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Apply the live drag preview to the rendered jobs list. Single source
  // of truth for what the gantt paints — both ordinary local state and
  // whatever the drag is showing right now.
  // ---------------------------------------------------------------------------
  const jobsWithPreview = useMemo(() => {
    return localJobs.map((j) => {
      if (
        drag &&
        drag.jobId === j.id &&
        drag.previewStart &&
        drag.previewEnd
      ) {
        return {
          ...j,
          scheduled_start: drag.previewStart,
          scheduled_completion: drag.previewEnd,
        };
      }
      return j;
    });
  }, [localJobs, drag]);

  const scheduledJobs = useMemo(() => {
    return jobsWithPreview
      .filter((j) => j.scheduled_start && j.scheduled_completion)
      .filter((j) => {
        const start = j.scheduled_start!;
        const end = j.scheduled_completion!;
        return start <= monthEnd && end >= monthStart;
      })
      .sort((a, b) => (a.scheduled_start! > b.scheduled_start! ? 1 : -1));
  }, [jobsWithPreview, monthStart, monthEnd]);

  const unscheduledJobs = jobsWithPreview.filter(
    (j) => !j.scheduled_start || !j.scheduled_completion
  );

  function getBarStyle(job: Job) {
    const startDate = new Date(job.scheduled_start! + "T00:00:00");
    const endDate = new Date(job.scheduled_completion! + "T00:00:00");

    const startDay =
      startDate.getFullYear() === viewYear && startDate.getMonth() === viewMonth
        ? dayOfMonth(job.scheduled_start!)
        : job.scheduled_start! < monthStart
          ? 1
          : daysInMonth;

    const endDay =
      endDate.getFullYear() === viewYear && endDate.getMonth() === viewMonth
        ? dayOfMonth(job.scheduled_completion!)
        : job.scheduled_completion! > monthEnd
          ? daysInMonth
          : 1;

    const clampedStart = clamp(startDay, 1, daysInMonth);
    const clampedEnd = clamp(endDay, 1, daysInMonth);

    const left = ((clampedStart - 1) / daysInMonth) * 100;
    const width = Math.max(((clampedEnd - clampedStart + 1) / daysInMonth) * 100, 2);

    return { left: `${left}%`, width: `${width}%` };
  }

  function getDurationDays(job: Job): number {
    const start = new Date(job.scheduled_start! + "T00:00:00");
    const end = new Date(job.scheduled_completion! + "T00:00:00");
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  const dayMarkers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekStarts = dayMarkers.filter(
    (d) => new Date(viewYear, viewMonth, d).getDay() === 1
  );

  const isDragging = drag !== null;
  const isCreating = drag?.mode === "create";

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
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLORS[key]}`} />
              <span className="text-gray-500">{label}</span>
            </div>
          ))}
          <span className="ml-auto flex items-center gap-1 text-gray-400">
            <GripHorizontal className="h-3.5 w-3.5" />
            Drag bars to move • drag edges to resize • hover near edges to scroll months • ESC to cancel
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Day header */}
        <div className="relative mb-1 border-b pb-1">
          <div className="flex">
            <div className="w-48 shrink-0" />
            <div className="relative flex-1" ref={headerGanttRef}>
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
              {/* Auto-scroll indicators — only render while dragging in an
                  edge zone, sit on top of the day header and the rows. */}
              {isDragging && edgeZone === "left" && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-blue-300/60 to-transparent rounded-l flex items-center justify-start pl-2 z-30 animate-pulse"
                >
                  <ChevronLeft className="h-5 w-5 text-blue-700" />
                </div>
              )}
              {isDragging && edgeZone === "right" && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-blue-300/60 to-transparent rounded-r flex items-center justify-end pr-2 z-30 animate-pulse"
                >
                  <ChevronRight className="h-5 w-5 text-blue-700" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Job rows */}
        {scheduledJobs.length === 0 && !isCreating ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No scheduled jobs this month.
            {unscheduledJobs.length > 0 && (
              <div className="mt-1 text-xs">
                Drag an unscheduled chip below onto a day to schedule it.
              </div>
            )}
          </div>
        ) : (
          <div
            className={`space-y-1 ${
              isCreating ? "ring-1 ring-blue-300 ring-inset rounded bg-blue-50/30 dark:bg-blue-950/10" : ""
            }`}
          >
            {scheduledJobs.map((job) => {
              const barStyle = getBarStyle(job);
              const duration = getDurationDays(job);
              const barColor = STATUS_COLORS[job.status] ?? "bg-gray-400";
              const custCode = job.customers?.code ?? "";
              const gmpNum = job.gmps?.gmp_number ?? "";
              const barLabel = `${custCode} ${gmpNum}`.trim();
              const isOverdue =
                job.scheduled_completion! < todayDate &&
                !["delivered", "shipping"].includes(job.status);
              const isDragTarget = drag?.jobId === job.id;
              const isInteractive = !isDragging || isDragTarget;

              return (
                <div
                  key={job.id}
                  className={`flex items-center group rounded transition-colors ${
                    isDragTarget
                      ? "bg-blue-50 dark:bg-blue-950/30"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900/30"
                  }`}
                >
                  {/* Job label */}
                  <div className="w-48 shrink-0 pr-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/jobs/${job.id}`}
                        className={`text-xs font-mono font-medium truncate hover:underline ${
                          isOverdue
                            ? "text-red-600"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {job.job_number}
                      </Link>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                          LATE
                        </Badge>
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
                      const isWeekend = [0, 6].includes(
                        new Date(viewYear, viewMonth, d).getDay()
                      );
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
                      } ${
                        isDragTarget ? "ring-2 ring-blue-500 shadow-lg" : "shadow-sm"
                      } transition-all group-hover:brightness-110 ${
                        isInteractive ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                      } select-none touch-none`}
                      style={barStyle}
                      onPointerDown={
                        isInteractive ? (e) => startMove(e, job) : undefined
                      }
                      title={`${job.job_number} — ${barLabel}\n${job.scheduled_start} → ${job.scheduled_completion} (${duration} days)\nStatus: ${job.status} · Qty: ${job.quantity}\n\nDrag bar to move · drag edges to resize · ESC to cancel`}
                    >
                      {/* Left resize handle */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-2 rounded-l ${
                          isInteractive ? "cursor-ew-resize hover:bg-white/30" : ""
                        }`}
                        onPointerDown={
                          isInteractive
                            ? (e) => startResize(e, job, "start")
                            : undefined
                        }
                      />
                      {/* Bar text */}
                      <div className="flex items-center h-full px-2.5 overflow-hidden pointer-events-none">
                        <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                          {barLabel || job.job_number}
                          {isDragTarget && (
                            <span className="ml-1 opacity-80">
                              ({job.scheduled_start} → {job.scheduled_completion})
                            </span>
                          )}
                        </span>
                      </div>
                      {/* Right resize handle */}
                      <div
                        className={`absolute right-0 top-0 bottom-0 w-2 rounded-r ${
                          isInteractive ? "cursor-ew-resize hover:bg-white/30" : ""
                        }`}
                        onPointerDown={
                          isInteractive
                            ? (e) => startResize(e, job, "end")
                            : undefined
                        }
                      />
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
              {unscheduledJobs.length} unscheduled job
              {unscheduledJobs.length !== 1 ? "s" : ""}
              <span className="ml-2 text-gray-400 font-normal">
                drag a chip onto the calendar to schedule it
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {unscheduledJobs.map((j) => {
                const isDragTarget = drag?.jobId === j.id;
                return (
                  <Badge
                    key={j.id}
                    variant="outline"
                    className={`text-xs select-none touch-none ${
                      isDragTarget
                        ? "cursor-grabbing bg-blue-100 border-blue-400"
                        : "cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                    onPointerDown={(e) => startCreate(e, j)}
                    title={`${j.job_number} — drag onto a day to schedule for ${DEFAULT_NEW_DURATION_DAYS} days`}
                  >
                    <GripHorizontal className="h-3 w-3 mr-1 text-gray-400" />
                    {j.job_number} — {j.customers?.code ?? "?"} · {j.quantity} pcs
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Month summary */}
        {scheduledJobs.length > 0 && (
          <div className="mt-4 border-t pt-3 flex gap-6 text-xs text-gray-500">
            <span>
              <strong className="text-gray-700 dark:text-gray-300">{scheduledJobs.length}</strong>{" "}
              scheduled jobs
            </span>
            <span>
              <strong className="text-gray-700 dark:text-gray-300">
                {scheduledJobs.reduce((s, j) => s + j.quantity, 0)}
              </strong>{" "}
              total boards
            </span>
            <span>
              <strong className="text-gray-700 dark:text-gray-300">
                {scheduledJobs.filter(
                  (j) =>
                    j.scheduled_completion! < todayDate &&
                    !["delivered", "shipping"].includes(j.status)
                ).length}
              </strong>{" "}
              overdue
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
