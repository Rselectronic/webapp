"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Calendar, GripVertical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export interface ProductionJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  assembly_type: string | null;
  scheduled_start: string | null;
  scheduled_completion: string | null;
  po_number: string | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
  latest_event?: string | null;
}

interface ProductionKanbanProps {
  jobs: ProductionJob[];
}

// Production-specific columns matching VBA Production Schedule statuses:
// From VBA: "1. SMT Done", "2. Inspection Done", "3. TH Done", "4. Packing Done"
// Mapped to our job statuses + production sub-steps
const PRODUCTION_COLUMNS = [
  {
    key: "parts_received",
    label: "Parts Received",
    description: "Material ready, awaiting production start",
    statuses: ["parts_received"],
    dropStatus: "parts_received",
    color: "bg-amber-500",
  },
  {
    key: "production",
    label: "In Production",
    description: "SMT, reflow, through-hole in progress",
    statuses: ["production"],
    dropStatus: "production",
    color: "bg-blue-500",
  },
  {
    key: "inspection",
    label: "Inspection / QC",
    description: "AOI, visual inspection, rework",
    statuses: ["inspection"],
    dropStatus: "inspection",
    color: "bg-purple-500",
  },
  {
    key: "shipping",
    label: "Ready to Ship",
    description: "Packing, shipping docs, awaiting pickup",
    statuses: ["shipping"],
    dropStatus: "shipping",
    color: "bg-green-500",
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
  return { label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, urgency: "on-track" };
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

      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

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

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:snap-none lg:grid lg:grid-cols-4 lg:overflow-x-visible">
      {PRODUCTION_COLUMNS.map((col) => {
        const columnJobs = grouped.get(col.key) ?? [];
        const isDropTarget = dragOverColumn === col.key && draggedJobId !== null;

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

                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, job.id)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-md border p-3 transition-all duration-200 ${
                        urgencyStyles[dueStatus.urgency]
                      } ${isDragging ? "opacity-50 scale-95" : ""} ${
                        isUpdating ? "animate-pulse" : ""
                      }`}
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
                          <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                          {job.job_number}
                        </Link>
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${urgencyBadgeStyles[dueStatus.urgency]}`}>
                          {dueStatus.urgency === "overdue" && <AlertTriangle className="h-3 w-3" />}
                          {dueStatus.label}
                        </span>
                      </div>

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
                        {job.assembly_type && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {job.assembly_type}
                          </Badge>
                        )}
                        {job.po_number && (
                          <span className="truncate">PO: {job.po_number}</span>
                        )}
                      </div>

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

                      {/* Move buttons */}
                      <div className="mt-2 flex items-center justify-end gap-1">
                        {colIdx < PRODUCTION_COLUMNS.length - 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={isUpdating}
                            onClick={() => moveJob(job.id, PRODUCTION_COLUMNS[colIdx + 1].key)}
                          >
                            {PRODUCTION_COLUMNS[colIdx + 1].label}
                            <ChevronRight className="ml-0.5 h-3 w-3" />
                          </Button>
                        )}
                      </div>
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
  );
}
