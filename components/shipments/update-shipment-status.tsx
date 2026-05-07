"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayMontreal } from "@/lib/utils/format";

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["shipped"],
  shipped: ["in_transit", "delivered"],
  in_transit: ["delivered"],
  delivered: [],
};

const STATUS_LABELS: Record<string, string> = {
  shipped: "Mark Shipped",
  in_transit: "Mark In Transit",
  delivered: "Mark Delivered",
};

interface UpdateShipmentStatusProps {
  shipmentId: string;
  currentStatus: string;
}

export function UpdateShipmentStatus({
  shipmentId,
  currentStatus,
}: UpdateShipmentStatusProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const nextStatuses = STATUS_FLOW[currentStatus] ?? [];

  async function handleUpdate(newStatus: string) {
    setLoading(true);
    try {
      const updates: Record<string, unknown> = { id: shipmentId, status: newStatus };
      if (newStatus === "delivered") {
        updates.actual_delivery = todayMontreal();
      }
      const res = await fetch("/api/shipments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to update");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  if (nextStatuses.length === 0) return null;

  return (
    <div className="flex gap-1">
      {nextStatuses.map((s) => (
        <Button
          key={s}
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => handleUpdate(s)}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : null}
          {STATUS_LABELS[s] ?? s}
        </Button>
      ))}
    </div>
  );
}
