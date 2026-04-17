"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Shield, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ShippingActionsProps {
  jobId: string;
  jobNumber: string;
  currentStatus: string;
  metadata: Record<string, unknown>;
}

const SHIPPING_ELIGIBLE_STATUSES = [
  "shipping",
  "delivered",
  "invoiced",
  "inspection",
];

export function ShippingActions({
  jobId,
  jobNumber: _jobNumber,
  currentStatus,
  metadata,
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
      // eslint-disable-next-line no-console
      console.error("Failed to save shipping info:", err);
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateDoc(docType: "packing-slip" | "compliance") {
    setGeneratingDoc(docType);
    try {
      const url = `/api/jobs/${jobId}/shipping-docs?type=${docType}`;
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
      // eslint-disable-next-line no-console
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
        {/* Shipping Info Fields */}
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

        <div className="flex flex-wrap gap-2">
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
