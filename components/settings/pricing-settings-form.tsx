"use client";

import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import type { PricingSettings } from "@/lib/pricing/types";

interface Props {
  settings: PricingSettings;
}

interface FieldDef {
  key: keyof PricingSettings;
  label: string;
  suffix: string;
  step?: string;
}

export function PricingSettingsForm({ settings: initial }: Props) {
  const [settings, setSettings] = useState<PricingSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof PricingSettings, value: string) {
    const num = parseFloat(value);
    setSettings((prev) => ({ ...prev, [key]: isNaN(num) ? value : num }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings?key=pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
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

  // Compute NRE total for display
  const nreTotal =
    (Number(settings.nre_programming) || 0) +
    (Number(settings.nre_stencil) || 0) +
    (Number(settings.nre_setup) || 0) +
    (Number(settings.nre_pcb_fab) || 0) +
    (Number(settings.nre_misc) || 0);

  const markupFields: FieldDef[] = [
    { key: "component_markup_pct", label: "Component markup", suffix: "%" },
    { key: "pcb_markup_pct", label: "PCB markup", suffix: "%" },
  ];

  const placementFields: FieldDef[] = [
    { key: "smt_cost_per_placement", label: "SMT cost / placement", suffix: "CAD", step: "0.001" },
    { key: "th_cost_per_placement", label: "TH cost / placement", suffix: "CAD", step: "0.01" },
    { key: "mansmt_cost_per_placement", label: "Manual SMT cost / placement", suffix: "CAD", step: "0.01" },
  ];

  const labourFields: FieldDef[] = [
    { key: "labour_rate_per_hour", label: "Labour rate (general)", suffix: "CAD/hr" },
    { key: "smt_rate_per_hour", label: "SMT rate (machine time)", suffix: "CAD/hr" },
    { key: "setup_time_hours", label: "Default setup time", suffix: "hours", step: "0.25" },
    { key: "programming_time_hours", label: "Default programming time", suffix: "hours", step: "0.25" },
  ];

  const nreFields: FieldDef[] = [
    { key: "nre_programming", label: "Programming fees", suffix: "CAD" },
    { key: "nre_stencil", label: "Stencil fees", suffix: "CAD" },
    { key: "nre_setup", label: "Setup fees", suffix: "CAD" },
    { key: "nre_pcb_fab", label: "PCB fabrication NRE", suffix: "CAD" },
    { key: "nre_misc", label: "Misc NRE", suffix: "CAD" },
  ];

  const otherFields: FieldDef[] = [
    { key: "default_nre", label: "Default NRE total (legacy)", suffix: "CAD" },
    { key: "default_shipping", label: "Default shipping", suffix: "CAD" },
    { key: "quote_validity_days", label: "Quote validity", suffix: "days" },
  ];

  function renderFieldGroup(fields: FieldDef[]) {
    return fields.map(({ key, label, suffix, step }) => (
      <div key={key} className="flex items-center gap-4">
        <Label className="w-56 shrink-0 text-sm">{label}</Label>
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="number"
            step={step ?? "0.01"}
            value={String(settings[key] ?? "")}
            onChange={(e) => set(key, e.target.value)}
            className="max-w-[140px] font-mono"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{suffix}</span>
        </div>
      </div>
    ));
  }

  return (
    <div className="space-y-6">
      {/* Markup Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Markup Rates</CardTitle>
          <CardDescription>
            Percentage markups applied to component and PCB costs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(markupFields)}
        </CardContent>
      </Card>

      {/* Placement Costs */}
      <Card>
        <CardHeader>
          <CardTitle>Placement Costs</CardTitle>
          <CardDescription>
            Cost per placement by component type. SMT includes CP, CPEXP, 0402, 0201, and IP.
            TH is through-hole. Manual SMT is hand-soldered surface mount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(placementFields)}
        </CardContent>
      </Card>

      {/* Labour Rates & Time */}
      <Card>
        <CardHeader>
          <CardTitle>Labour Rates &amp; Time</CardTitle>
          <CardDescription>
            Hourly rates and default time estimates. From VBA TIME File V11:
            labour defaults to $130/hr and SMT defaults to $165/hr.
            Setup and programming time are per-job charges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(labourFields)}
        </CardContent>
      </Card>

      {/* NRE Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>NRE Breakdown</CardTitle>
          <CardDescription>
            Non-Recurring Engineering charges. These apply to first-time boards.
            Items already paid can be zeroed out per quote. From VBA: Programming (B21),
            Stencil (B22), PCB FAB (B23), Misc (B24).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(nreFields)}
          <Separator />
          <div className="flex items-center gap-4">
            <Label className="w-56 shrink-0 text-sm font-semibold">NRE Total (computed)</Label>
            <div className="flex flex-1 items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                ${nreTotal.toFixed(2)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">CAD</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Other Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Other Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(otherFields)}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save All Settings"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Settings saved.</p>}
      </div>
    </div>
  );
}
