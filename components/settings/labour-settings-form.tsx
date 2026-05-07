"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface LabourSettingsInput {
  monthly_overhead: number | null;
  production_staff_count: number | null;
  hours_per_day: number | null;
  days_per_month: number | null;
  utilization_pct: number | null;
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

type Field = {
  key: keyof LabourSettingsInput;
  label: string;
  suffix?: string;
  step?: string;
  help?: string;
};

const OVERHEAD_FIELDS: Field[] = [
  { key: "monthly_overhead", label: "Monthly overhead", suffix: "$", step: "100", help: "All-in: rent + salaries + utilities + insurance + depreciation + misc" },
  { key: "production_staff_count", label: "Production staff count", suffix: "people" },
  { key: "hours_per_day", label: "Hours per day", suffix: "hrs", step: "0.25" },
  { key: "days_per_month", label: "Working days per month", suffix: "days" },
  { key: "utilization_pct", label: "Utilization", suffix: "%", step: "1", help: "Realistic share of paid hours actually spent on production work" },
];

const LINE_FIELDS: Field[] = [
  { key: "conveyor_mm_per_sec", label: "Conveyor speed", suffix: "mm/sec", step: "0.1" },
  { key: "oven_length_mm", label: "Oven length", suffix: "mm", step: "1" },
  { key: "reflow_passes_default", label: "Default reflow passes", suffix: "passes", step: "1", help: "1 for top-only, 2 for double-sided" },
];

const CYCLE_FIELDS: Field[] = [
  { key: "cycle_cp_seconds", label: "CP / CPEXP", suffix: "sec/part", step: "0.01" },
  { key: "cycle_0402_seconds", label: "0402", suffix: "sec/part", step: "0.01" },
  { key: "cycle_0201_seconds", label: "0201", suffix: "sec/part", step: "0.01" },
  { key: "cycle_ip_seconds", label: "IP (IC/BGA)", suffix: "sec/part", step: "0.01" },
  { key: "cycle_mansmt_seconds", label: "MANSMT (hand-soldered)", suffix: "sec/part", step: "0.1" },
  { key: "cycle_th_base_seconds", label: "TH base time", suffix: "sec/part", step: "0.1" },
  { key: "cycle_th_per_pin_seconds", label: "TH per-pin time", suffix: "sec/pin", step: "0.1" },
  { key: "cycle_depanel_seconds", label: "Depanelisation", suffix: "sec/board", step: "1", help: "Only applied when boards_per_panel > 1." },
];

const SETUP_FIELDS: Field[] = [
  { key: "smt_line_setup_minutes", label: "SMT line setup", suffix: "min/job", step: "1" },
  { key: "feeder_setup_minutes_each", label: "Feeder setup", suffix: "min/unique MPN", step: "0.25" },
  { key: "first_article_minutes", label: "First-article inspection", suffix: "min", step: "1" },
];

const MANUAL_FIELDS: Field[] = [
  { key: "inspection_minutes_per_board", label: "Inspection", suffix: "min/board", step: "0.25" },
  { key: "touchup_minutes_per_board", label: "Touch-up", suffix: "min/board", step: "0.25" },
  { key: "packing_minutes_per_board", label: "Packing", suffix: "min/board", step: "0.25" },
];

interface Props {
  initial: LabourSettingsInput;
}

export function LabourSettingsForm({ initial }: Props) {
  const [values, setValues] = useState<LabourSettingsInput>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derived = useMemo(() => {
    const staff = Number(values.production_staff_count ?? 0);
    const hpd = Number(values.hours_per_day ?? 0);
    const dpm = Number(values.days_per_month ?? 0);
    const util = Number(values.utilization_pct ?? 0);
    const hours = staff * hpd * dpm * (util / 100);
    const overhead = Number(values.monthly_overhead ?? 0);
    const rate = hours > 0 ? overhead / hours : 0;
    const conv = Number(values.conveyor_mm_per_sec ?? 0);
    const oven = Number(values.oven_length_mm ?? 0);
    const ovenDwellSec = conv > 0 ? oven / conv : 0;
    const throughputBph = ovenDwellSec > 0 ? 3600 / ovenDwellSec : 0;
    return { hours, rate, ovenDwellSec, throughputBph };
  }, [values]);

  function set(key: keyof LabourSettingsInput, v: string) {
    setSaved(false);
    setValues((prev) => ({
      ...prev,
      [key]: v === "" ? null : Number(v),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/labour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Section title="Company Overhead" description="Single bundled monthly expense. Drives the burdened shop rate.">
          {OVERHEAD_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Section>

        <Section title="SMT Line Parameters" description="Physical line characteristics used for oven-throughput bottleneck calculations.">
          {LINE_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Section>

        <Section title="Cycle Times" description="Measured per-part machine or hand time. From TIME V11 / shop measurements.">
          {CYCLE_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Section>

        <Section title="Setup (per job)" description="One-time setup charged once per job, amortized across the run.">
          {SETUP_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Section>

        <Section title="Per-board Manual Operations" description="Manual time per board after SMT.">
          {MANUAL_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Section>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save (creates new version)"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Calculation</CardTitle>
            <CardDescription>Updates as you edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-gray-500">Available production hours</div>
              <div className="font-mono">
                {values.production_staff_count ?? 0} × {values.hours_per_day ?? 0} × {values.days_per_month ?? 0} × {values.utilization_pct ?? 0}%
              </div>
              <div className="font-semibold">{derived.hours.toFixed(0)} hrs/month</div>
            </div>
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
              <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Burdened rate
              </div>
              <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                ${derived.rate.toFixed(2)} / hr
              </div>
            </div>
            <div>
              <div className="text-gray-500">Oven dwell time per pass</div>
              <div className="font-semibold">{derived.ovenDwellSec.toFixed(1)} sec</div>
            </div>
            <div>
              <div className="text-gray-500">Max oven throughput</div>
              <div className="font-semibold">
                {derived.throughputBph.toFixed(1)} boards/hr per pass
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={field.key} className="text-xs">
        {field.label}
        {field.suffix ? <span className="text-gray-400"> ({field.suffix})</span> : null}
      </Label>
      <Input
        id={field.key}
        type="number"
        step={field.step ?? "any"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help ? <p className="text-[11px] text-gray-500">{field.help}</p> : null}
    </div>
  );
}
