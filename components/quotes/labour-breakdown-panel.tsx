"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PricingTier } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// LabourBreakdownPanel
//
// Verification-oriented view that walks through every step of the labour cost
// derivation for each quantity tier. Intended as the canonical answer to
// "where does this labour number come from?" — the numbers shown here should
// reconcile exactly with tier.labour.* values persisted by the engine.
//
// Some inputs (cycle times, oven params) aren't stored on the tier itself, so
// the panel takes them from the currently active labour_settings row. For
// already-saved quotes this means "current settings" context; for historical
// audit we would need to snapshot the labour_settings_id on each quote (TODO).
// ---------------------------------------------------------------------------

export interface LabourSettingsContext {
  monthly_overhead: number | null;
  production_staff_count: number | null;
  hours_per_day: number | null;
  days_per_month: number | null;
  utilization_pct: number | null;
  burdened_rate_per_hour: number | null;
  available_hours_per_month: number | null;
  conveyor_mm_per_sec: number | null;
  oven_length_mm: number | null;
  reflow_passes_default: number | null;
  cycle_cp_seconds: number | null;
  cycle_0402_seconds: number | null;
  cycle_0201_seconds: number | null;
  cycle_ip_seconds: number | null;
  cycle_mansmt_seconds: number | null;
  cycle_th_base_seconds: number | null;
  cycle_th_per_pin_seconds: number | null;
  cycle_depanel_seconds: number | null;
  smt_line_setup_minutes: number | null;
  feeder_setup_minutes_each: number | null;
  first_article_minutes: number | null;
  inspection_minutes_per_board: number | null;
  touchup_minutes_per_board: number | null;
  packing_minutes_per_board: number | null;
}

interface Props {
  tiers: PricingTier[];
  labour: LabourSettingsContext | null;
  isDouble: boolean;
  boardsPerPanel: number;
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function hrs(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(4)} hr`;
}
function sec(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(2)} s`;
}
function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

