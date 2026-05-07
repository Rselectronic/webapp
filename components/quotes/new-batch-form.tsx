"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Layers, Check } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Bom {
  id: string;
  file_name: string;
  component_count: number;
  status: string;
  gmps: { gmp_number: string; board_name?: string | null } | null;
}

export function NewBatchForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [selectedBomIds, setSelectedBomIds] = useState<Set<string>>(new Set());
  const [qty1, setQty1] = useState("50");
  const [qty2, setQty2] = useState("100");
  const [qty3, setQty3] = useState("150");
  const [qty4, setQty4] = useState("200");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setSelectedBomIds(new Set());
    setBoms([]);

    const res = await fetch(`/api/boms?customer_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      // API returns array directly or { boms: [...] }
      setBoms(Array.isArray(data) ? data : (data.boms ?? []));
    }

    const customer = customers.find((c) => c.id === id);
    if (customer && !batchName) {
      const now = new Date();
      setBatchName(`${customer.code} ${now.toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "America/Toronto" })}`);
    }
  }, [customers, batchName]);

  const toggleBom = (bomId: string) => {
    setSelectedBomIds((prev) => {
      const next = new Set(prev);
      if (next.has(bomId)) next.delete(bomId);
      else next.add(bomId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!customerId || selectedBomIds.size === 0 || !batchName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/quote-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          batch_name: batchName.trim(),
          bom_ids: Array.from(selectedBomIds),
          qty_1: qty1 ? parseInt(qty1, 10) : null,
          qty_2: qty2 ? parseInt(qty2, 10) : null,
          qty_3: qty3 ? parseInt(qty3, 10) : null,
          qty_4: qty4 ? parseInt(qty4, 10) : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create batch");
      }

      const data = await res.json();
      router.push(`/quotes/batches/${data.batch_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Customer */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={handleCustomerChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a customer..." />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Batch Name */}
      {customerId && (
        <div className="space-y-2">
          <Label>Batch Name</Label>
          <Input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="e.g. ISC April 2026 RFQ"
          />
        </div>
      )}

      {/* BOM Selection */}
      {customerId && (
        <div className="space-y-2">
          <Label>Select BOMs to Include ({selectedBomIds.size} selected)</Label>
          {boms.length === 0 ? (
            <p className="text-sm text-gray-500">
              No parsed BOMs found for this customer. Upload and parse BOMs first.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {boms.map((bom) => {
                const gmp = bom.gmps as { gmp_number: string; board_name: string | null } | null;
                const selected = selectedBomIds.has(bom.id);
                return (
                  <button
                    key={bom.id}
                    type="button"
                    onClick={() => toggleBom(bom.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                      selected ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300"
                    }`}>
                      {selected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1">
                      <span className="font-mono font-medium">{gmp?.gmp_number ?? "—"}</span>
                      {gmp?.board_name && <span className="ml-2 text-gray-500">{gmp.board_name}</span>}
                    </div>
                    <span className="text-xs text-gray-400">{bom.component_count} components</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quantity Tiers */}
      {selectedBomIds.size > 0 && (
        <div className="space-y-2">
          <Label>Quantity Tiers (how many boards per tier)</Label>
          <p className="text-xs text-gray-500">
            Set up to 4 tiers. Each tier gets its own pricing. Leave blank to skip a tier.
          </p>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-gray-400">QTY #1</Label>
              <Input value={qty1} onChange={(e) => setQty1(e.target.value)} placeholder="50" type="number" min="1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">QTY #2</Label>
              <Input value={qty2} onChange={(e) => setQty2(e.target.value)} placeholder="100" type="number" min="1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">QTY #3</Label>
              <Input value={qty3} onChange={(e) => setQty3(e.target.value)} placeholder="250" type="number" min="1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">QTY #4</Label>
              <Input value={qty4} onChange={(e) => setQty4(e.target.value)} placeholder="500" type="number" min="1" />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedBomIds.size > 0 && batchName.trim() && (
        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating batch...</>
          ) : (
            <><Layers className="mr-2 h-4 w-4" />Create Batch ({selectedBomIds.size} BOM{selectedBomIds.size > 1 ? "s" : ""})</>
          )}
        </Button>
      )}
    </div>
  );
}
