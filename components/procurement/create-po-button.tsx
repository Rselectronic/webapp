"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProcLine {
  id: string;
  mpn: string;
  supplier: string | null;
  order_status: string;
}

interface CreatePOButtonProps {
  procurementId: string;
  lines: ProcLine[];
}

export function CreatePOButton({ procurementId, lines }: CreatePOButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Only include pending lines
  const pendingLines = lines.filter((l) => l.order_status === "pending");

  if (pendingLines.length === 0) {
    return null;
  }

  // Group pending lines by supplier (default to "DigiKey" when no supplier set)
  const grouped = new Map<string, string[]>();
  for (const line of pendingLines) {
    const supplier = line.supplier || "DigiKey";
    const existing = grouped.get(supplier) ?? [];
    existing.push(line.id);
    grouped.set(supplier, existing);
  }

  async function handleCreate() {
    setLoading(true);
    try {
      // Create one PO per supplier group
      for (const [supplierName, lineIds] of grouped) {
        const res = await fetch("/api/supplier-pos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            procurement_id: procurementId,
            supplier_name: supplierName,
            line_ids: lineIds,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error ?? `Failed to create PO for ${supplierName}`
          );
        }
      }

      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Create PO failed:", err);
      alert(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setLoading(false);
    }
  }

  const supplierCount = grouped.size;
  const label =
    supplierCount === 1
      ? `Create PO (${pendingLines.length} lines)`
      : `Create ${supplierCount} POs (${pendingLines.length} lines)`;

  return (
    <Button onClick={handleCreate} disabled={loading} size="sm">
      <ShoppingCart className="mr-2 h-4 w-4" />
      {loading ? "Creating..." : label}
    </Button>
  );
}
