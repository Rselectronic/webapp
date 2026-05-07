"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Calendar,
  GripVertical,
  AlertTriangle,
  CheckCircle2,
  Plus,
  PackageCheck,
} from "lucide-react";
import { ReleaseToShippingDialog } from "./release-to-shipping-dialog";
import { toast } from "sonner";
import {
  EVENT_GROUPS,
  formatEventLabel,
  getNextEvent,
  type ProductionEventType,
} from "@/lib/production/next-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Fragment } from "react";

export interface ProductionJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  po_number: string | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  /** gmps.board_side is the canonical physical-layout source; the kanban
   *  card shows the legacy two-letter shorthand (TB/TS) derived from it. */
  gmps: { gmp_number: string; board_name: string | null; board_side: string | null } | null;
  latest_event?: string | null;
  /** Total boards already shipped across all shipments for this job. Only
   *  populated for jobs in the 'shipping' column; undefined elsewhere. */
  shipped_qty?: number | null;
  /** Boards released into the "ready to ship" pool. Operator increments
   *  this via the inline release dialog on each card. NULL on legacy
   *  rows — treated as 0 everywhere. */
  ready_to_ship_qty?: number | null;
}

interface ProductionKanbanProps {
  jobs: ProductionJob[];
}

// Kanban columns. The first two are read-only "upstream signal" columns —
// the production floor sees jobs that procurement is working on, but
// can't drag them around (procurement controls when a job becomes
// 'parts_ordered' / 'parts_received'). dropStatus=null disables drop;
// readOnly=true disables drag-from. Real workflow drag begins at
// "Parts Received".
const PRODUCTION_COLUMNS = [
  {
    key: "upcoming_proc",
    label: "In Procurement",
    description: "PO logged; procurement sourcing parts",
    statuses: ["created", "procurement"],
    dropStatus: null as string | null,
    color: "bg-slate-400",
    readOnly: true,
  },
  {
    key: "parts_ordered",
    label: "Parts Ordered",
    description: "POs out to suppliers, awaiting delivery",
    statuses: ["parts_ordered"],
    dropStatus: null as string | null,
    color: "bg-slate-500",
    readOnly: true,
  },
  {
    key: "parts_received",
    label: "Parts Received",
    description: "Material ready, awaiting production start",
    statuses: ["parts_received"],
    dropStatus: "parts_received" as string | null,
    color: "bg-amber-500",
    readOnly: false,
  },
  {
    key: "production",
    label: "In Production",
    description: "SMT, reflow, through-hole in progress",
    statuses: ["production"],
    dropStatus: "production" as string | null,
    color: "bg-blue-500",
    readOnly: false,
  },
  {
    key: "inspection",
    label: "Inspection / QC",
    description: "AOI, visual inspection, rework",
    statuses: ["inspection"],
    dropStatus: "inspection" as string | null,
    color: "bg-purple-500",
    readOnly: false,
  },
  {
    key: "shipping",
    label: "Ready to Ship",
    description: "Packing, shipping docs, awaiting pickup",
    statuses: ["shipping"],
    dropStatus: "shipping" as string | null,
    color: "bg-green-500",
    readOnly: false,
  },
] as const;

function getDueDateStatus(scheduledCompletion: string | null): {
  label: string;
  urgency: "overdue" | "due-today" | "due-soon" | "on-track" | "unscheduled";
} {
  if (!scheduledCompletion) return { label: "No date", urgency: "unscheduled" };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(scheduledCompletion);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, urgency: "overdue" };
  if (diffDays === 0) return { label: "Due today", urgency: "due-today" };
  if (diffDays <= 3) return { label: `Due in ${diffDays}d`, urgency: "due-soon" };
  return { label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" })}`, urgency: "on-track" };
}

const urgencyStyles: Record<string, string> = {
  overdue: "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30",
  "due-today": "border-orange-400 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/30",
  "due-soon": "border-yellow-400 bg-yellow-50 dark:border-yellow-500 dark:bg-yellow-950/20",
  "on-track": "border-border bg-card",
  unscheduled: "border-border bg-card",
};

