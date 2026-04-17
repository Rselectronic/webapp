import { SkeletonKpiCards, SkeletonTable } from "@/components/ui/skeleton-table";

export default function ProductionLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonKpiCards count={4} />
      <SkeletonTable columns={6} rows={5} />
    </div>
  );
}
