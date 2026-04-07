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

const CARRIERS = ["FedEx", "Purolator", "UPS", "Canada Post", "Other"] as const;

interface Job {
  id: string;
  job_number: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string } | null;
}

export function CreateShipmentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [jobId, setJobId] = useState("");
  const [carrier, setCarrier] = useState<string>("Purolator");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipDate, setShipDate] = useState(new Date().toISOString().split("T")[0]);
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/jobs?status=shipping");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
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

  async function handleCreate() {
    if (!jobId || !carrier) return;
    setCreating(true);
    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          carrier,
          tracking_number: trackingNumber || undefined,
          ship_date: shipDate || undefined,
          estimated_delivery: estimatedDelivery || undefined,
          shipping_cost: shippingCost ? parseFloat(shippingCost) : 0,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create shipment");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create shipment");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setJobId("");
      setCarrier("Purolator");
      setTrackingNumber("");
      setShipDate(new Date().toISOString().split("T")[0]);
      setEstimatedDelivery("");
      setShippingCost("");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        New Shipment
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Job selector */}
          <div>
            <Label htmlFor="shipment-job">Job</Label>
            {loadingJobs ? (
              <p className="mt-1 text-sm text-gray-500">Loading jobs...</p>
            ) : (
              <select
                id="shipment-job"
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

          {/* Carrier */}
          <div>
            <Label htmlFor="shipment-carrier">Carrier</Label>
            <select
              id="shipment-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Tracking number */}
          <div>
            <Label htmlFor="shipment-tracking">Tracking Number</Label>
            <Input
              id="shipment-tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number"
              className="mt-1 font-mono"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="shipment-date">Ship Date</Label>
              <Input
                id="shipment-date"
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="shipment-est-delivery">Est. Delivery</Label>
              <Input
                id="shipment-est-delivery"
                type="date"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Cost */}
          <div>
            <Label htmlFor="shipment-cost">Shipping Cost ($)</Label>
            <Input
              id="shipment-cost"
              type="number"
              step="0.01"
              min="0"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="0.00"
              className="mt-1 font-mono"
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="shipment-notes">Notes (optional)</Label>
            <textarea
              id="shipment-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional notes..."
            />
          </div>

          <Button
            className="w-full"
            disabled={creating || !jobId || !carrier}
            onClick={handleCreate}
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {creating ? "Creating..." : "Create Shipment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
