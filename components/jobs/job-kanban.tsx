"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { toast } from "sonner";

interface KanbanJob {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string } | null;
}

interface JobKanbanProps {
  jobs: KanbanJob[];
}

const COLUMNS = [
  { key: "created", label: "Created", statuses: ["created"], dropStatus: "created" },
  {
    key: "procurement",
    label: "Procurement",
    statuses: ["procurement", "parts_ordered", "parts_received"],
    dropStatus: "procurement",
  },
  {
    key: "production",
    label: "Production",
    statuses: ["production", "inspection"],
    dropStatus: "production",
  },
  { key: "shipping", label: "Shipping", statuses: ["shipping"], dropStatus: "shipping" },
  { key: "delivered", label: "Delivered", statuses: ["delivered"], dropStatus: "delivered" },
  { key: "invoiced", label: "Invoiced", statuses: ["invoiced"], dropStatus: "invoiced" },
] as const;

export function JobKanban({ jobs: initialJobs }: JobKanbanProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  const grouped = new Map<string, KanbanJob[]>();
  for (const col of COLUMNS) {
    grouped.set(
      col.key,
      jobs.filter((j) =>
        (col.statuses as readonly string[]).includes(j.status)
      )
    );
  }

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLAnchorElement>, jobId: string) => {
      setDraggedJobId(jobId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", jobId);
      // Make the ghost semi-transparent
      if (e.currentTarget) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<HTMLAnchorElement>) => {
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
      // Only clear if leaving the column itself (not entering a child)
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragOverColumn(null);
      }
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
      e.preventDefault();
      // Clear drag state immediately — React unmounts the dragged tile after
      // the optimistic update, so handleDragEnd may never fire on the
      // original DOM node, leaving draggedJobId / dragOverColumn stuck.
      setDragOverColumn(null);
      setDraggedJobId(null);

      const jobId = e.dataTransfer.getData("text/plain");
      if (!jobId) return;

      const column = COLUMNS.find((c) => c.key === columnKey);
      if (!column) return;

      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;

      // Already in this column?
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
          { description: `${oldStatus} → ${newStatus}` }
        );
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
    [jobs]
  );

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:snap-none md:grid md:grid-cols-6 md:overflow-x-visible">
      {COLUMNS.map((col) => {
        const columnJobs = grouped.get(col.key) ?? [];
        const isDropTarget =
          dragOverColumn === col.key && draggedJobId !== null;

        return (
          <div
            key={col.key}
            className="min-w-[260px] snap-center flex-shrink-0 md:min-w-0 md:flex-shrink"
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <Card
              className={`min-h-[300px] transition-colors duration-200 ${
                isDropTarget
                  ? "border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/20"
                  : ""
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  {col.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {columnJobs.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-2">
                {columnJobs.map((job) => {
                  const isDragging = draggedJobId === job.id;
                  const isUpdating = updatingJobId === job.id;

                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, job.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        // Prevent navigation when dropping
                        if (draggedJobId) {
                          e.preventDefault();
                        }
                      }}
                      className={`block cursor-grab rounded-md border bg-card p-3 transition-all duration-200 hover:bg-accent active:cursor-grabbing ${
                        isDragging ? "opacity-50 scale-95" : ""
                      } ${isUpdating ? "animate-pulse" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {job.job_number}
                        </span>
                        <JobStatusBadge status={job.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.customers?.code ?? "N/A"}
                        {job.gmps ? ` - ${job.gmps.gmp_number}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Qty: {job.quantity}
                      </div>
                    </Link>
                  );
                })}
                {columnJobs.length === 0 && (
                  <p className={`py-4 text-center text-xs text-muted-foreground ${
                    isDropTarget ? "text-blue-500" : ""
                  }`}>
                    {isDropTarget ? "Drop here" : "No jobs"}
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
