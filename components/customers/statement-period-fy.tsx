"use client";

// ----------------------------------------------------------------------------
// StatementPeriodFY
//
// FY-aware period selector for the customer account statement page. Mirrors
// the toolbar on Reports → Revenue: Period (Month/Quarter/Semi/Annual),
// FY mode (Calendar / Tax / Financial), Year, and a bucket dropdown that
// lists the periods within the selected FY+granularity.
//
// Replaces the prior named-preset dropdown (This month / Last month / etc.).
// All RS revenue reporting now uses the same FY model — the statement
// follows suit so periods line up with what the operator sees on the
// reports page.
//
// Each control change navigates immediately to ?from=...&to=... so the
// server page re-renders with the new period applied. URL params are the
// inclusive [from, to] dates of the selected bucket.
// ----------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fyBucketRanges,
  currentFYYear,
  PERIOD_LABELS,
  type FYMode,
  type Period,
} from "@/lib/reports/revenue";

const PERIODS: Period[] = ["month", "quarter", "semi", "annual"];
const MODES: FYMode[] = ["calendar", "tax", "financial"];

// Subtract 1 day from a YYYY-MM-DD string. fyBucketRanges returns end as
// EXCLUSIVE (next bucket's start), but the URL/page treats `to` as
// INCLUSIVE — translate at the boundary.
function isoMinusOneDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

interface Props {
  customerId: string;
  /** Current `from` query param (YYYY-MM-DD) */
  from: string | null;
  /** Current `to` query param (YYYY-MM-DD) */
  to: string | null;
  /** Initial period granularity — controls which bucket dropdown options
   *  appear on first render. The server seeds this from the URL params,
   *  but if it can't infer one it just defaults to "month". */
  initialPeriod?: Period;
  /** Initial FY mode — see initialPeriod. */
  initialMode?: FYMode;
  /** Initial FY year — see initialPeriod. */
  initialYear?: number;
}

