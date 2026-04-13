"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingTable } from "@/components/quotes/pricing-table";
import type { PricingTier } from "@/lib/pricing/types";
import { Loader2, RefreshCw, Plus, X } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Bom {
  id: string;
  file_name: string;
  revision: string;
  gmp_id: string;
  gmps: { gmp_number: string } | null;
}

interface PreviewResult {
  tiers: PricingTier[];
  warnings: string[];
}

/** Per-tier form row state */
interface TierRow {
  qty: string;
  pcb_unit_price: string;
  nre_programming: string;
  nre_stencil: string;
  nre_pcb_fab: string;
}

function defaultTierRow(qty = ""): TierRow {
  return {
    qty,
    pcb_unit_price: "",
    nre_programming: "0",
    nre_stencil: "400",
    nre_pcb_fab: "0",
  };
}

interface NewQuoteFormProps {
  customers: Customer[];
}

export function NewQuoteForm({ customers }: NewQuoteFormProps) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState("");
  const [tierRows, setTierRows] = useState<TierRow[]>([
    defaultTierRow("50"),
    defaultTierRow("100"),
    defaultTierRow("250"),
    defaultTierRow("500"),
  ]);
  const [shipping, setShipping] = useState("200");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setBomId("");
    setBoms([]);
    setPreview(null);
    setError(null);

    try {
      const res = await fetch(`/api/boms?customer_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setBoms(Array.isArray(data) ? data : data.boms ?? []);
      }
    } catch {
      setError("Failed to load BOMs for this customer.");
    }
  }, []);

  const handleBomChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setBomId(id);
    setPreview(null);

    // Auto-calculate programming cost from BOM line count
    try {
      const res = await fetch(`/api/bom/${id}/line-count`);
      if (res.ok) {
        const { programming_cost } = await res.json();
        if (typeof programming_cost === "number") {
          setTierRows((prev) =>
            prev.map((row) => ({ ...row, nre_programming: String(programming_cost) }))
          );
        }
      }
    } catch {
      // Non-critical — user can still enter manually
    }
  }, []);

  const updateTierField = (index: number, field: keyof TierRow, value: string) => {
    setTierRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setPreview(null);
  };

  const addTierRow = () => {
    setTierRows((prev) => [...prev, defaultTierRow()]);
    setPreview(null);
  };

  const removeTierRow = (index: number) => {
    if (tierRows.length <= 1) return;
    setTierRows((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
  };

  const selectedBom = boms.find((b) => b.id === bomId);

  const parsedTiers = tierRows.map((row) => ({
    qty: parseInt(row.qty, 10) || 0,
    pcb_unit_price: parseFloat(row.pcb_unit_price) || 0,
    nre_programming: parseFloat(row.nre_programming) || 0,
    nre_stencil: parseFloat(row.nre_stencil) || 0,
    nre_pcb_fab: parseFloat(row.nre_pcb_fab) || 0,
  }));
  const validTiers = parsedTiers.length > 0 && parsedTiers.every((t) => t.qty > 0);

  const handleCalculate = async () => {
    if (!bomId || !validTiers) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/quotes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: bomId,
          tiers: parsedTiers,
          shipping_flat: parseFloat(shipping) || 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to calculate pricing");
      }

      const data = await res.json();
      setPreview(data.pricing ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pricing calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview || !selectedBom) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: bomId,
          gmp_id: selectedBom.gmp_id,
          customer_id: customerId,
          tiers: parsedTiers,
          shipping_flat: parseFloat(shipping) || 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save quote");
      }

      const data = await res.json();
      router.push(`/quotes/${data.quote_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quote");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={customerId} onValueChange={(v) => { if (v) handleCustomerChange(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select a customer...">
                {customerId ? (() => { const c = customers.find(c => c.id === customerId); return c ? `${c.code} — ${c.company_name}` : customerId; })() : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} — {c.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 2: BOM */}
      {customerId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Select Parsed BOM</CardTitle>
          </CardHeader>
          <CardContent>
            {boms.length === 0 ? (
              <p className="text-sm text-gray-500">
                No parsed BOMs found for this customer. Upload and parse a BOM
                first.
              </p>
            ) : (
              <Select value={bomId} onValueChange={(v) => { if (v) handleBomChange(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a BOM...">
                    {bomId ? (() => { const b = boms.find(b => b.id === bomId); return b ? `${b.gmps?.gmp_number ?? "Unknown"} — ${b.file_name} (rev ${b.revision})` : bomId; })() : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {boms.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.gmps?.gmp_number ?? "Unknown GMP"} — {b.file_name} (rev{" "}
                      {b.revision})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Tier Inputs (row-wise) */}
      {bomId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. Pricing Tiers ({tierRows.length} tier{tierRows.length !== 1 ? "s" : ""})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tier table */}
            <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-12">Tier</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Board Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PCB Unit Price ($)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">NRE Programming ($)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">NRE Stencil ($)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">NRE PCB Fab ($)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {tierRows.map((row, i) => (
                    <tr key={i} className="border-b dark:border-gray-800">
                      <td className="px-3 py-2 text-center text-xs font-medium text-gray-400">
                        {i + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="1"
                          value={row.qty}
                          onChange={(e) => updateTierField(i, "qty", e.target.value)}
                          placeholder="Qty"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.pcb_unit_price}
                          onChange={(e) => updateTierField(i, "pcb_unit_price", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.nre_programming}
                          onChange={(e) => updateTierField(i, "nre_programming", e.target.value)}
                          placeholder="0"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.nre_stencil}
                          onChange={(e) => updateTierField(i, "nre_stencil", e.target.value)}
                          placeholder="400"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.nre_pcb_fab}
                          onChange={(e) => updateTierField(i, "nre_pcb_fab", e.target.value)}
                          placeholder="0"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {tierRows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                            onClick={() => removeTierRow(i)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add tier + Shipping row */}
            <div className="flex items-end justify-between gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTierRow}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Tier
              </Button>

              <div className="w-48">
                <Label className="mb-1 block text-xs text-gray-500">
                  Shipping ($)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  placeholder="200"
                />
              </div>
            </div>

            <Button
              onClick={handleCalculate}
              disabled={loading || !validTiers}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Calculate Pricing
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Step 4: Preview */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Pricing Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PricingTable tiers={preview.tiers} warnings={preview.warnings} />

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
              variant="default"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Quote as Draft"
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
