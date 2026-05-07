"use client";

// ----------------------------------------------------------------------------
// CreateShipmentDialog (multi-line)
//
// Controlled dialog. Driven by selection on the Pending Shipment list.
//
// Inputs: a `customerId`, a `customerLabel` for the header, and a list of
// `candidateJobs` (all from the same customer) plus `initialSelectedJobIds`
// for which jobs to seed as lines.
//
// Output: POST /api/shipments with shape:
//   { customer_id, carrier, tracking_number?, ship_date?, estimated_delivery?,
//     shipping_cost?, picked_up_by?, notes?, lines: [{job_id, quantity}] }
// (Agent 1 owns the route; this matches their spec.)
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayMontreal } from "@/lib/utils/format";

const CARRIERS = [
  "FedEx",
  "Purolator",
  "UPS",
  "Canada Post",
  "Customer Pickup",
  "Other",
] as const;

export interface CandidateJob {
  id: string;
  job_number: string;
  available_to_ship: number;
  customer_id: string;
  gmps?: { gmp_number: string } | null;
}

interface ShipmentLineDraft {
  job_id: string;
  // String so the input can hold transient empty/invalid states without
  // forcing a number. Coerced at submit.
  qty: string;
}

interface CreateShipmentDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  customerId: string;
  customerLabel: string;
  candidateJobs: CandidateJob[];
  initialSelectedJobIds?: string[];
}

