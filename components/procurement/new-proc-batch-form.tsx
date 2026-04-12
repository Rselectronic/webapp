"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Layers, Check } from "lucide-react";

interface Procurement {
  id: string;
  proc_code: string;
  status: string;
  total_lines: number | null;
  lines_ordered: number | null;
  lines_received: number | null;
  created_at: string;
  jobs: {
    job_number: string;
    quantity: number;
    customers: { code: string; company_name: string } | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
  } | null;
}

export function NewProcBatchForm({ procurements }: { procurements: Procurement[] }) {
  const router = useRouter();
  const [batchName, setBatchName] = useState("");
  const [procBatchCode, setProcBatchCode] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProc = useCallback((procId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(procId)) next.delete(procId);
      else next.add(procId);
      return next;
    });
  }, []);

  // Auto-generate batch name from first selected procurement's customer
  const updateBatchName = useCallback((ids: Set<string>) => {
    if (batchName) return; // Don't overwrite manual name
    const firstProc = procurements.find((p) => ids.has(p.id));
    if (firstProc?.jobs?.customers) {
      const now = new Date();
      setBatchName(
        `${firstProc.jobs.customers.code} ${now.toLocaleDateString("en-CA", { month: "short", year: "numeric" })} Order`
      );
    }
  }, [procurements, batchName]);

  const handleToggle = useCallback((procId: string) => {
    toggleProc(procId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(procId)) next.delete(procId);
      else next.add(procId);
      updateBatchName(next);
      return next;
    });
  }, [toggleProc, updateBatchName]);

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || !batchName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/procurement-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_name: batchName.trim(),
          procurement_ids: Array.from(selectedIds),
          proc_batch_code: procBatchCode.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create batch");
      }

      const data = await res.json();
      router.push(`/procurement/batches/${data.batch_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
      setLoading(false);
    }
  };

  // Filter to only show procurements that aren't already in a batch
  const available = procurements.filter((p) => p.status !== "completed");

  return (
    <div className="space-y-6">
      {/* Batch Name */}
      <div className="space-y-2">
        <Label>Batch Name</Label>
        <Input
          value={batchName}
          onChange={(e) => setBatchName(e.target.value)}
          placeholder="e.g. TLAN April 2026 Order"
        />
      </div>

      {/* Proc Batch Code (optional) */}
      <div className="space-y-2">
        <Label>Proc Batch Code (optional)</Label>
        <Input
          value={procBatchCode}
          onChange={(e) => setProcBatchCode(e.target.value)}
          placeholder="e.g. 260411 TLAN-TB001"
          className="font-mono"
        />
        <p className="text-xs text-gray-500">
          SOP format: YYMMDD CUST-XYNNN. Leave blank to skip.
        </p>
      </div>

      {/* Procurement Selection */}
      <div className="space-y-2">
        <Label>Select Procurements to Batch ({selectedIds.size} selected)</Label>
        {available.length === 0 ? (
          <p className="text-sm text-gray-500">
            No procurements available for batching. Create procurements from jobs first.
          </p>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border p-2">
            {available.map((proc) => {
              const job = proc.jobs;
              const customer = job?.customers;
              const gmp = job?.gmps;
              const selected = selectedIds.has(proc.id);
              return (
                <button
                  key={proc.id}
                  type="button"
                  onClick={() => handleToggle(proc.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950 dark:ring-blue-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                    selected ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-blue-600">{proc.proc_code}</span>
                      <span className="text-gray-400">|</span>
                      <span className="font-mono text-xs">{job?.job_number ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{customer ? `${customer.code} — ${customer.company_name}` : "—"}</span>
                      {gmp && <span className="font-mono">{gmp.gmp_number}</span>}
                      <span>Qty: {job?.quantity ?? "—"}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    {proc.total_lines ?? 0} lines
                    <br />
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      proc.status === "draft" ? "bg-gray-100 text-gray-600"
                        : proc.status === "ordering" ? "bg-blue-100 text-blue-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {proc.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedIds.size > 0 && batchName.trim() && (
        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating batch...</>
          ) : (
            <><Layers className="mr-2 h-4 w-4" />Create Procurement Batch ({selectedIds.size} procurement{selectedIds.size > 1 ? "s" : ""})</>
          )}
        </Button>
      )}
    </div>
  );
}
