import { SkeletonTable } from "@/components/ui/skeleton-table";

export default function InventoryListLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
        <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      </div>
      <SkeletonTable columns={10} rows={6} />
    </div>
  );
}
