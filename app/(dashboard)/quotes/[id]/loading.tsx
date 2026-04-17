import { SkeletonKpiCards, SkeletonTable } from "@/components/ui/skeleton-table";

export default function QuoteDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-20 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <SkeletonKpiCards count={4} />
      <SkeletonTable columns={7} rows={8} />
    </div>
  );
}
