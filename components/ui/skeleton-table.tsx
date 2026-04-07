import { cn } from "@/lib/utils";

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  className?: string;
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-4 animate-pulse rounded bg-muted",
        className
      )}
    />
  );
}

export function SkeletonTable({
  columns = 5,
  rows = 6,
  className,
}: SkeletonTableProps) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* Header */}
      <div className="flex gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBar
            key={`h-${i}`}
            className={cn("h-3", i === 0 ? "w-24" : "flex-1")}
          />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={`r-${ri}`}
          className="flex gap-4 border-b px-4 py-3 last:border-0"
        >
          {Array.from({ length: columns }).map((_, ci) => (
            <SkeletonBar
              key={`r-${ri}-c-${ci}`}
              className={cn(
                "h-4",
                ci === 0 ? "w-28" : "flex-1",
                ri % 2 === 1 && "opacity-75"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKpiCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-3">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-4 w-4 rounded" />
          </div>
          <SkeletonBar className="h-7 w-16 mb-1" />
          <SkeletonBar className="h-3 w-32 opacity-60" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 6 }: { columns?: number }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {Array.from({ length: columns }).map((_, ci) => (
        <div key={ci} className="min-h-[300px] rounded-lg border bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <SkeletonBar className="h-3 w-20" />
            <SkeletonBar className="h-5 w-5 rounded-full" />
          </div>
          {Array.from({ length: ci < 3 ? 2 : 1 }).map((_, ri) => (
            <div key={ri} className="mb-2 rounded-md border p-3">
              <SkeletonBar className="h-3 w-24 mb-2" />
              <SkeletonBar className="h-3 w-16 opacity-60" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
