import { SkeletonKpiCards, SkeletonTable } from "@/components/ui/skeleton-table";

export default function StatementLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-32 animate-pulse rounded bg-muted" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonKpiCards count={4} />
      <SkeletonTable columns={7} rows={6} />
    </div>
  );
}
