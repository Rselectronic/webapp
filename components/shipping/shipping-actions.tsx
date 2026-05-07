"use client";

// ----------------------------------------------------------------------------
// shipping-actions.tsx
//
// "Shipping" panel on the job detail page. Two modes:
//
//   1. One or more shipments rows exist for this job — render each as a
//      compact row inside the card (carrier, ship date, qty, status,
//      tracking-or-pickup) plus a top-line "Shipped: X / Y boards"
//      summary so the operator can see how complete the job is at a
//      glance. Each shipment row gets its own "Print Packing Slip"
//      button that passes shipment_id to the PDF generator.
//
//   2. No shipments rows yet — render the legacy edit form (job.metadata
//      fields: ship_date / courier_name / tracking_id) so jobs that
//      pre-date the shipments table still print packing slips correctly.
//
// PDF generation buttons (Compliance Certificate; legacy Packing Slip)
// are always shown when the job is in a shipping-eligible status.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Shield, Truck, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate as formatMontrealDate } from "@/lib/utils/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ShipmentLine {
  id: string;
  job_id: string;
  quantity: number;
}

interface Shipment {
  id: string;
  carrier: string;
  tracking_number: string | null;
  ship_date: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  shipping_cost: number | null;
  status: string;
  picked_up_by: string | null;
  notes: string | null;
  created_at: string;
  /** Lines belonging to this shipment. After migration 099 quantities live
   *  on `shipment_lines`, not on `shipments`. The job detail card filters
   *  these to lines where job_id == this jobId — other lines belong to
   *  other jobs in the same multi-job shipment and are out of scope here. */
  lines?: ShipmentLine[];
}

interface ShippingActionsProps {
  jobId: string;
  jobNumber: string;
  jobQuantity: number;
  currentStatus: string;
  metadata: Record<string, unknown>;
  /** All shipments containing a line for this job, newest-first. Each
   *  shipment carries its `lines` array; we only use lines whose
   *  `job_id` matches this job. When the array is empty the panel falls
   *  back to the legacy job.metadata edit form. */
  shipments?: Shipment[];
}

const SHIPPING_ELIGIBLE_STATUSES = [
  "shipping",
  "delivered",
  "invoiced",
  "inspection",
];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  shipped: "bg-blue-100 text-blue-800",
  in_transit: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return formatMontrealDate(d);
}

