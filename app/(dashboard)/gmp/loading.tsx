import { SkeletonTable } from "@/components/ui/skeleton-table";

export default function GmpListLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonTable columns={8} rows={6} />
    </div>
  );
}
