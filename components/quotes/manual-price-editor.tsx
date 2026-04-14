"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MissingPriceComponent } from "@/lib/pricing/types";

interface ManualPriceEditorProps {
  quoteId: string;
  missingComponents: MissingPriceComponent[];
}

export function ManualPriceEditor({
  quoteId,
  missingComponents,
}: ManualPriceEditorProps) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enteredEntries = Object.entries(prices).filter(([, v]) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0;
  });
  const canSave = enteredEntries.length > 0 && !saving;

  const handleChange = (mpn: string, value: string) => {
    setPrices((prev) => ({ ...prev, [mpn]: value }));
    if (success) setSuccess(null);
    if (error) setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Save all manual prices in parallel
      const saveResults = await Promise.all(
        enteredEntries.map(async ([mpn, value]) => {
          const res = await fetch("/api/pricing/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mpn,
              unit_price: parseFloat(value),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              (data as { error?: string }).error ??
                `Failed to save price for ${mpn}`
            );
          }
          return mpn;
        })
      );

      // 2. Recalculate the quote
      const recalcRes = await fetch(
        `/api/quotes/${quoteId}/recalculate`,
        { method: "POST" }
      );
      if (!recalcRes.ok) {
        const data = await recalcRes.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to recalculate quote"
        );
      }

      setSuccess(
        `Quote recalculated — ${saveResults.length} price${
          saveResults.length !== 1 ? "s" : ""
        } saved`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (missingComponents.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Pricing for Missing Components</CardTitle>
        <p className="text-sm text-gray-500">
          {missingComponents.length} component
          {missingComponents.length !== 1 ? "s" : ""} had no price from
          DigiKey, Mouser, or LCSC. Enter prices below and click{" "}
          <span className="font-medium">Save &amp; Recalculate</span> to
          refresh the quote.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-96 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  MPN
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                  Qty/Board
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                  Unit Price ($)
                </th>
              </tr>
            </thead>
            <tbody>
              {missingComponents.map((c) => (
                <tr
                  key={c.mpn}
                  className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                >
                  <td className="px-3 py-2 font-mono text-xs">{c.mpn}</td>
                  <td
                    className="max-w-xs truncate px-3 py-2 text-gray-700 dark:text-gray-300"
                    title={c.description}
                  >
                    {c.description || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {c.qty_per_board}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={prices[c.mpn] ?? ""}
                      onChange={(e) => handleChange(c.mpn, e.target.value)}
                      disabled={saving}
                      className="ml-auto h-8 w-28 text-right font-mono text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {enteredEntries.length} of {missingComponents.length} price
            {missingComponents.length !== 1 ? "s" : ""} entered
          </p>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving & Recalculating...
              </>
            ) : (
              "Save & Recalculate"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
