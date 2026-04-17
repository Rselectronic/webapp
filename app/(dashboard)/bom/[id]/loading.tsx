import { SkeletonTable } from "@/components/ui/skeleton-table";

export default function BomDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-56 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <SkeletonTable columns={8} rows={10} />
    </div>
  );
}
