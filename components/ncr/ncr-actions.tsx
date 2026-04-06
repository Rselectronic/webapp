"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const STATUS_TRANSITIONS: Record<string, { next: string; label: string }[]> = {
  open: [{ next: "investigating", label: "Start Investigation" }],
  investigating: [
    { next: "corrective_action", label: "Move to Corrective Action" },
  ],
  corrective_action: [{ next: "closed", label: "Close NCR" }],
  closed: [],
};

interface NCRActionsProps {
  ncrId: string;
  currentStatus: string;
}

export function NCRActions({ ncrId, currentStatus }: NCRActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const transitions = STATUS_TRANSITIONS[currentStatus] ?? [];

  async function handleTransition(newStatus: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/ncr/${ncrId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update NCR");
      }
      router.refresh();
    } catch (err) {
      console.error("NCR status update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update NCR");
    } finally {
      setLoading(false);
    }
  }

  if (transitions.length === 0) return null;

  return (
    <div className="flex gap-2">
      {transitions.map((t) => (
        <Button
          key={t.next}
          size="sm"
          disabled={loading}
          onClick={() => handleTransition(t.next)}
        >
          {loading ? "Updating..." : t.label}
        </Button>
      ))}
    </div>
  );
}
