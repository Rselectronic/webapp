"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";

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
  { key: "created", label: "Created", statuses: ["created"] },
  {
    key: "procurement",
    label: "Procurement",
    statuses: ["procurement", "parts_ordered", "parts_received"],
  },
  {
    key: "production",
    label: "Production",
    statuses: ["production", "inspection"],
  },
  { key: "shipping", label: "Shipping", statuses: ["shipping"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "invoiced", label: "Invoiced", statuses: ["invoiced"] },
] as const;

export function JobKanban({ jobs }: JobKanbanProps) {
  const grouped = new Map<string, KanbanJob[]>();

  for (const col of COLUMNS) {
    grouped.set(
      col.key,
      jobs.filter((j) =>
        (col.statuses as readonly string[]).includes(j.status)
      )
    );
  }

  return (
    <div className="grid grid-cols-6 gap-3">
      {COLUMNS.map((col) => {
        const columnJobs = grouped.get(col.key) ?? [];
        return (
          <Card key={col.key} className="min-h-[300px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                {col.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {columnJobs.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-2">
              {columnJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent"
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
              ))}
              {columnJobs.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No jobs
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
