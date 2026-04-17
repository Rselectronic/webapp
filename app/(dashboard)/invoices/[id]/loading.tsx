import { SkeletonTable } from "@/components/ui/skeleton-table";

export default function InvoiceDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <SkeletonTable columns={5} rows={6} />
      <div className="rounded-lg border bg-card p-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
