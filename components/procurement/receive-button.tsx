"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiveButtonProps {
  procurementId: string;
  lineId: string;
  totalQty: number;
}

export function ReceiveButton({
  procurementId,
  lineId,
  totalQty,
}: ReceiveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReceive() {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurements/${procurementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: lineId,
          qty_received: totalQty,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to mark as received");
      }

      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Receive failed:", err);
      alert(err instanceof Error ? err.message : "Failed to mark as received");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={handleReceive}
    >
      <PackageCheck className="mr-1 h-3 w-3" />
      {loading ? "..." : "Receive"}
    </Button>
  );
}
