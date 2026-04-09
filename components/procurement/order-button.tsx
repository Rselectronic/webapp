"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderButtonProps {
  procurementId: string;
  lineId: string;
}

export function OrderButton({ procurementId, lineId }: OrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleOrder() {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurements/${procurementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "order_line",
          line_id: lineId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to mark as ordered");
      }

      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Order failed:", err);
      alert(err instanceof Error ? err.message : "Failed to mark as ordered");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={handleOrder}
    >
      <ShoppingCart className="mr-1 h-3 w-3" />
      {loading ? "..." : "Order"}
    </Button>
  );
}