export function LabourBreakdownPanel({ tiers, labour, isDouble, boardsPerPanel }: Props) {
  const bpp = Math.max(1, Math.floor(boardsPerPanel || 1));
  const [openIdx, setOpenIdx] = useState(0);
  const tier = tiers[openIdx];

  const derived = useMemo(() => {
    if (!labour) return null;
    const S = Number(labour.production_staff_count ?? 0);
    const H = Number(labour.hours_per_day ?? 0);
    const D = Number(labour.days_per_month ?? 0);
    const U = Number(labour.utilization_pct ?? 0);
    const M = Number(labour.monthly_overhead ?? 0);
    const avail =
      labour.available_hours_per_month !== null
        ? Number(labour.available_hours_per_month)
        : S * H * D * (U / 100);
    const rate =
      labour.burdened_rate_per_hour !== null
        ? Number(labour.burdened_rate_per_hour)
        : avail > 0
          ? M / avail
          : 0;
    const passes =
      labour.reflow_passes_default !== null && labour.reflow_passes_default !== undefined
        ? Number(labour.reflow_passes_default)
        : isDouble
          ? 2
          : 1;
    const L = Number(labour.oven_length_mm ?? 0);
    const C = Number(labour.conveyor_mm_per_sec ?? 0);
    const dwellSec = L > 0 && C > 0 ? L / C : 0;
    return { avail, rate, passes, dwellSec, M, S, H, D, U, L, C };
  }, [labour, isDouble]);

  if (!tier || !labour || !derived) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Labour Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No labour settings configured yet. Fill in{" "}
            <a href="/settings/labour" className="underline">
              Settings → Labour
            </a>{" "}
            to see the full per-step derivation here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const lb = tier.labour;
  const Q = tier.board_qty;

  // Oven-bound SMT hours recomputed from the tier's stored smt_time_hours is
  // not possible (engine already applied max). We show the raw and oven floor
  // so Anas can see which one dominated.
  const panelsNeeded = Math.ceil(Q / bpp);
  const ovenHours =
    derived.dwellSec > 0 ? (derived.dwellSec * derived.passes * panelsNeeded) / 3600 : 0;
  const depanelSec = Number(labour.cycle_depanel_seconds ?? 0);
  const depanelHours = bpp > 1 && depanelSec > 0 ? (depanelSec * Q) / 3600 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Labour Cost Breakdown — Step-by-Step</CardTitle>
        <p className="text-sm text-gray-500">
          Every number below matches the values used by the pricing engine. Switch between quantity tiers to verify each run size.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tier selector */}
        <div className="flex flex-wrap gap-2">
          {tiers.map((t, i) => (
            <button
              key={t.board_qty}
              type="button"
              onClick={() => setOpenIdx(i)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                i === openIdx
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              }`}
            >
              {t.board_qty} boards
            </button>
          ))}
        </div>

        {/* STEP 1 — Burdened rate */}
        <Step title="Step 1 — Burdened Shop Rate" color="emerald">
          <Formula label="Available hours / month">
            {`${num(derived.S, 0)} staff × ${num(derived.H, 2)} hrs × ${num(derived.D, 0)} days × ${num(derived.U, 0)}% = ${num(derived.avail, 2)} hrs`}
          </Formula>
          <Formula label="Burdened rate">
            {`$${num(derived.M, 2)} / ${num(derived.avail, 2)} hrs = ${money(derived.rate)}/hr`}
          </Formula>
        </Step>

        {/* STEP 2 — SMT placement time */}
        <Step title="Step 2 — SMT Placement Time (per-category)">
          <Table
            rows={[
              ["CP / CPEXP", lb.cp_placement_sum, labour.cycle_cp_seconds, lb.cp_placement_sum * Number(labour.cycle_cp_seconds ?? 0)],
              ["IP", lb.ip_placement_sum, labour.cycle_ip_seconds, lb.ip_placement_sum * Number(labour.cycle_ip_seconds ?? 0)],
            ]}
            headers={["Category", "Parts/board", "Sec/part", "Sec/board"]}
          />
          <Formula label={`Raw SMT hours for tier (× ${Q} boards, pre-bottleneck)`}>
            {`Σ(parts × sec) × ${Q} / 3600`}
          </Formula>
        </Step>

        {/* STEP 2.5 — Panelisation */}
        <Step title="Step 2.5 — Panelisation" color="blue">
          <Formula label="Boards per panel">{`${bpp}`}</Formula>
          <Formula label="Panels needed for tier">
            {`ceil(${Q} / ${bpp}) = ${panelsNeeded} panels`}
          </Formula>
          <p className="text-xs text-gray-500">
            {bpp > 1
              ? `Each oven pass carries ${bpp} boards → oven time scales with panels, not boards. Depanelisation added in Step 6.5.`
              : "Single-board panel — oven runs once per board, no depanelisation."}
          </p>
        </Step>

        {/* STEP 3 — Oven bottleneck */}
        <Step title="Step 3 — Oven Bottleneck (TIME V11 fix)" color="amber">
          <Formula label="Oven dwell (per pass)">
            {`${num(derived.L, 0)} mm / ${num(derived.C, 2)} mm/sec = ${sec(derived.dwellSec)}`}
          </Formula>
          <Formula label="Oven-bound hours for tier">
            {`${sec(derived.dwellSec)} × ${derived.passes} passes × ${panelsNeeded} panels / 3600 = ${hrs(ovenHours)}`}
          </Formula>
          <Formula label="Effective SMT hours (post-bottleneck)">
            {`max(raw SMT, oven) = ${hrs(lb.smt_time_hours)}`}
          </Formula>
          <p className="text-xs text-gray-500">
            {lb.smt_time_hours >= ovenHours - 1e-6
              ? ovenHours > 0 && lb.smt_time_hours > ovenHours + 1e-6
                ? "Placement is slower than oven → placement dominates."
                : "Oven throughput equals or exceeds placement time."
              : "Oven is the bottleneck — this is the cycle-time correction the old flat model was missing."}
          </p>
        </Step>

        {/* STEP 4 — TH (per-pin) */}
        <Step title="Step 4 — Through-Hole Time (per-pin exact)">
          <Formula label="Inputs">
            {`TH parts/board=${lb.th_placement_sum} · base=${sec(labour.cycle_th_base_seconds)} · per-pin=${sec(labour.cycle_th_per_pin_seconds)}`}
          </Formula>
          <Formula label="TH hours for tier">{hrs(lb.th_time_hours)}</Formula>
          <p className="text-xs text-gray-500">
            Per-pin formula: Σ(parts × base + pins × per_pin) × boardQty / 3600. Falls back to CPH estimate when no per-pin time is set.
          </p>
        </Step>

        {/* STEP 5 — MANSMT */}
        <Step title="Step 5 — Manual SMT">
          <Formula label="Inputs">
            {`MANSMT parts/board=${lb.mansmt_count} · sec/part=${sec(labour.cycle_mansmt_seconds)}`}
          </Formula>
          <Formula label="MANSMT hours for tier">{hrs(lb.mansmt_time_hours)}</Formula>
        </Step>

        {/* STEP 6 — Per-board manual ops */}
        <Step title="Step 6 — Per-Board Manual Operations">
          <Table
            rows={[
              ["Inspection", labour.inspection_minutes_per_board, "min/board"],
              ["Touch-up", labour.touchup_minutes_per_board, "min/board"],
              ["Packing", labour.packing_minutes_per_board, "min/board"],
            ]}
            headers={["Operation", "Time", "Unit"]}
          />
          <Formula label="Total manual hours for tier">
            {`(${num(labour.inspection_minutes_per_board)} + ${num(labour.touchup_minutes_per_board)} + ${num(labour.packing_minutes_per_board)}) × ${Q} / 60`}
          </Formula>
        </Step>

        {/* STEP 6.5 — Depanelisation */}
        <Step title="Step 6.5 — Depanelisation" color="blue">
          {bpp > 1 ? (
            <>
              <Formula label="Inputs">
                {`${sec(labour.cycle_depanel_seconds)} per board × ${Q} boards`}
              </Formula>
              <Formula label="Depanelisation hours">{hrs(depanelHours)}</Formula>
              <p className="text-xs text-gray-500">
                Charged per individual board after SMT; only applies when boards_per_panel &gt; 1.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Skipped — single-board panel.</p>
          )}
        </Step>

        {/* STEP 7 — Assembly placement total */}
        <Step title="Step 7 — Assembly Placement Hours (SMT + TH + MANSMT + manual)">
          <Formula label="Sum">
            {`${hrs(lb.smt_time_hours)} + ${hrs(lb.th_time_hours)} + ${hrs(lb.mansmt_time_hours)} + per-board manual`}
          </Formula>
          <Formula label="Stored">{hrs(lb.assembly_time_hours - lb.setup_time_hours_computed)}</Formula>
        </Step>

        {/* STEP 8 — Feeder / line setup */}
        <Step title="Step 8 — Feeder / Line Setup (one-time)">
          <Formula label="Inputs">
            {`CP feeders=${lb.cp_feeder_count} · IP feeders=${lb.ip_feeder_count} · feeder min=${num(labour.feeder_setup_minutes_each)} · printer setup/side=${num(labour.smt_line_setup_minutes)}`}
          </Formula>
          <Formula label="Feeder+printer setup hours">
            {`(${lb.cp_feeder_count} × ${num(labour.feeder_setup_minutes_each)} + ${lb.ip_feeder_count} × ${num(labour.feeder_setup_minutes_each)} + 2 × ${num(labour.smt_line_setup_minutes)}) / 60 = ${hrs(lb.setup_time_hours_computed)}`}
          </Formula>
        </Step>

        {/* STEP 9 — First-article + setup + programming */}
        <Step title="Step 9 — First-Article, Setup & Programming">
          <Formula label="First-article">
            {`${num(labour.first_article_minutes)} min → ${hrs(Number(labour.first_article_minutes ?? 0) / 60)}`}
          </Formula>
          <Formula label="Setup cost (setup + first-article × rate)">{money(lb.setup_cost)}</Formula>
          <Formula label="Programming cost">{money(lb.programming_cost)}</Formula>
        </Step>

        {/* STEP 10 — Total assembly & labour */}
        <Step title="Step 10 — Total Assembly Hours & Costs" color="emerald">
          <Formula label="Total assembly hours">
            {`placement + feeder setup = ${hrs(lb.assembly_time_hours)}`}
          </Formula>
          <Formula label="Labour cost">
            {`${hrs(lb.assembly_time_hours)} × ${money(derived.rate)} = ${money(lb.labour_cost)}`}
          </Formula>
          <Formula label="Machine cost (SMT portion × rate)">
            {`${hrs(lb.smt_time_hours)} × ${money(derived.rate)} = ${money(lb.machine_cost)}`}
          </Formula>
          <Formula label="Assembly cost (labour + machine)">
            {money(tier.assembly_cost)}
          </Formula>
        </Step>

        {/* STEP 11 — Total labour */}
        <Step title="Step 11 — Total Labour on Quote Tier" color="blue">
          <Formula label="Assembly + setup + programming">
            {`${money(tier.assembly_cost)} + ${money(lb.setup_cost)} + ${money(lb.programming_cost)}`}
          </Formula>
          <Formula label="Total labour cost">{money(lb.total_labour_cost)}</Formula>
          <Formula label="Per-board labour">
            {`${money(lb.total_labour_cost)} / ${Q} = ${money(lb.total_labour_cost / Q)}`}
          </Formula>
        </Step>
      </CardContent>
    </Card>
  );
}

// --- presentation helpers ---

function Step({
  title,
  color = "gray",
  children,
}: {
  title: string;
  color?: "gray" | "emerald" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    gray: "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900",
    emerald: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
    amber: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
    blue: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
  };
  return (
    <div className={`rounded-md border p-3 ${colorMap[color]}`}>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Formula({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="min-w-[220px] text-xs text-gray-500">{label}</span>
      <span className="font-mono text-sm">{children}</span>
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500">
            {headers.map((h) => (
              <th key={h} className="py-1 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-200 dark:border-gray-800">
              {r.map((v, j) => (
                <td key={j} className="py-1 pr-4 font-mono">
                  {v === null || v === undefined || v === "" ? "—" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
