"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface InvoicableJob {
  id: string;
  job_number: string;
  quantity: number;
  gmp_number: string;
  board_name: string | null;
  subtotal: number;
}

export function CreateInvoiceDialog({
  customers,
}: {
  customers: Customer[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [jobs, setJobs] = useState<InvoicableJob[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [freight, setFreight] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async (customerId: string) => {
    if (!customerId) {
      setJobs([]);
      return;
    }
    setLoadingJobs(true);
    try {
      const res = await fetch(
        `/api/jobs?customer_id=${customerId}&invoicable=true`
      );
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    setSelectedJobIds(new Set());
    if (selectedCustomerId) {
      fetchJobs(selectedCustomerId);
    } else {
      setJobs([]);
    }
  }, [selectedCustomerId, fetchJobs]);

  function toggleJob(jobId: string) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map((j) => j.id)));
    }
  }

  const selectedJobs = jobs.filter((j) => selectedJobIds.has(j.id));
  const combinedSubtotal = selectedJobs.reduce((s, j) => s + j.subtotal, 0);
  const freightNum = parseFloat(freight) || 0;
  const discountNum = parseFloat(discount) || 0;
  const tpsGst = Math.round(combinedSubtotal * 0.05 * 100) / 100;
  const tvqQst = Math.round(combinedSubtotal * 0.09975 * 100) / 100;
  const estimatedTotal =
    Math.round(
      (combinedSubtotal + tpsGst + tvqQst + freightNum - discountNum) * 100
    ) / 100;

  async function handleCreate() {
    if (selectedJobIds.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_ids: Array.from(selectedJobIds),
          customer_id: selectedCustomerId,
          freight: freightNum,
          discount: discountNum,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to create invoice"
        );
      }
      const invoice = await res.json();
      setOpen(false);
      router.push(`/invoices/${invoice.id}`);
      router.refresh();
    } catch (err) {
      console.error("Invoice creation failed:", err);
      alert(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset form
      setSelectedCustomerId("");
      setJobs([]);
      setSelectedJobIds(new Set());
      setFreight("0");
      setDiscount("0");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Create Invoice
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Customer selector */}
          <div>
            <Label htmlFor="customer-select">Customer</Label>
            <select
              id="customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Job selection */}
          {selectedCustomerId && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>
                  Select Jobs{" "}
                  <span className="text-gray-400">
                    ({selectedJobIds.size} of {jobs.length} selected)
                  </span>
                </Label>
                {jobs.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAll}
                    type="button"
                  >
                    {selectedJobIds.size === jobs.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                )}
              </div>

              {loadingJobs ? (
                <p className="text-sm text-gray-500">Loading jobs...</p>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No invoicable jobs found for this customer. Jobs must be in
                  shipped/delivered status and not yet invoiced.
                </p>
              ) : (
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
                  {jobs.map((job) => (
                    <label
                      key={job.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        selectedJobIds.has(job.id)
                          ? "bg-blue-50 border border-blue-200"
                          : "hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobIds.has(job.id)}
                        onChange={() => toggleJob(job.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="font-mono font-medium">
                          {job.job_number}
                        </span>
                        <span className="ml-2 text-gray-500">
                          {job.gmp_number}
                          {job.board_name ? ` (${job.board_name})` : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">
                          Qty {job.quantity}
                        </span>
                        <span className="ml-3 font-mono text-sm font-medium">
                          {formatCurrency(job.subtotal)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Freight + Discount */}
          {selectedJobIds.size > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="freight">Freight ($)</Label>
                  <Input
                    id="freight"
                    type="number"
                    step="0.01"
                    min="0"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="discount">Discount ($)</Label>
                  <Input
                    id="discount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="invoice-notes">Notes (optional)</Label>
                <textarea
                  id="invoice-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional invoice notes..."
                />
              </div>

              {/* Pricing summary */}
              <div className="rounded-md border bg-gray-50 p-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Subtotal ({selectedJobIds.size} job
                      {selectedJobIds.size > 1 ? "s" : ""})
                    </span>
                    <span className="font-mono">
                      {formatCurrency(combinedSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TPS/GST (5%)</span>
                    <span className="font-mono">{formatCurrency(tpsGst)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TVQ/QST (9.975%)</span>
                    <span className="font-mono">{formatCurrency(tvqQst)}</span>
                  </div>
                  {freightNum > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Freight</span>
                      <span className="font-mono">
                        {formatCurrency(freightNum)}
                      </span>
                    </div>
                  )}
                  {discountNum > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Discount</span>
                      <span className="font-mono text-green-600">
                        -{formatCurrency(discountNum)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <span>Estimated Total</span>
                    <span className="font-mono">
                      {formatCurrency(estimatedTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={creating || selectedJobIds.size === 0}
                onClick={handleCreate}
              >
                {creating
                  ? "Creating Invoice..."
                  : `Generate Invoice (${selectedJobIds.size} job${selectedJobIds.size > 1 ? "s" : ""})`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
