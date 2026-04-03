"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PricingSettings } from "@/lib/pricing/types";

interface Props {
  settings: PricingSettings;
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

  const fields: { key: keyof PricingSettings; label: string; suffix: string }[] = [
    { key: "component_markup_pct", label: "Component markup", suffix: "%" },
    { key: "pcb_markup_pct", label: "PCB markup", suffix: "%" },
    { key: "smt_cost_per_placement", label: "SMT cost / placement", suffix: "CAD" },
    { key: "th_cost_per_placement", label: "TH cost / placement", suffix: "CAD" },
    { key: "mansmt_cost_per_placement", label: "Manual SMT cost / placement", suffix: "CAD" },
    { key: "default_nre", label: "Default NRE", suffix: "CAD" },
    { key: "default_shipping", label: "Default shipping", suffix: "CAD" },
    { key: "quote_validity_days", label: "Quote validity", suffix: "days" },
    { key: "labour_rate_per_hour", label: "Labour rate", suffix: "CAD/hr" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Pricing Defaults</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(({ key, label, suffix }) => (
          <div key={key} className="flex items-center gap-4">
            <Label className="w-48 shrink-0 text-sm">{label}</Label>
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={String(settings[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                className="max-w-[140px] font-mono"
              />
              <span className="text-xs text-gray-500">{suffix}</span>
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Settings saved.</p>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
