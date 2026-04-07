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

interface NewQuoteFormProps {
  customers: Customer[];
}

export function NewQuoteForm({ customers }: NewQuoteFormProps) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState("");
  const [quantities, setQuantities] = useState<string[]>(["50", "100", "250", "500"]);
  const [pcbPrice, setPcbPrice] = useState("");
  const [nre, setNre] = useState("350");
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

  const handleBomChange = useCallback((id: string | null) => {
    if (!id) return;
    setBomId(id);
    setPreview(null);
  }, []);

  const updateQuantity = (index: number, value: string) => {
    setQuantities((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addQuantity = () => {
    setQuantities((prev) => [...prev, ""]);
    setPreview(null);
  };

  const removeQuantity = (index: number) => {
    if (quantities.length <= 1) return;
    setQuantities((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
  };

  const selectedBom = boms.find((b) => b.id === bomId);

  const parsedQuantities = quantities.map((q) => parseInt(q, 10) || 0);
  const validQuantities = parsedQuantities.length > 0 && parsedQuantities.every((q) => q > 0);

  const handleCalculate = async () => {
    if (!bomId || !validQuantities) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/quotes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: bomId,
          quantities: parsedQuantities,
          pcb_unit_price: parseFloat(pcbPrice) || 0,
          nre_charge: parseFloat(nre) || 0,
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
          quantities: parsedQuantities,
          pcb_unit_price: parseFloat(pcbPrice) || 0,
          nre_charge: parseFloat(nre) || 0,
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

      {/* Step 3: Quantities & Costs */}
      {bomId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. Quantities & Cost Inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Board Quantities ({quantities.length} tier{quantities.length !== 1 ? "s" : ""})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addQuantity}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Tier
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {quantities.map((q, i) => (
                  <div key={i} className="relative">
                    <Label className="mb-1 block text-xs text-gray-500">
                      Tier {i + 1}
                    </Label>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        min="1"
                        value={q}
                        onChange={(e) => updateQuantity(i, e.target.value)}
                        placeholder={`Qty ${i + 1}`}
                      />
                      {quantities.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 shrink-0 text-gray-400 hover:text-red-500"
                          onClick={() => removeQuantity(i)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-gray-500">
                  PCB Unit Price ($)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pcbPrice}
                  onChange={(e) => setPcbPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-gray-500">
                  NRE Charge ($)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nre}
                  onChange={(e) => setNre(e.target.value)}
                  placeholder="350"
                />
              </div>
              <div>
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
              disabled={loading || !validQuantities}
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
