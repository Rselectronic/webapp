import { SkeletonKpiCards } from "@/components/ui/skeleton-table";

export default function JobDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <SkeletonKpiCards count={4} />
      {/* Status timeline */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
              {i < 5 && <div className="h-px w-12 bg-muted" />}
            </div>
          ))}
        </div>
      </div>
      {/* Details cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
