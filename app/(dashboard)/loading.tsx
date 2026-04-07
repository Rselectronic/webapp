import { SkeletonKpiCards } from "@/components/ui/skeleton-table";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonKpiCards count={4} />
      <SkeletonKpiCards count={4} />
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-6 py-3 last:border-0">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="flex-1">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
