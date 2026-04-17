import { SkeletonKpiCards, SkeletonTable } from "@/components/ui/skeleton-table";

export default function ProcurementDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <SkeletonKpiCards count={3} />
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonTable columns={8} rows={8} />
    </div>
  );
}
