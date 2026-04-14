"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/format";

const STATUS_TRANSITIONS: Record<string, { label: string; next: string }> = {
  draft: { label: "Submit for Review", next: "review" },
  review: { label: "Mark as Sent", next: "sent" },
  sent: { label: "Mark as Accepted", next: "accepted" },
};

interface QuoteTier {
  board_qty: number;
  subtotal: number;
  per_unit: number;
}

interface QuoteActionsProps {
  quoteId: string;
  currentStatus: string;
  /**
   * Available tier options pulled from quote.pricing.tiers.
   * The user must pick one when creating a job. If undefined (old quotes
   * without pricing data), the Create Job button should be disabled.
   */
  tiers?: QuoteTier[];
}

export function QuoteActions({
  quoteId,
  currentStatus,
  tiers,
}: QuoteActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTierIdx, setSelectedTierIdx] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const transition = STATUS_TRANSITIONS[currentStatus];
  const hasTiers = Array.isArray(tiers) && tiers.length > 0;

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

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      // Reset state after close animation
      setTimeout(() => {
        setSelectedTierIdx(null);
        setCreateError(null);
        setCreating(false);
      }, 150);
    }
  }

  async function handleCreateJob() {
    if (selectedTierIdx === null || !tiers) return;
    const tier = tiers[selectedTierIdx];
    if (!tier) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          quantity: tier.board_qty,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create job");
      }
      const job = (await res.json()) as { id: string; job_number: string };
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Job creation failed:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create job"
      );
      setCreating(false);
    }
  }

  return (
    <div className="flex gap-2">
      {transition && (
        <Button size="sm" disabled={loading} onClick={handleAdvance}>
          {loading ? "Updating..." : transition.label}
        </Button>
      )}
      {currentStatus === "accepted" && (
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger
            render={
              <Button
                size="sm"
                disabled={!hasTiers}
                title={
                  !hasTiers
                    ? "This quote has no pricing data — cannot create job."
                    : undefined
                }
              />
            }
          >
            Create Job
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Job from Quote</DialogTitle>
              <DialogDescription>
                Select the quantity tier the customer accepted. This quantity
                will be locked into the job.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-2 sm:grid-cols-2">
              {hasTiers &&
                tiers!.map((tier, idx) => {
                  const isSelected = selectedTierIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedTierIdx(idx)}
                      disabled={creating}
                      className={`cursor-pointer rounded-lg border-2 p-3 text-left transition-colors ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <div className="font-semibold text-base">
                        {tier.board_qty} units
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatCurrency(tier.subtotal)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(tier.per_unit)} / unit
                      </div>
                    </button>
                  );
                })}
            </div>

            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {createError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateJob}
                disabled={creating || selectedTierIdx === null}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Job"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
