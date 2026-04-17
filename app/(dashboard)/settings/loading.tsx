export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-40 animate-pulse rounded bg-muted opacity-60" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