const urgencyBadgeStyles: Record<string, string> = {
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  "due-today": "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  "due-soon": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  "on-track": "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  unscheduled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ProductionKanban({ jobs: initialJobs }: ProductionKanbanProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  // Tracks which job currently has an in-flight POST /api/production —
  // disables both the primary button and the "+" menu while logging.
  const [loggingEventForJobId, setLoggingEventForJobId] = useState<string | null>(null);
  // Job whose "Release N" dialog is currently open. Single dialog
  // instance — we re-key off the job id so opening it for a different
  // card resets internal form state.
  const [releaseDialogJobId, setReleaseDialogJobId] = useState<string | null>(null);

  // Apply the authoritative ready_to_ship_qty returned by the release
  // API. Mirrors the optimistic pattern in `logEvent` but is called
  // post-success (the dialog itself is fire-and-rollback for any error).
  const applyReleaseUpdate = useCallback(
    (jobId: string, newQty: number) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, ready_to_ship_qty: newQty } : j,
        ),
      );
      router.refresh();
    },
    [router],
  );

  // Log a production_event for `jobId` and optimistically advance the
  // card's `latest_event` so the next button suggestion is correct
  // immediately. Reverts on failure. Off-path events (failures, manual
  // touchups) all flow through the same handler.
  const logEvent = useCallback(
    async (jobId: string, eventType: ProductionEventType) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;
      const previous = job.latest_event ?? null;

      // Optimistic update.
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, latest_event: eventType } : j
        )
      );
      setLoggingEventForJobId(jobId);

      try {
        const res = await fetch("/api/production", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, event_type: eventType }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to log event");
        }
        toast.success(
          `${formatEventLabel(eventType)} logged`,
          { description: job.job_number }
        );
        router.refresh();
      } catch (err) {
        // Revert.
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, latest_event: previous } : j
          )
        );
        toast.error("Failed to log event", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoggingEventForJobId(null);
      }
    },
    [jobs, router]
  );

  const grouped = new Map<string, ProductionJob[]>();
  for (const col of PRODUCTION_COLUMNS) {
    const colJobs = jobs
      .filter((j) => (col.statuses as readonly string[]).includes(j.status))
      .sort((a, b) => {
        // Sort: overdue first, then by due date ascending, unscheduled last
        const aDate = a.scheduled_completion ? new Date(a.scheduled_completion).getTime() : Infinity;
        const bDate = b.scheduled_completion ? new Date(b.scheduled_completion).getTime() : Infinity;
        return aDate - bDate;
      });
    grouped.set(col.key, colJobs);
  }

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, jobId: string) => {
      setDraggedJobId(jobId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", jobId);
      if (e.currentTarget) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = "1";
      setDraggedJobId(null);
      setDragOverColumn(null);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnKey);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragOverColumn(null);
      }
    },
    []
  );

  const moveJob = useCallback(
    async (jobId: string, targetColumnKey: string) => {
      // Always clear drag state at the start of a move — React unmounts the
      // dragged tile after the optimistic update, so handleDragEnd may never
      // fire on the original DOM node.
      setDraggedJobId(null);
      setDragOverColumn(null);

      const column = PRODUCTION_COLUMNS.find((c) => c.key === targetColumnKey);
      if (!column) return;

      // Read-only columns reject drops — procurement-side statuses are
      // controlled by the procurement module, not the production floor.
      if (column.dropStatus === null) return;

      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

      // Source guard: also refuse to move a job *out* of a read-only
      // column from the production board. (Belt + suspenders — the card
      // itself is also non-draggable in those columns.)
      const sourceColumn = PRODUCTION_COLUMNS.find((c) =>
        (c.statuses as readonly string[]).includes(job.status)
      );
      if (sourceColumn?.readOnly) return;

      if ((column.statuses as readonly string[]).includes(job.status)) return;

      const newStatus = column.dropStatus;
      const oldStatus = job.status;

      // Optimistic update
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
      );
      setUpdatingJobId(jobId);

      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update job status");
        }

        toast.success(
          `${job.job_number} moved to ${column.label}`,
          { description: `${oldStatus.replace(/_/g, " ")} -> ${newStatus.replace(/_/g, " ")}` }
        );
        router.refresh();
      } catch (err) {
        // Revert on failure
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: oldStatus } : j))
        );
        toast.error("Failed to update job status", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setUpdatingJobId(null);
      }
    },
    [jobs, router]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
      e.preventDefault();
      setDragOverColumn(null);
      const jobId = e.dataTransfer.getData("text/plain");
      if (!jobId) return;
      await moveJob(jobId, columnKey);
    },
    [moveJob]
  );

  // Find current column index for a job to show move buttons
  function getColumnIndex(status: string): number {
    return PRODUCTION_COLUMNS.findIndex((c) =>
      (c.statuses as readonly string[]).includes(status)
    );
  }

  // Resolve the job currently targeted by the release dialog so we can
  // pass live counts (the dialog needs the *current* released qty, which
  // may have changed since it was opened due to a sibling refresh).
  const releaseDialogJob =
    releaseDialogJobId != null
      ? jobs.find((j) => j.id === releaseDialogJobId) ?? null
      : null;

  return (
    <>
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:snap-none lg:grid lg:grid-cols-6 lg:overflow-x-visible">
      {PRODUCTION_COLUMNS.map((col) => {
        const columnJobs = grouped.get(col.key) ?? [];
        // Read-only columns never accept drops.
        const isDropTarget =
          !col.readOnly && dragOverColumn === col.key && draggedJobId !== null;

        return (
          <div
            key={col.key}
            className="min-w-[280px] snap-center flex-shrink-0 lg:min-w-0 lg:flex-shrink"
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <Card
              className={`min-h-[400px] transition-colors duration-200 ${
                isDropTarget
                  ? "border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/20"
                  : ""
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                    {col.label}
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {columnJobs.length}
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{col.description}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-2">
                {columnJobs.map((job) => {
                  const isDragging = draggedJobId === job.id;
                  const isUpdating = updatingJobId === job.id;
                  const dueStatus = getDueDateStatus(job.scheduled_completion);
                  const colIdx = getColumnIndex(job.status);
                  const cardReadOnly = col.readOnly;
                  // For columns that combine multiple sub-statuses (e.g.
                  // created + procurement), surface the exact sub-status
                  // so the floor knows which is which.
                  const showSubStatus = col.statuses.length > 1;

                  return (
                    <div
                      key={job.id}
                      draggable={!cardReadOnly}
                      onDragStart={
                        cardReadOnly ? undefined : (e) => handleDragStart(e, job.id)
                      }
                      onDragEnd={cardReadOnly ? undefined : handleDragEnd}
                      className={`rounded-md border p-3 transition-all duration-200 ${
                        urgencyStyles[dueStatus.urgency]
                      } ${isDragging ? "opacity-50 scale-95" : ""} ${
                        isUpdating ? "animate-pulse" : ""
                      } ${cardReadOnly ? "opacity-80" : ""}`}
                    >
                      {/* Header: Job number + due status */}
                      <div className="mb-1.5 flex items-center justify-between">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="flex items-center gap-1.5 font-mono text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          onClick={(e) => {
                            if (draggedJobId) e.preventDefault();
                          }}
                        >
                          {!cardReadOnly && (
                            <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                          )}
                          {job.job_number}
                        </Link>
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${urgencyBadgeStyles[dueStatus.urgency]}`}>
                          {dueStatus.urgency === "overdue" && <AlertTriangle className="h-3 w-3" />}
                          {dueStatus.label}
                        </span>
                      </div>

                      {/* Sub-status badge for columns that lump multiple statuses */}
                      {showSubStatus && (
                        <div className="mb-1">
                          <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {job.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}

                      {/* Customer + Board */}
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {job.customers?.code ?? "N/A"}
                        </span>
                        {" - "}
                        {job.gmps?.gmp_number ?? "Unknown board"}
                        {job.gmps?.board_name ? ` (${job.gmps.board_name})` : ""}
                      </div>

                      {/* Quantity + Assembly Type */}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Qty: <strong className="text-foreground/80">{job.quantity}</strong></span>
                        {job.gmps?.board_side && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {job.gmps.board_side === "single" ? "TS" : "TB"}
                          </Badge>
                        )}
                        {/* Partial-shipment progress badge — only relevant
                            in the Ready-to-Ship column where shipments
                            exist. shipped_qty=null/0 with no shipments
                            renders nothing. */}
                        {job.shipped_qty != null && job.shipped_qty > 0 && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1 py-0 ${
                              job.shipped_qty >= job.quantity
                                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            }`}
                          >
                            {job.shipped_qty}/{job.quantity} shipped
                          </Badge>
                        )}
                        {job.po_number && (
                          <span className="truncate">PO: {job.po_number}</span>
                        )}
                      </div>

                      {/* Release-to-shipping progress. Hidden on cards
                          that haven't released anything yet (avoid clutter
                          on fresh cards). On the shipping column the
                          counter is implicit (everything is released by
                          definition) so we hide it there too. */}
                      {(() => {
                        const released = job.ready_to_ship_qty ?? 0;
                        const showProgress =
                          job.status !== "shipping" && released > 0;
                        if (!showProgress) return null;
                        const pct = Math.min(
                          100,
                          Math.round((released / Math.max(1, job.quantity)) * 100),
                        );
                        return (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>
                                <span className="font-medium text-foreground/80">
                                  {released}
                                </span>
                                {" / "}
                                {job.quantity} released
                              </span>
                              <span>{pct}%</span>
                            </div>
                            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-muted">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Scheduled dates */}
                      {(job.scheduled_start || job.scheduled_completion) && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {job.scheduled_start && (
                            <span>{new Date(job.scheduled_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          )}
                          {job.scheduled_start && job.scheduled_completion && <span>-</span>}
                          {job.scheduled_completion && (
                            <span>{new Date(job.scheduled_completion).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          )}
                        </div>
                      )}

                      {/* Inline event logging — only on writable cards.
                          Suggests the next canonical event from the job's
                          last logged event + board side. The "+" menu
                          covers off-path events (failures, manual touchups).
                          One click logs and advances the suggestion. */}
                      {!cardReadOnly && (() => {
                        const lastEvent = job.latest_event ?? null;
                        const boardSide = job.gmps?.board_side ?? null;
                        const next = getNextEvent(lastEvent, boardSide);
                        const isLoggingThis = loggingEventForJobId === job.id;
                        return (
                          <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                Last event
                              </p>
                              <p className="truncate text-[10px] font-medium text-foreground/80">
                                {lastEvent ? formatEventLabel(lastEvent) : "—"}
                              </p>
                            </div>
                            {next ? (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                disabled={isLoggingThis}
                                onClick={() => logEvent(job.id, next)}
                                title={`Log "${formatEventLabel(next)}" for ${job.job_number}`}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {formatEventLabel(next)}
                              </Button>
                            ) : (
                              <span className="text-[10px] italic text-muted-foreground">
                                {lastEvent === "ready_to_ship"
                                  ? "Done"
                                  : "Choose →"}
                              </span>
                            )}
                            <DropdownMenu>
                              {/* Base UI's DropdownMenuTrigger uses
                                  `render={<Button …>}` instead of Radix's
                                  `asChild`. */}
                              <DropdownMenuTrigger
                                disabled={isLoggingThis}
                                render={
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-7 p-0"
                                    title="Log a different event"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent align="end" className="w-56">
                                {EVENT_GROUPS.map((group, gi) => (
                                  // Each section is a DropdownMenuGroup so
                                  // DropdownMenuLabel (Base UI's
                                  // MenuPrimitive.GroupLabel) has its
                                  // required parent — without it Base UI
                                  // throws at render time and the whole
                                  // page boundary breaks.
                                  <Fragment key={group.label}>
                                    {gi > 0 && <DropdownMenuSeparator />}
                                    <DropdownMenuGroup>
                                      <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                        {group.label}
                                      </DropdownMenuLabel>
                                      {group.events.map((e) => (
                                        <DropdownMenuItem
                                          key={e.type}
                                          onClick={() => logEvent(job.id, e.type)}
                                          className="text-xs"
                                        >
                                          {e.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuGroup>
                                  </Fragment>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })()}

                      {/* Bottom action row: Release-to-shipping (left) +
                          move-forward (right). Split off the event row
                          above so the three event controls don't fight
                          for horizontal space on narrow cards. */}
                      {(() => {
                        const releaseable =
                          !cardReadOnly &&
                          (job.status === "parts_received" ||
                            job.status === "production" ||
                            job.status === "inspection") &&
                          (job.ready_to_ship_qty ?? 0) < job.quantity;
                        const moveable =
                          !cardReadOnly &&
                          colIdx < PRODUCTION_COLUMNS.length - 1 &&
                          !PRODUCTION_COLUMNS[colIdx + 1].readOnly;
                        if (!releaseable && !moveable) return null;
                        return (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            {releaseable ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => setReleaseDialogJobId(job.id)}
                                title={`Release boards to shipping for ${job.job_number}`}
                              >
                                <PackageCheck className="mr-1 h-3 w-3" />
                                Release N
                              </Button>
                            ) : (
                              <span />
                            )}
                            {moveable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                disabled={isUpdating}
                                onClick={() =>
                                  moveJob(job.id, PRODUCTION_COLUMNS[colIdx + 1].key)
                                }
                              >
                                {PRODUCTION_COLUMNS[colIdx + 1].label}
                                <ChevronRight className="ml-0.5 h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                {columnJobs.length === 0 && (
                  <p className={`py-8 text-center text-xs text-muted-foreground ${isDropTarget ? "text-blue-500" : ""}`}>
                    {isDropTarget ? "Drop job here" : "No jobs in this stage"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
    {releaseDialogJob && (
      <ReleaseToShippingDialog
        // Re-key per job to reset internal form state when the dialog
        // hops from one card to another.
        key={releaseDialogJob.id}
        open={true}
        onOpenChange={(next) => {
          if (!next) setReleaseDialogJobId(null);
        }}
        jobId={releaseDialogJob.id}
        jobNumber={releaseDialogJob.job_number}
        jobQuantity={releaseDialogJob.quantity}
        alreadyReleased={releaseDialogJob.ready_to_ship_qty ?? 0}
        alreadyShipped={releaseDialogJob.shipped_qty ?? 0}
        onSuccess={(newQty) => applyReleaseUpdate(releaseDialogJob.id, newQty)}
      />
    )}
    </>
  );
}
