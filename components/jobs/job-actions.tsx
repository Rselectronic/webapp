"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const STATUS_TRANSITIONS: Record<string, { label: string; next: string }> = {
  created: { label: "Start Procurement", next: "procurement" },
  procurement: { label: "Mark Parts Ordered", next: "parts_ordered" },
  parts_ordered: { label: "Mark Parts Received", next: "parts_received" },
  parts_received: { label: "Start Production", next: "production" },
  production: { label: "Move to Inspection", next: "inspection" },
  inspection: { label: "Ready to Ship", next: "shipping" },
  shipping: { label: "Mark Delivered", next: "delivered" },
  delivered: { label: "Mark Invoiced", next: "invoiced" },
};

interface JobActionsProps {
  jobId: string;
  currentStatus: string;
}

export function JobActions({ jobId, currentStatus }: JobActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const transition = STATUS_TRANSITIONS[currentStatus];

  async function handleAdvance() {
    if (!transition) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: transition.next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to update job"
        );
      }
      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Job status update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update job");
    } finally {
      setLoading(false);
    }
  }

  if (!transition) return null;

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={loading} onClick={handleAdvance}>
        {loading ? "Updating..." : transition.label}
      </Button>
    </div>
  );
}