export function ShippingActions({
  jobId,
  jobNumber: _jobNumber,
  jobQuantity,
  currentStatus,
  metadata,
  shipments,
}: ShippingActionsProps) {
  const router = useRouter();
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);

  const [shipDate, setShipDate] = useState(
    (metadata.ship_date as string) ?? ""
  );
  const [courierName, setCourierName] = useState(
    (metadata.courier_name as string) ?? ""
  );
  const [trackingId, setTrackingId] = useState(
    (metadata.tracking_id as string) ?? ""
  );
  const [saving, setSaving] = useState(false);

  const canShip = SHIPPING_ELIGIBLE_STATUSES.includes(currentStatus);
  const shipmentList = shipments ?? [];
  const hasShipments = shipmentList.length > 0;

  // Per-shipment quantity for THIS job = sum of shipment_lines where
  // line.job_id == jobId. After migration 099 a shipment can carry lines
  // for multiple jobs at once; this card only cares about ours.
  function lineForThisJob(s: Shipment): ShipmentLine | null {
    const matches = (s.lines ?? []).filter((l) => l.job_id === jobId);
    if (matches.length === 0) return null;
    // Defensive: if more than one line for the same job ends up in one
    // shipment (shouldn't happen — the API enforces one line per (shipment,
    // job) — but if it does, sum them here to avoid undercounting).
    if (matches.length === 1) return matches[0];
    return {
      id: matches[0].id,
      job_id: jobId,
      quantity: matches.reduce((sum, l) => sum + Number(l.quantity ?? 0), 0),
    };
  }

  function quantityForThisJob(s: Shipment): number {
    return (s.lines ?? [])
      .filter((l) => l.job_id === jobId)
      .reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);
  }

  // Roll-up: total shipped across all shipments for this job — sum of all
  // shipment_lines.quantity where job_id matches.
  const totalShipped = shipmentList.reduce(
    (sum, s) => sum + quantityForThisJob(s),
    0
  );
  const remaining = Math.max(0, jobQuantity - totalShipped);
  const pctShipped =
    jobQuantity > 0 ? Math.min(100, (totalShipped / jobQuantity) * 100) : 0;
  const isComplete = jobQuantity > 0 && totalShipped >= jobQuantity;

  async function handleSaveShippingInfo() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            ...metadata,
            ship_date: shipDate || null,
            courier_name: courierName || null,
            tracking_id: trackingId || null,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to save"
        );
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to save shipping info:", err);
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateDoc(
    docType: "packing-slip" | "compliance",
    shipmentId?: string,
    shipmentLineId?: string
  ) {
    const key = shipmentId ? `${docType}:${shipmentId}` : docType;
    setGeneratingDoc(key);
    try {
      const params = new URLSearchParams({ type: docType });
      if (shipmentId) params.set("shipment_id", shipmentId);
      // After migration 099 the packing slip is per (shipment, job). Pass
      // the line id so the route can scope to the right job's qty even if
      // the shipment carries multiple jobs. Route may not consume this
      // param yet (Agent 1's territory) — harmless if ignored.
      if (shipmentLineId) params.set("shipment_line_id", shipmentLineId);
      const url = `/api/jobs/${jobId}/shipping-docs?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to generate PDF"
        );
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err) {
      console.error("Failed to generate shipping doc:", err);
      alert(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setGeneratingDoc(null);
    }
  }

  if (!canShip) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4" />
          Shipping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasShipments ? (
          // ---------- Modern path: one row per shipment ----------
          <div className="space-y-3">
            {/* Roll-up summary */}
            <div className="rounded-md border bg-gray-50 p-3 dark:bg-gray-900/30">
              <div className="flex items-baseline justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Shipped
                </p>
                <p
                  className={`text-sm font-medium ${
                    isComplete ? "text-green-700" : "text-gray-700"
                  }`}
                >
                  {totalShipped} / {jobQuantity} board
                  {jobQuantity === 1 ? "" : "s"}
                  {remaining > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({remaining} remaining)
                    </span>
                  )}
                  {isComplete && (
                    <span className="ml-2 text-xs font-normal text-green-700">
                      complete
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className={`h-full transition-all ${
                    isComplete ? "bg-green-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${pctShipped}%` }}
                />
              </div>
            </div>

            {/* One row per shipment */}
            <ul className="divide-y rounded-md border dark:divide-gray-800">
              {shipmentList.map((shipment) => {
                const isPickup = shipment.carrier === "Customer Pickup";
                const slipKey = `packing-slip:${shipment.id}`;
                const myLine = lineForThisJob(shipment);
                const myQty = myLine?.quantity ?? 0;
                return (
                  <li
                    key={shipment.id}
                    className="grid gap-2 p-3 sm:grid-cols-12 sm:items-center"
                  >
                    <div className="sm:col-span-3">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        {isPickup ? "Pickup" : "Carrier"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                        {isPickup && (
                          <User className="h-3.5 w-3.5 text-gray-500" />
                        )}
                        {shipment.carrier}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        {isPickup ? "Pickup Date" : "Ship Date"}
                      </p>
                      <p className="mt-0.5 text-sm">
                        {formatDate(shipment.ship_date)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        Quantity
                      </p>
                      <p className="mt-0.5 text-sm">
                        {myLine
                          ? `${myQty} board${myQty === 1 ? "" : "s"}`
                          : "—"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        {isPickup ? "Picked Up By" : "Tracking #"}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs">
                        {isPickup
                          ? (shipment.picked_up_by ?? "—")
                          : (shipment.tracking_number ?? "—")}
                      </p>
                    </div>
                    <div className="sm:col-span-1">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        Status
                      </p>
                      <span
                        className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                          STATUS_TONE[shipment.status] ??
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {shipment.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="sm:col-span-2 sm:text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={generatingDoc !== null}
                        onClick={() =>
                          handleGenerateDoc(
                            "packing-slip",
                            shipment.id,
                            myLine?.id
                          )
                        }
                      >
                        {generatingDoc === slipKey ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="mr-1 h-3 w-3" />
                        )}
                        Packing Slip
                      </Button>
                    </div>
                    {shipment.notes && (
                      <div className="border-t pt-2 sm:col-span-12">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">
                          Notes
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-700">
                          {shipment.notes}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          // ---------- Legacy fallback: edit job.metadata fields ----------
          <>
            <p className="text-xs italic text-gray-500">
              No shipment recorded yet. Use the &quot;New Shipment&quot; button
              on the Shipping page to log carrier and tracking, or fill the
              fields below for older jobs.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="ship-date" className="text-xs text-gray-500">
                  Ship Date
                </Label>
                <Input
                  id="ship-date"
                  type="date"
                  value={shipDate}
                  onChange={(e) => setShipDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="courier-name" className="text-xs text-gray-500">
                  Courier
                </Label>
                <Input
                  id="courier-name"
                  placeholder="e.g. Purolator, UPS"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="tracking-id" className="text-xs text-gray-500">
                  Tracking #
                </Label>
                <Input
                  id="tracking-id"
                  placeholder="Tracking number"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveShippingInfo}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Shipping Info"
              )}
            </Button>
          </>
        )}

        {/* PDF generation — always available when canShip. The legacy
            "Packing Slip" button covers the no-shipments case. When
            shipments exist, each row above has its own per-shipment
            packing slip; this button defaults to the most-recent. */}
        <div className="flex flex-wrap gap-2">
          {!hasShipments && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateDoc("packing-slip")}
              disabled={generatingDoc !== null}
            >
              {generatingDoc === "packing-slip" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              Packing Slip
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDoc("compliance")}
            disabled={generatingDoc !== null}
          >
            {generatingDoc === "compliance" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-1.5 h-4 w-4" />
            )}
            Compliance Certificates
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
