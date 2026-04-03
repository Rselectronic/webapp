"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const STATUS_TRANSITIONS: Record<string, { label: string; next: string }> = {
  draft: { label: "Submit for Review", next: "review" },
  review: { label: "Mark as Sent", next: "sent" },
  sent: { label: "Mark as Accepted", next: "accepted" },
};

interface QuoteActionsProps {
  quoteId: string;
  currentStatus: string;
}

export function QuoteActions({ quoteId, currentStatus }: QuoteActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const transition = STATUS_TRANSITIONS[currentStatus];
  if (!transition) return null;

  async function handleAdvance() {
    if (!transition) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: transition.next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update quote");
      }
      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Quote status update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update quote");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" disabled={loading} onClick={handleAdvance}>
      {loading ? "Updating..." : transition.label}
    </Button>
  );
}
