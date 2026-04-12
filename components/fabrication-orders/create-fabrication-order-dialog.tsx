"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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

const ORDER_TYPES = [
  { value: "pcb", label: "PCB Fabrication" },
  { value: "stencil", label: "Stencil" },
] as const;

const SUPPLIERS = [
  "WMD Circuits",
  "Candor Circuit Boards",
  "PCBWay",
  "Stentech",
  "Other",
] as const;

interface Job {
  id: string;
  job_number: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string } | null;
}

export function CreateFabricationOrderDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [jobId, setJobId] = useState("");
  const [orderType, setOrderType] = useState<string>("pcb");
  const [supplier, setSupplier] = useState<string>("WMD Circuits");
  const [supplierRef, setSupplierRef] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [orderedDate, setOrderedDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchJobs();
  }, [open, fetchJobs]);

  const qty = parseInt(quantity) || 1;
  const uc = parseFloat(unitCost) || 0;
  const totalCost = Math.round(qty * uc * 100) / 100;

  async function handleCreate() {
    if (!jobId || !orderType || !supplier) return;
    setCreating(true);
    try {
      const res = await fetch("/api/fabrication-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          order_type: orderType,
          supplier,
          supplier_ref: supplierRef || undefined,
          quantity: qty,
          unit_cost: uc,
          ordered_date: orderedDate || undefined,
          expected_date: expectedDate || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create order");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setJobId("");
      setOrderType("pcb");
      setSupplier("WMD Circuits");
      setSupplierRef("");
      setQuantity("1");
      setUnitCost("");
      setOrderedDate(new Date().toISOString().split("T")[0]);
      setExpectedDate("");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        New Order
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create PCB / Stencil Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Job selector */}
          <div>
            <Label htmlFor="fab-job">Job</Label>
            {loadingJobs ? (
              <p className="mt-1 text-sm text-gray-500">Loading jobs...</p>
            ) : (
              <select
                id="fab-job"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a job...</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number}
                    {j.customers ? ` — ${j.customers.code}` : ""}
                    {j.gmps ? ` / ${j.gmps.gmp_number}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Order Type */}
          <div>
            <Label htmlFor="fab-type">Order Type</Label>
            <select
              id="fab-type"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ORDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Supplier */}
          <div>
            <Label htmlFor="fab-supplier">Supplier</Label>
            <select
              id="fab-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SUPPLIERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Supplier Ref */}
          <div>
            <Label htmlFor="fab-ref">Supplier Reference #</Label>
            <Input
              id="fab-ref"
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder="Supplier order number"
              className="mt-1 font-mono"
            />
          </div>

          {/* Quantity + Unit Cost */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="fab-qty">Quantity</Label>
              <Input
                id="fab-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="fab-unit-cost">Unit Cost ($)</Label>
              <Input
                id="fab-unit-cost"
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label>Total Cost</Label>
              <p className="mt-2 font-mono text-sm font-medium">
                ${totalCost.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fab-ordered">Ordered Date</Label>
              <Input
                id="fab-ordered"
                type="date"
                value={orderedDate}
                onChange={(e) => setOrderedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fab-expected">Expected Date</Label>
              <Input
                id="fab-expected"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="fab-notes">Notes (optional)</Label>
            <textarea
              id="fab-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional notes..."
            />
          </div>

          <Button
            className="w-full"
            disabled={creating || !jobId || !orderType || !supplier}
            onClick={handleCreate}
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {creating ? "Creating..." : "Create Order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
