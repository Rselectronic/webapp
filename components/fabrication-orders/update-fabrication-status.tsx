"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_FLOW: Record<string, string[]> = {
  ordered: ["in_production", "shipped"],
  in_production: ["shipped"],
  shipped: ["received"],
  received: [],
};

const STATUS_LABELS: Record<string, string> = {
  in_production: "In Production",
  shipped: "Mark Shipped",
  received: "Mark Received",
};

interface UpdateFabricationStatusProps {
  orderId: string;
  currentStatus: string;
}

export function UpdateFabricationStatus({
  orderId,
  currentStatus,
}: UpdateFabricationStatusProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const nextStatuses = STATUS_FLOW[currentStatus] ?? [];

  async function handleUpdate(newStatus: string) {
    setLoading(true);
    try {
      const updates: Record<string, unknown> = { id: orderId, status: newStatus };
      if (newStatus === "received") {
        updates.received_date = new Date().toISOString().split("T")[0];
      }
      const res = await fetch("/api/fabrication-orders", {
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