export function CreateShipmentDialog({
  open,
  onOpenChange,
  customerId,
  customerLabel,
  candidateJobs,
  initialSelectedJobIds,
}: CreateShipmentDialogProps) {
  const router = useRouter();

  // Lines = the list of jobs included in this shipment, with per-line qty.
  const [lines, setLines] = useState<ShipmentLineDraft[]>([]);
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Shipment-level fields.
  const [carrier, setCarrier] = useState<string>("Purolator");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipDate, setShipDate] = useState(todayMontreal());
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedUpBy, setPickedUpBy] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isPickup = carrier === "Customer Pickup";

  // (Re)seed the lines whenever the dialog opens or the seed list changes.
  // Using `open` in the dep array ensures reopening with the same selection
  // restores defaults (e.g. user edited a qty, cancelled, then reopened).
  useEffect(() => {
    if (!open) return;
    const seedIds = initialSelectedJobIds ?? [];
    const seeded: ShipmentLineDraft[] = seedIds
      .map((id) => candidateJobs.find((j) => j.id === id))
      .filter((j): j is CandidateJob => Boolean(j))
      .map((j) => ({ job_id: j.id, qty: String(j.available_to_ship) }));
    setLines(seeded);
    setShowAddPicker(false);
    setSubmitError(null);
    setCarrier("Purolator");
    setTrackingNumber("");
    setShipDate(todayMontreal());
    setEstimatedDelivery("");
    setShippingCost("");
    setNotes("");
    setPickedUpBy("");
  }, [open, initialSelectedJobIds, candidateJobs]);

  // Lookup helpers.
  const jobById = useMemo(() => {
    const m = new Map<string, CandidateJob>();
    for (const j of candidateJobs) m.set(j.id, j);
    return m;
  }, [candidateJobs]);

  const includedJobIds = useMemo(
    () => new Set(lines.map((l) => l.job_id)),
    [lines]
  );

  const addableJobs = useMemo(
    () => candidateJobs.filter((j) => !includedJobIds.has(j.id)),
    [candidateJobs, includedJobIds]
  );

  // Customer code derived once for the "+ Add another" link copy.
  const customerCode = useMemo(() => {
    // customerLabel might be "TLAN — Lanka..." or just "TLAN".
    return customerLabel.split(" ")[0]?.replace("—", "").trim() || "";
  }, [customerLabel]);

  function updateLineQty(jobId: string, qty: string) {
    setLines((prev) =>
      prev.map((l) => (l.job_id === jobId ? { ...l, qty } : l))
    );
  }

  function removeLine(jobId: string) {
    setLines((prev) => prev.filter((l) => l.job_id !== jobId));
  }

  function addJobLine(job: CandidateJob) {
    setLines((prev) => [
      ...prev,
      { job_id: job.id, qty: String(job.available_to_ship) },
    ]);
    setShowAddPicker(false);
  }

  // Per-line validation. A line is valid when qty parses to a positive
  // integer in [1, available]. Below we surface the first invalid line
  // inline so the user sees what's wrong without needing to submit.
  const lineValidations = lines.map((l) => {
    const job = jobById.get(l.job_id);
    const available = job?.available_to_ship ?? 0;
    const parsed = l.qty === "" ? NaN : Number(l.qty);
    const validInt =
      Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1;
    let error: string | null = null;
    if (!validInt) {
      error = l.qty === "" ? "Required" : "Must be a positive integer";
    } else if (parsed > available) {
      error = `Exceeds available (${available})`;
    }
    return { jobId: l.job_id, parsed, error };
  });

  const allLinesValid =
    lines.length > 0 && lineValidations.every((v) => v.error === null);

  const canSubmit =
    !submitting &&
    allLinesValid &&
    customerId.length > 0 &&
    Boolean(carrier) &&
    (!isPickup || pickedUpBy.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        customer_id: customerId,
        carrier,
        tracking_number: isPickup
          ? undefined
          : trackingNumber.trim() || undefined,
        ship_date: shipDate || undefined,
        estimated_delivery: isPickup
          ? undefined
          : estimatedDelivery || undefined,
        shipping_cost: isPickup
          ? 0
          : shippingCost
            ? parseFloat(shippingCost)
            : 0,
        picked_up_by: isPickup ? pickedUpBy.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        lines: lineValidations.map((v) => ({
          job_id: v.jobId,
          quantity: v.parsed,
        })),
      };

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to create shipment"
        );
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create shipment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[95vw] max-w-[1024px] sm:max-w-[1024px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Customer header — single, fixed at the shipment level. */}
          <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/40">
            <span className="text-gray-500">Customer:</span>{" "}
            <span className="font-medium">{customerLabel || "—"}</span>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <Label>Jobs in this shipment</Label>
            {lines.length === 0 ? (
              <p className="text-sm italic text-gray-500">
                No jobs included. Add at least one job below.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l) => {
                  const job = jobById.get(l.job_id);
                  const v = lineValidations.find((x) => x.jobId === l.job_id);
                  if (!job) return null;
                  return (
                    <li
                      key={l.job_id}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 dark:border-gray-800"
                    >
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-mono font-medium">
                          {job.job_number}
                        </span>
                        {job.gmps?.gmp_number ? (
                          <span className="ml-2 font-mono text-gray-500">
                            · {job.gmps.gmp_number}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Qty:</span>
                        <Input
                          type="number"
                          min={1}
                          max={job.available_to_ship}
                          step={1}
                          value={l.qty}
                          onChange={(e) =>
                            updateLineQty(l.job_id, e.target.value)
                          }
                          className="w-24"
                        />
                        <span className="text-xs text-gray-500">
                          of {job.available_to_ship} remaining
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                          onClick={() => removeLine(l.job_id)}
                          aria-label={`Remove ${job.job_number}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {v?.error && (
                        <p className="w-full text-xs text-red-600">
                          {v.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Add-another picker. Only renders if there are still candidates
                from the same customer that aren't already included. */}
            {addableJobs.length > 0 && (
              <div className="pt-1">
                {showAddPicker ? (
                  <div className="rounded-md border p-2 dark:border-gray-800">
                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                      Add a {customerCode || "customer"} job
                    </p>
                    <ul className="divide-y dark:divide-gray-800">
                      {addableJobs.map((j) => (
                        <li
                          key={j.id}
                          className="flex items-center justify-between gap-2 py-1.5 text-sm"
                        >
                          <span>
                            <span className="font-mono">{j.job_number}</span>
                            {j.gmps?.gmp_number ? (
                              <span className="ml-2 font-mono text-gray-500">
                                · {j.gmps.gmp_number}
                              </span>
                            ) : null}
                            <span className="ml-2 text-xs text-gray-500">
                              ({j.available_to_ship} available)
                            </span>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addJobLine(j)}
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddPicker(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-blue-600"
                    onClick={() => setShowAddPicker(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add another {customerCode || "customer"} job
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Carrier */}
          <div>
            <Label htmlFor="shipment-carrier">Carrier</Label>
            <Select
              value={carrier}
              onValueChange={(v) => v && setCarrier(v)}
            >
              <SelectTrigger id="shipment-carrier" className="mt-1 w-full">
                <SelectValue>{(v: string) => v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tracking — couriers only. */}
          {!isPickup && (
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
          )}

          {/* Picked up by — pickups only, required. */}
          {isPickup && (
            <div>
              <Label htmlFor="shipment-picked-up-by">
                Picked Up By <span className="text-red-500">*</span>
              </Label>
              <Input
                id="shipment-picked-up-by"
                value={pickedUpBy}
                onChange={(e) => setPickedUpBy(e.target.value)}
                placeholder="Name of the person collecting the boards"
                className="mt-1"
              />
            </div>
          )}

          {/* Dates */}
          <div className={isPickup ? "" : "grid grid-cols-2 gap-4"}>
            <div>
              <Label htmlFor="shipment-date">
                {isPickup ? "Pickup Date" : "Ship Date"}
              </Label>
              <Input
                id="shipment-date"
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {!isPickup && (
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
            )}
          </div>

          {/* Cost — pickups have no shipping cost. */}
          {!isPickup && (
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
          )}

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

          {submitError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitting
                ? "Creating..."
                : `Create Shipment${
                    lines.length > 1 ? ` (${lines.length} jobs)` : ""
                  }`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
