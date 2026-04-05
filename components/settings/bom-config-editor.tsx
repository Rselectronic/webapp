"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BomConfigEditorProps {
  customerId: string;
  customerCode: string;
  currentConfig: Record<string, unknown>;
}

export function BomConfigEditor({
  customerId,
  customerCode,
  currentConfig,
}: BomConfigEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(JSON.stringify(currentConfig, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setError(null);
    setSuccess(false);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(value);
    } catch {
      setError("Invalid JSON. Please fix syntax errors before saving.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bom_config: parsed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const preview =
    JSON.stringify(currentConfig).length > 80
      ? JSON.stringify(currentConfig).slice(0, 80) + "..."
      : JSON.stringify(currentConfig);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {customerCode} BOM Config
          </CardTitle>
          <span className="text-xs text-gray-400">
            {expanded ? "Collapse" : "Expand"}
          </span>
        </div>
        {!expanded && (
          <p className="font-mono text-xs text-gray-500 truncate">{preview}</p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          <textarea
            className="w-full rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={12}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600">Saved successfully.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setValue(JSON.stringify(currentConfig, null, 2));
                setError(null);
              }}
            >
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
