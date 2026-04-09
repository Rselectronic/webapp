"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderAllButtonProps {
  procurementId: string;
  pendingCount: number;
}

export function OrderAllButton({
  procurementId,
  pendingCount,
}: OrderAllButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (pendingCount === 0) return null;

  async function handleOrderAll() {
    if (
      !confirm(
        `Mark all ${pendingCount} pending lines as ordered?`
      )
    )
      return;

    setLoading(true);
    try {
      const res = await fetch(`/api/procurements/${procurementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "order_all" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to mark all as ordered");
      }

      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Order all failed:", err);
      alert(
        err instanceof Error ? err.message : "Failed to mark all as ordered"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleOrderAll} disabled={loading} size="sm" variant="default">
      <ShoppingCart className="mr-2 h-4 w-4" />
      {loading
        ? "Ordering..."
        : `Mark All as Ordered (${pendingCount})`}
    </Button>
  );
}
