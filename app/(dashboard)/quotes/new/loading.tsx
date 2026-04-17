export default function NewQuoteLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            {i < 3 && <div className="h-px w-8 bg-muted" />}
          </div>
        ))}
      </div>
      {/* Form card */}
      <div className="rounded-lg border bg-card p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-4">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