export function StatementPeriodFY({
  customerId,
  from,
  to,
  initialPeriod = "month",
  initialMode = "tax",
  initialYear,
}: Props) {
  const router = useRouter();

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [mode, setMode] = useState<FYMode>(initialMode);
  const [year, setYear] = useState<number>(
    initialYear ?? currentFYYear(initialMode)
  );

  // Year dropdown options — current FY + 5 prior years. Static rather than
  // derived from invoices (the reports page does the latter, but for the
  // statement it would mean an extra query for what's almost always the
  // same window of years).
  const yearOptions = useMemo(() => {
    const cur = currentFYYear(mode);
    const out: number[] = [];
    for (let i = 0; i <= 5; i++) out.push(cur - i);
    if (year != null && !out.includes(year)) out.push(year);
    return out.sort((a, b) => b - a);
  }, [mode, year]);

  // Bucket list for the (mode, year, period) tuple. When period="annual"
  // there's a single bucket spanning the whole FY.
  const buckets = useMemo(
    () => fyBucketRanges(mode, year, period),
    [mode, year, period]
  );

  // Find which bucket the URL params are inside. Used to seed the bucket
  // dropdown selection. We match by the URL's `from` falling inside a
  // bucket's [start, end) — that handles both exact range matches and the
  // "user typed a partial range" case (where `to` might not be the bucket
  // end).
  const activeBucketIdx = useMemo(() => {
    if (!from) return 0;
    const idx = buckets.findIndex(
      (b) => from >= b.start && from < b.end
    );
    return idx >= 0 ? idx : 0;
  }, [buckets, from]);

  const [selectedBucketIdx, setSelectedBucketIdx] = useState<number>(
    activeBucketIdx
  );
  useEffect(() => {
    setSelectedBucketIdx(activeBucketIdx);
  }, [activeBucketIdx]);

  // Pending changes are local-only — Apply does the actual navigation.
  // Each control change updates local state and recomputes the bucket
  // index against the new (mode, year, period) tuple so the dropdown
  // always shows a sensible default, but no router push happens until
  // the operator clicks Apply.

  function onPeriodChange(p: Period) {
    setPeriod(p);
    const next = fyBucketRanges(mode, year, p);
    if (next.length === 0) return;
    let idx = 0;
    if (from) {
      const found = next.findIndex(
        (b) => from >= b.start && from < b.end
      );
      if (found >= 0) idx = found;
    }
    setSelectedBucketIdx(idx);
  }

  function onModeChange(m: FYMode) {
    setMode(m);
    const next = fyBucketRanges(m, year, period);
    if (next.length === 0) return;
    let idx = 0;
    if (from) {
      const found = next.findIndex(
        (b) => from >= b.start && from < b.end
      );
      if (found >= 0) idx = found;
    }
    setSelectedBucketIdx(idx);
  }

  function onYearChange(y: number) {
    setYear(y);
    const next = fyBucketRanges(mode, y, period);
    if (next.length === 0) return;
    // For the current FY default to the bucket containing today; for past
    // FYs default to the last bucket (most recent period in that FY).
    const isCurrent = y === currentFYYear(mode);
    let idx = 0;
    if (isCurrent) {
      const today = new Date().toISOString().slice(0, 10);
      const found = next.findIndex(
        (b) => today >= b.start && today < b.end
      );
      if (found >= 0) idx = found;
      else idx = next.length - 1;
    } else {
      idx = next.length - 1;
    }
    setSelectedBucketIdx(idx);
  }

  function onBucketChange(idx: number) {
    setSelectedBucketIdx(idx);
  }

  // Apply pushes a [from, to] navigation. `to` is the bucket end MINUS one
  // day so the URL contract stays inclusive (existing queries use `lte`).
  function applyChanges() {
    const b = buckets[selectedBucketIdx];
    if (!b) return;
    const params = new URLSearchParams({
      from: b.start,
      to: isoMinusOneDay(b.end),
    });
    router.push(`/customers/${customerId}/statement?${params.toString()}`);
  }

  // Detect whether the local selection differs from what the URL is
  // showing. Apply is disabled while they match so a no-op click never
  // fires a redundant navigation.
  const pendingTo = buckets[selectedBucketIdx]
    ? isoMinusOneDay(buckets[selectedBucketIdx].end)
    : null;
  const pendingFrom = buckets[selectedBucketIdx]?.start ?? null;
  const hasPendingChanges =
    pendingFrom != null &&
    pendingTo != null &&
    (pendingFrom !== from || pendingTo !== to);

  const showBucketDropdown = period !== "annual" && buckets.length > 1;
  const bucketLabel =
    period === "month"
      ? "Month"
      : period === "quarter"
        ? "Quarter"
        : period === "semi"
          ? "Half"
          : "FY";

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {/* Period (granularity) */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          Period:
        </span>
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={p === period ? "default" : "outline"}
            onClick={() => onPeriodChange(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>

      {/* FY mode */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          FY:
        </span>
        {MODES.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={m === mode ? "default" : "outline"}
            onClick={() => onModeChange(m)}
            title={
              m === "calendar"
                ? "Calendar (Jan–Dec)"
                : m === "tax"
                  ? "Tax FY (Nov–Oct)"
                  : "Financial FY (Oct–Sep)"
            }
          >
            {m === "calendar" ? "Calendar" : m === "tax" ? "Tax" : "Financial"}
          </Button>
        ))}
      </div>

      {/* Year */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          Year:
        </span>
        <Select
          value={String(year)}
          onValueChange={(v) => onYearChange(Number(v))}
        >
          <SelectTrigger size="sm" className="min-w-[5rem]">
            <SelectValue>{(v: string) => v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bucket — hidden when period=annual (the FY year already names
          the only available range). */}
      {showBucketDropdown && (
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
            {bucketLabel}:
          </span>
          <Select
            value={String(selectedBucketIdx)}
            onValueChange={(v) => onBucketChange(Number(v))}
          >
            <SelectTrigger size="sm" className="min-w-[14rem]">
              <SelectValue>
                {(v: string) => buckets[Number(v)]?.label ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {buckets.map((b, i) => (
                <SelectItem key={b.start} value={String(i)}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Apply — only enabled when the local selection differs from the
          URL. Stops the page from re-querying on every control toggle and
          lets the operator pick (period, mode, year, bucket) before
          committing. */}
      <Button
        size="sm"
        onClick={applyChanges}
        disabled={!hasPendingChanges}
      >
        Apply
      </Button>
    </div>
  );
}
