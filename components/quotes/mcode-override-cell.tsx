"use client";

import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const M_CODES = [
  "0201", "0402", "CP", "CPEXP", "IP", "TH",
  "MANSMT", "MEC", "Accs", "CABLE", "DEV B",
] as const;

interface MCodeOverrideCellProps {
  lineId: string;
  batchId: string;
  currentOverride: string | null;
  autoMCode: string | null;
  disabled: boolean;
}

/**
 * Inline M-code override selector.
 * This is Step 5 of the 11-button sequence: "Add Manual MCode"
 *
 * Piyush reviews the auto-assigned M-code and can override it here.
 * The override is saved immediately via PATCH to the batch line.
 * Only enabled when batch status is "mcodes_assigned" (the human checkpoint).
 */
export function MCodeOverrideCell({
  lineId,
  batchId,
  currentOverride,
  autoMCode,
  disabled,
}: MCodeOverrideCellProps) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(currentOverride ?? "");

  const handleChange = async (newValue: string | null) => {
    if (!newValue) return;
    // "auto" means remove override, use auto-assigned value
    const override = newValue === "auto" ? null : newValue;
    setValue(newValue === "auto" ? "" : newValue);
    setSaving(true);

    try {
      await fetch(`/api/quote-batches/${batchId}/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          m_code_override: override,
          m_code_final: override ?? autoMCode,
          needs_review: false,
        }),
      });
    } catch {
      // Revert on error
      setValue(currentOverride ?? "");
    } finally {
      setSaving(false);
    }
  };

  if (disabled) {
    return (
      <span className="text-xs text-gray-400">
        {currentOverride ?? "—"}
      </span>
    );
  }

  return (
    <Select
      value={value || "auto"}
      onValueChange={handleChange}
      disabled={saving}
    >
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue placeholder="Auto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">
          <span className="text-gray-400">Auto ({autoMCode ?? "?"})</span>
        </SelectItem>
        {M_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
