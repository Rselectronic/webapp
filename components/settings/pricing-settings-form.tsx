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

  const markupFields: FieldDef[] = [
    { key: "component_markup_pct", label: "Component markup", suffix: "%" },
    { key: "pcb_markup_pct", label: "PCB markup", suffix: "%" },
  ];

  const cphFields: FieldDef[] = [
    { key: "cp_cph", label: "CP/CPEXP (standard SMT)", suffix: "CPH", step: "100" },
    { key: "small_cph", label: "0402 (small passives)", suffix: "CPH", step: "100" },
    { key: "ultra_small_cph", label: "0201 (ultra-tiny)", suffix: "CPH", step: "100" },
    { key: "ip_cph", label: "IP (large ICs)", suffix: "CPH", step: "100" },
    { key: "th_cph", label: "TH (through-hole)", suffix: "CPH", step: "10" },
    { key: "mansmt_cph", label: "MANSMT (hand solder)", suffix: "CPH", step: "10" },
  ];

  const setupParamFields: FieldDef[] = [
    { key: "cp_load_time_min", label: "CP feeder load time", suffix: "min/feeder", step: "0.5" },
    { key: "ip_load_time_min", label: "IP feeder load time", suffix: "min/feeder", step: "0.5" },
    { key: "printer_setup_min", label: "Printer setup per side", suffix: "min", step: "1" },
  ];

  const placementFields: FieldDef[] = [
    { key: "smt_cost_per_placement", label: "SMT cost / placement (legacy)", suffix: "CAD", step: "0.001" },
    { key: "th_cost_per_placement", label: "TH cost / placement (legacy)", suffix: "CAD", step: "0.01" },
    { key: "mansmt_cost_per_placement", label: "Manual SMT cost / placement (legacy)", suffix: "CAD", step: "0.01" },
  ];

  const labourFields: FieldDef[] = [
    { key: "labour_rate_per_hour", label: "Labour rate (general)", suffix: "CAD/hr" },
    { key: "smt_rate_per_hour", label: "SMT rate (machine time)", suffix: "CAD/hr" },
    { key: "setup_time_hours", label: "Default setup time", suffix: "hours", step: "0.25" },
    { key: "programming_time_hours", label: "Default programming time", suffix: "hours", step: "0.25" },
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

      {/* Assembly Time Model Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Assembly Cost Model</CardTitle>
          <CardDescription>
            Choose between the new time-based model (matches DM/TIME V11) or the legacy
            flat per-placement model. The time model computes assembly hours from CPH rates
            and charges labour + machine time. Recommended: Time-Based.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="w-56 shrink-0 text-sm">Active model</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setSettings((prev) => ({ ...prev, use_time_model: true })); setSaved(false); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  settings.use_time_model !== false
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                Time-Based (DM/TIME V11)
              </button>
              <button
                type="button"
                onClick={() => { setSettings((prev) => ({ ...prev, use_time_model: false })); setSaved(false); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  settings.use_time_model === false
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                Legacy Per-Placement
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CPH Rates — Time-Based Model */}
      {settings.use_time_model !== false && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Components Per Hour (CPH)</CardTitle>
              <CardDescription>
                Pick-and-place speed rates by M-code category. Assembly time = total placements / CPH.
                From DM/TIME V11: CP/CPEXP at 4,500 CPH, 0402 at 3,500 CPH, IP at 2,000 CPH.
                TH and MANSMT are manual insertion rates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFieldGroup(cphFields)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feeder Setup Parameters</CardTitle>
              <CardDescription>
                Time to load feeders and set up the solder paste printer. These contribute to
                setup time per run (one-time, not per board). Printer setup is applied twice
                (top + bottom sides).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFieldGroup(setupParamFields)}
            </CardContent>
          </Card>
        </>
      )}

      {/* Legacy Placement Costs — shown when legacy model active, or collapsed as reference */}
      <Card>
        <CardHeader>
          <CardTitle>
            {settings.use_time_model !== false ? "Legacy Placement Costs (reference)" : "Placement Costs"}
          </CardTitle>
          <CardDescription>
            {settings.use_time_model !== false
              ? "These flat per-placement rates are NOT used when the time-based model is active. Kept for backward compatibility with old quotes."
              : "Cost per placement by component type. SMT includes CP, CPEXP, 0402, 0201, and IP. TH is through-hole. Manual SMT is hand-soldered surface mount."}
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
            labour defaults to $130/hr (applied to ALL assembly time) and SMT defaults to
            $165/hr (machine rate, applied to SMT portion only).
            Setup and programming time are per-job charges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderFieldGroup(labourFields)}
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
