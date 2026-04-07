import { SkeletonTable } from "@/components/ui/skeleton-table";

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
        <div className="flex gap-1">
          <div className="h-9 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <SkeletonTable columns={6} rows={8} />
    </div>
  );
}
