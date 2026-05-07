"use client";

// ----------------------------------------------------------------------------
// RevenueSection (client)
//
// Buckets are recomputed in-memory from the invoices the server already
// loaded — toggling period/FY mode/year never round-trips the server, so
// changes are instant.
//
// Accrual basis: bucket assignment is by issued_date. Cancelled invoices are
// excluded. GST/QST columns are remittance amounts per period.
// ----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Minus,
  Table as TableIcon,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RevenueControls } from "@/components/reports/revenue-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format";
import {
  bucketRevenue,
  currentFYYear,
  FY_LABELS,
  CURRENCY_VIEW_LABELS,
  type FYMode,
  type Period,
  type CurrencyView,
  type RevenueInvoice,
} from "@/lib/reports/revenue";

interface Props {
  invoices: RevenueInvoice[];
  initialPeriod?: Period;
  initialMode?: FYMode;
  initialYear?: number;
}

const CURRENCY_VIEWS: CurrencyView[] = ["cad_equiv", "cad_only", "usd_only"];

export function RevenueSection({
  invoices,
  initialPeriod = "month",
  initialMode = "tax",
  initialYear,
}: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [mode, setMode] = useState<FYMode>(initialMode);
  const [year, setYear] = useState<number>(
    initialYear ?? currentFYYear(initialMode)
  );
  // "" = all customers
  const [customerId, setCustomerId] = useState<string>("");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("cad_equiv");
  // table = the existing label/value grid;
  // chart = single-year SVG bar chart;
  // yoy   = grouped-bars chart comparing the last N FYs (default 3) at
  //         the same period granularity. All three consume the same
  //         filter/currency/period state; only the rendering differs.
  const [view, setView] = useState<"table" | "chart" | "yoy">("table");
  const [yoyYearCount, setYoyYearCount] = useState(3);

  // Customer dropdown options — only customers that actually have at least
  // one non-cancelled invoice show up here, sorted by code.
  const customerOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; code: string | null; company: string | null }
    >();
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      if (!inv.customer_id) continue;
      if (!map.has(inv.customer_id)) {
        map.set(inv.customer_id, {
          id: inv.customer_id,
          code: inv.customer_code,
          company: inv.customer_company,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "")
    );
  }, [invoices]);

  // Filter once at the top so year-options + buckets agree on what data is
  // in scope.
  const scopedInvoices = useMemo(
    () =>
      customerId
        ? invoices.filter((i) => i.customer_id === customerId)
        : invoices,
    [invoices, customerId]
  );

  // Year dropdown options derived from invoices ± current FY.
  const yearOptions = useMemo(() => {
    const seen = new Set<number>();
    for (const inv of scopedInvoices) {
      if (!inv.issued_date) continue;
      const [y, m] = inv.issued_date.split("-").map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
      let fy = y;
      if (mode === "tax") fy = m >= 11 ? y + 1 : y;
      else if (mode === "financial") fy = m >= 10 ? y + 1 : y;
      seen.add(fy);
    }
    const cur = currentFYYear(mode);
    seen.add(cur);
    seen.add(cur - 1);
    return Array.from(seen).sort((a, b) => b - a);
  }, [scopedInvoices, mode]);

  // When the user switches FY mode, snap the year to the new mode's current
  // FY so they aren't stuck on a year that no longer aligns. Only does so if
  // the previously-selected year wouldn't appear in the new option list.
  function handleModeChange(next: FYMode) {
    // Just swap the FY mode — don't snap the year back to "current FY".
    // Year integers are valid across all three modes (the difference is
    // only where the FY's start/end month falls), so the user's selected
    // year still makes sense under the new mode and forcing a reset
    // throws away whatever year they were inspecting.
    setMode(next);
  }

  // When a single customer is selected and they bill USD, default the view
  // to USD so the totals match what they see on their invoices.
  useMemo(() => {
    if (!customerId) return;
    const sample = scopedInvoices.find((i) => i.currency);
    if (sample?.currency === "USD" && currencyView === "cad_equiv") {
      setCurrencyView("usd_only");
    }
    // Intentionally one-shot when customerId changes — user can re-toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const rows = useMemo(() => {
    const buckets = bucketRevenue(scopedInvoices, {
      mode,
      fyYear: year,
      period,
      currencyView,
    });
    return buckets.map((b) => ({
      ...b,
      subtotal:
        Math.round((b.invoiced - b.gst - b.qst - b.hst) * 100) / 100,
    }));
  }, [scopedInvoices, mode, year, period, currencyView]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, b) => ({
          invoiced: acc.invoiced + b.invoiced,
          gst: acc.gst + b.gst,
          qst: acc.qst + b.qst,
          hst: acc.hst + b.hst,
          subtotal: acc.subtotal + b.subtotal,
          invoiceCount: acc.invoiceCount + b.invoiceCount,
        }),
        { invoiced: 0, gst: 0, qst: 0, hst: 0, subtotal: 0, invoiceCount: 0 }
      ),
    [rows]
  );

  // YoY data — computed only when YoY view is active. We bucket each FY
  // separately at the same period/mode/currency, then align them by their
  // bucket position so "Period 1" of every year sits at the same X slot.
  // Returns nothing in non-YoY views to avoid recomputing on every toggle.
  const yoyData = useMemo(() => {
    if (view !== "yoy") return null;
    const years: number[] = [];
    for (let i = yoyYearCount - 1; i >= 0; i--) {
      years.push(year - i);
    }
    const perYear = years.map((y) => ({
      year: y,
      buckets: bucketRevenue(scopedInvoices, {
        mode,
        fyYear: y,
        period,
        currencyView,
      }),
    }));
    // FY totals + growth % vs prior year (simple ((curr - prev) / prev) × 100;
    // null when prev is zero so we don't show "Infinity %").
    const summary = perYear.map((py, idx) => {
      const total = py.buckets.reduce((s, b) => s + b.invoiced, 0);
      const prev = idx > 0 ? perYear[idx - 1] : null;
      const prevTotal = prev
        ? prev.buckets.reduce((s, b) => s + b.invoiced, 0)
        : 0;
      const growthPct =
        prev == null
          ? null
          : prevTotal === 0
            ? null
            : ((total - prevTotal) / prevTotal) * 100;
      return {
        year: py.year,
        total: Math.round(total * 100) / 100,
        growthPct: growthPct == null ? null : Math.round(growthPct * 10) / 10,
      };
    });
    return { perYear, summary };
  }, [view, yoyYearCount, year, mode, period, currencyView, scopedInvoices]);

  return (
    <Card id="revenue">
      <CardHeader>
        <CardTitle className="text-base">
          Revenue (Accrual basis — by invoice issue date)
        </CardTitle>
        <p className="mt-1 text-xs text-gray-500">
          {FY_LABELS[mode]} · FY {year} · {CURRENCY_VIEW_LABELS[currencyView]}.
          Cancelled invoices are excluded. Tax columns are remittance amounts
          for each period — use the CAD-equivalent view when filing.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RevenueControls
          activePeriod={period}
          activeMode={mode}
          activeYear={year}
          yearOptions={yearOptions}
          activeCustomerId={customerId}
          customerOptions={customerOptions}
          onPeriodChange={setPeriod}
          onModeChange={handleModeChange}
          onYearChange={setYear}
          onCustomerChange={setCustomerId}
        />

        {/* Currency view + display toggle row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
              Currency:
            </span>
            {CURRENCY_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCurrencyView(v)}
                className={`rounded-md border px-3 py-1 text-xs ${
                  v === currencyView
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                }`}
                title={CURRENCY_VIEW_LABELS[v]}
              >
                {v === "cad_equiv"
                  ? "CAD-equivalent"
                  : v === "cad_only"
                  ? "CAD only"
                  : "USD only"}
              </button>
            ))}
          </div>

          {/* View toggle — same data, different presentation. */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs ${
                view === "table"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setView("chart")}
              className={`flex items-center gap-1.5 border-l border-gray-300 px-3 py-1 text-xs dark:border-gray-700 ${
                view === "chart"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Chart
            </button>
            <button
              type="button"
              onClick={() => setView("yoy")}
              className={`flex items-center gap-1.5 border-l border-gray-300 px-3 py-1 text-xs dark:border-gray-700 ${
                view === "yoy"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300"
              }`}
              title="Compare this FY against prior years"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              YoY
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No revenue periods to display.</p>
        ) : view === "yoy" && yoyData ? (
          <RevenueYoYView
            data={yoyData}
            currencyView={currencyView}
            yearCount={yoyYearCount}
            onYearCountChange={setYoyYearCount}
          />
        ) : view === "chart" ? (
          <RevenueBarChart
            rows={rows}
            currencyView={currencyView}
            totalInvoiced={totals.invoiced}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right"># Invoices</TableHead>
                <TableHead className="text-right">Subtotal (ex-tax)</TableHead>
                <TableHead className="text-right">GST (5%)</TableHead>
                <TableHead className="text-right">QST (9.975%)</TableHead>
                <TableHead className="text-right">HST</TableHead>
                <TableHead className="text-right">Total Invoiced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.label}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell className="text-right font-mono">
                    {b.invoiceCount}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(b.subtotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(b.gst)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(b.qst)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(b.hst)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(b.invoiced)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-gray-50 font-semibold dark:bg-gray-900/40">
                <TableCell>FY Total</TableCell>
                <TableCell className="text-right font-mono">
                  {totals.invoiceCount}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(Math.round(totals.subtotal * 100) / 100)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(Math.round(totals.gst * 100) / 100)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(Math.round(totals.qst * 100) / 100)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(Math.round(totals.hst * 100) / 100)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(Math.round(totals.invoiced * 100) / 100)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// RevenueBarChart — pure-SVG bar chart for the Revenue section's chart view.
//
// Renders one bar per bucket (month / quarter / semi / annual depending on
// the period setting). Bar heights are proportional to each bucket's
// `invoiced` amount. Y-axis ticks are computed from the rounded max so
// the scale ends on a clean number. Hovering a bar shows a tooltip with
// the period label, bucket count, and formatted total.
//
// Pure SVG — no chart library dependency. The codebase has none yet and
// this is the only chart on the reports page; rolling our own keeps the
// bundle lean.
// ---------------------------------------------------------------------------
interface RevenueBarChartRow {
  label: string;
  invoiced: number;
  invoiceCount: number;
}

function RevenueBarChart({
  rows,
  currencyView,
  totalInvoiced,
}: {
  rows: RevenueBarChartRow[];
  currencyView: CurrencyView;
  totalInvoiced: number;
}) {
  // Round the max up to a "nice" number so axis ticks land on round
  // values (e.g. max=187k → axis stops at 200k).
  const rawMax = Math.max(0, ...rows.map((r) => r.invoiced));
  const niceMax = niceCeiling(rawMax);

  // SVG dimensions — sized to the typical render width so the viewBox
  // → CSS-pixel scale factor stays close to 1. Earlier this was 900×320
  // and the surrounding `w-full` upscaled the canvas ~1.6×, which dragged
  // every text element to ~18px even though the class said 11px.
  const W = 1400;
  const H = 420;
  const padL = 72;
  const padR = 24;
  const padT = 20;
  const padB = 72;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const barGap = 0.25; // 25% of slot is gap between bars
  const slotW = rows.length > 0 ? innerW / rows.length : 0;
  const barW = slotW * (1 - barGap);

  const yToPx = (v: number) =>
    niceMax > 0 ? padT + innerH - (v / niceMax) * innerH : padT + innerH;

  // 5 horizontal grid lines including 0 and niceMax.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  const currencyTag =
    currencyView === "cad_equiv"
      ? "CAD-equivalent"
      : currencyView === "cad_only"
        ? "CAD"
        : "USD";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <div className="text-gray-500">
          Bars are total invoiced per period · {currencyTag}
        </div>
        <div className="text-gray-700 dark:text-gray-300">
          FY Total:{" "}
          <span className="font-mono font-semibold">
            {formatCurrency(Math.round(totalInvoiced * 100) / 100)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[640px] text-[11px]"
          role="img"
          aria-label="Revenue per period"
        >
          {/* Y-axis grid lines + labels */}
          {ticks.map((t, i) => {
            const y = yToPx(t);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-gray-800"
                  strokeDasharray={t === 0 ? undefined : "2,3"}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-gray-500 dark:fill-gray-400"
                >
                  {formatAxisCurrency(t)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {rows.map((r, i) => {
            const x = padL + i * slotW + (slotW - barW) / 2;
            const yTop = yToPx(r.invoiced);
            const h = padT + innerH - yTop;
            return (
              <g key={r.label}>
                <title>
                  {r.label}: {formatCurrency(r.invoiced)} · {r.invoiceCount}{" "}
                  invoice{r.invoiceCount === 1 ? "" : "s"}
                </title>
                <rect
                  x={x}
                  y={yTop}
                  width={barW}
                  height={h}
                  rx={3}
                  className="fill-blue-500 transition-colors hover:fill-blue-600 dark:fill-blue-600 dark:hover:fill-blue-500"
                />
                {/* Value label on top of bar — shown only when bar is tall
                    enough to host it without overlapping the next tick. */}
                {h > 24 && r.invoiced > 0 ? (
                  <text
                    x={x + barW / 2}
                    y={yTop - 4}
                    textAnchor="middle"
                    className="fill-gray-700 dark:fill-gray-200"
                  >
                    {formatAxisCurrency(r.invoiced)}
                  </text>
                ) : null}
                {/* X-axis label. Rotate -35° only when the per-bar slot
                    is too narrow to host a horizontal label without
                    colliding with neighbours. With the wider viewBox
                    (slotW ~100px+ for 12 bars), horizontal renders fine
                    for typical period labels. */}
                {(() => {
                  const cx = x + barW / 2;
                  const ly = H - padB + 16;
                  const rotate = slotW < 80;
                  return (
                    <text
                      x={cx}
                      y={ly}
                      textAnchor={rotate ? "end" : "middle"}
                      transform={
                        rotate ? `rotate(-35 ${cx} ${ly})` : undefined
                      }
                      className="fill-gray-600 dark:fill-gray-400"
                    >
                      {r.label}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Round up to the next "nice" number for axis ceilings.
 *  e.g. 187340 → 200000, 18.7 → 20, 0 → 0. */
function niceCeiling(n: number): number {
  if (n <= 0) return 0;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const m = n / base;
  let nice: number;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 2.5) nice = 2.5;
  else if (m <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

/** Compact axis number — "$200k" / "$1.5M" rather than full "$200,000.00". */
function formatAxisCurrency(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// RevenueYoYView — year-over-year comparison.
//
// Shows the last N FYs (default 3) at the same period granularity as the
// current settings. Includes a per-FY summary card strip with growth %
// vs prior year, and a grouped-bar chart where each period slot holds N
// thin bars colour-shaded oldest → newest.
//
// Period labels strip the year — the chart's X-axis shows generic
// labels like "Nov / Dec / Jan / …" or "Q1 / Q2 / Q3 / Q4" so the same
// position across years lines up. Hover tooltips include the full
// year + amount.
// ---------------------------------------------------------------------------

interface YoYBucketValue {
  invoiced: number;
  invoiceCount: number;
}
interface YoYBucketGroup {
  shortLabel: string;
  values: { year: number; data: YoYBucketValue }[];
}

function RevenueYoYView({
  data,
  currencyView,
  yearCount,
  onYearCountChange,
}: {
  data: {
    perYear: { year: number; buckets: RevenueBarChartRow[] | RevenueBucketRow[] }[];
    summary: { year: number; total: number; growthPct: number | null }[];
  };
  currencyView: CurrencyView;
  yearCount: number;
  onYearCountChange: (n: number) => void;
}) {
  // Align buckets across years by their position. Bucket label is shared
  // across years (e.g. all years have a "Q1" or a "Jan 2024/Jan 2025/…"
  // depending on how the helper labelled them). We strip trailing year
  // tokens from the label so the same calendar slot reads the same.
  const maxBucketCount = Math.max(
    0,
    ...data.perYear.map((py) => py.buckets.length)
  );

  const groups: YoYBucketGroup[] = [];
  for (let i = 0; i < maxBucketCount; i++) {
    const labelSource = data.perYear[0]?.buckets[i]?.label ?? `#${i + 1}`;
    groups.push({
      shortLabel: stripYearFromLabel(labelSource),
      values: data.perYear.map((py) => ({
        year: py.year,
        data: {
          invoiced: py.buckets[i]?.invoiced ?? 0,
          invoiceCount: py.buckets[i]?.invoiceCount ?? 0,
        },
      })),
    });
  }

  const niceMax = niceCeiling(
    Math.max(
      0,
      ...groups.flatMap((g) => g.values.map((v) => v.data.invoiced))
    )
  );

  // Same dimensions as the single-year chart so text scales correctly.
  const W = 1400;
  const H = 420;
  const padL = 72;
  const padR = 24;
  const padT = 20;
  const padB = 72;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const slotGap = 0.2; // 20% of slot is gap between groups
  const slotW = groups.length > 0 ? innerW / groups.length : 0;
  const groupW = slotW * (1 - slotGap);
  const yearsCount = data.perYear.length;
  const barInGroupGap = 0.15;
  const barW = (groupW * (1 - barInGroupGap)) / Math.max(yearsCount, 1);

  const yToPx = (v: number) =>
    niceMax > 0 ? padT + innerH - (v / niceMax) * innerH : padT + innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  // Color shades — oldest year lightest, newest darkest.
  const yearColors = (idx: number, total: number): string => {
    if (total <= 1) return "#3b82f6";
    // Map idx 0 → light, idx total-1 → dark.
    const palette = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
    const pick = Math.round((idx / (total - 1)) * (palette.length - 1));
    return palette[pick] ?? palette[palette.length - 1];
  };

  const currencyTag =
    currencyView === "cad_equiv"
      ? "CAD-equivalent"
      : currencyView === "cad_only"
        ? "CAD"
        : "USD";

  return (
    <div className="space-y-4">
      {/* Per-FY summary cards — total + growth pct */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>Compare:</span>
          <Select
            value={String(yearCount)}
            onValueChange={(v) => onYearCountChange(Number(v))}
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue>{(v: string) => `Last ${v} FYs`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Last {n} FYs
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.summary.map((s, idx) => {
          const palette = yearColors(idx, data.summary.length);
          return (
            <div
              key={s.year}
              className="flex-1 min-w-[160px] rounded-md border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: palette }}
                  aria-hidden
                />
                FY {s.year}
              </div>
              <div className="mt-1 font-mono text-base font-semibold">
                {formatCurrency(s.total)}
              </div>
              <GrowthPill pct={s.growthPct} />
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-500">
        Bars per period · {currencyTag} · oldest FY (lightest) → newest FY
        (darkest)
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[640px] text-[11px]"
          role="img"
          aria-label="Year-over-year revenue comparison"
        >
          {/* Y-axis grid + labels */}
          {ticks.map((t, i) => {
            const y = yToPx(t);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-gray-800"
                  strokeDasharray={t === 0 ? undefined : "2,3"}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-gray-500 dark:fill-gray-400"
                >
                  {formatAxisCurrency(t)}
                </text>
              </g>
            );
          })}

          {/* Grouped bars */}
          {groups.map((g, i) => {
            const groupX = padL + i * slotW + (slotW - groupW) / 2;
            return (
              <g key={i}>
                {g.values.map((v, j) => {
                  const x =
                    groupX +
                    j * (groupW / yearsCount) +
                    ((groupW / yearsCount) - barW) / 2;
                  const yTop = yToPx(v.data.invoiced);
                  const h = padT + innerH - yTop;
                  return (
                    <g key={v.year}>
                      <title>
                        FY {v.year} · {g.shortLabel}:{" "}
                        {formatCurrency(v.data.invoiced)} ·{" "}
                        {v.data.invoiceCount} invoice
                        {v.data.invoiceCount === 1 ? "" : "s"}
                      </title>
                      <rect
                        x={x}
                        y={yTop}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={yearColors(j, yearsCount)}
                      />
                    </g>
                  );
                })}
                {(() => {
                  const cx = groupX + groupW / 2;
                  const ly = H - padB + 16;
                  // Rotate only when the period slot is too narrow to
                  // host the label horizontally. With 12 month groups
                  // and 3-year clusters per group, slotW is still ~85+
                  // for typical short labels ("Jan", "Q1") so most YoY
                  // configurations render flat.
                  const rotate = slotW < 60;
                  return (
                    <text
                      x={cx}
                      y={ly}
                      textAnchor={rotate ? "end" : "middle"}
                      transform={
                        rotate ? `rotate(-35 ${cx} ${ly})` : undefined
                      }
                      className="fill-gray-600 dark:fill-gray-400"
                    >
                      {g.shortLabel}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {data.summary.map((s, idx) => (
          <div key={s.year} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: yearColors(idx, data.summary.length) }}
              aria-hidden
            />
            FY {s.year}
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthPill({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400">
        <Minus className="h-3 w-3" />
        baseline
      </p>
    );
  }
  const positive = pct > 0;
  const negative = pct < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  return (
    <p
      className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
        positive
          ? "text-green-600 dark:text-green-400"
          : negative
            ? "text-red-600 dark:text-red-400"
            : "text-gray-500"
      }`}
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}% vs prior FY
    </p>
  );
}

/** Strip trailing year tokens from a bucket label so the same calendar
 *  slot reads identically across years.
 *    "Jan 2024" → "Jan"
 *    "Q1 (Jan–Mar 2024)" → "Q1"
 *    "H1 (Nov–Apr 2024)" → "H1"
 *    "Nov 2024 – Oct 2025" → "Nov – Oct"
 */
function stripYearFromLabel(label: string): string {
  // Drop the parenthesized year-bearing detail entirely if present.
  const cleaned = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // Strip trailing 4-digit years from anything that's left.
  return cleaned.replace(/\b\d{4}\b/g, "").replace(/\s{2,}/g, " ").trim() || label;
}

// Shared row shape used by both single-year and YoY chart helpers. The
// table view uses a richer shape with subtotals/taxes; only `label`,
// `invoiced`, and `invoiceCount` are needed for chart rendering.
type RevenueBucketRow = {
  label: string;
  invoiced: number;
  invoiceCount: number;
};
