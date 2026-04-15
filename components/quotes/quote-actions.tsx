"use client";

import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
  const [customQty, setCustomQty] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const transition = STATUS_TRANSITIONS[currentStatus];
  const hasTiers = Array.isArray(tiers) && tiers.length > 0;

  // Tiers sorted by board_qty ascending — used to resolve which tier's unit
  // price applies when the customer orders a qty that falls between tiers.
  // Rule: customer gets the unit price of the NEXT LOWER tier (inclusive).
  // If below the smallest tier, use the smallest tier's price.
  const sortedTiers = useMemo(
    () => (tiers ? [...tiers].sort((a, b) => a.board_qty - b.board_qty) : []),
    [tiers]
  );

  // Resolve the effective tier + subtotal for a given custom order quantity.
  function resolveForQty(qty: number): {
    tier: QuoteTier;
    subtotal: number;
    perUnit: number;
  } | null {
    if (sortedTiers.length === 0 || qty <= 0) return null;
    // Find the highest tier whose board_qty <= qty; fall back to smallest tier.
    let matched = sortedTiers[0];
    for (const t of sortedTiers) {
      if (t.board_qty <= qty) matched = t;
    }
    const perUnit = matched.per_unit;
    return {
      tier: matched,
      subtotal: perUnit * qty,
      perUnit,
    };
  }

  const parsedCustomQty = Number.parseInt(customQty, 10);
  const customQtyValid =
    Number.isFinite(parsedCustomQty) && parsedCustomQty > 0;
  const customResolved = customQtyValid ? resolveForQty(parsedCustomQty) : null;

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
        setCustomQty("");
        setCreateError(null);
        setCreating(false);
      }, 150);
    }
  }

  async function handleCreateJob() {
    // Determine effective quantity: custom input takes precedence.
    let effectiveQty: number | null = null;
    if (customQtyValid) {
      effectiveQty = parsedCustomQty;
    } else if (selectedTierIdx !== null && tiers) {
      effectiveQty = tiers[selectedTierIdx]?.board_qty ?? null;
    }
    if (!effectiveQty || effectiveQty <= 0) return;

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          quantity: effectiveQty,
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
                Pick a quoted tier, or enter a custom order quantity below. A
                custom quantity uses the unit price from the next lower tier.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-2 sm:grid-cols-2">
              {hasTiers &&
                tiers!.map((tier, idx) => {
                  const isSelected =
                    !customQtyValid && selectedTierIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedTierIdx(idx);
                        setCustomQty("");
                      }}
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

            {/* Custom quantity entry — for orders that fall between tiers */}
            <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
              <label
                htmlFor="custom-qty-input"
                className="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                Or enter custom order quantity
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="custom-qty-input"
                  type="number"
                  min={1}
                  placeholder="e.g. 75"
                  value={customQty}
                  disabled={creating}
                  onChange={(e) => {
                    setCustomQty(e.target.value);
                    if (e.target.value) setSelectedTierIdx(null);
                  }}
                  className="w-32"
                />
                <span className="text-sm text-gray-500">units</span>
              </div>
              {customQtyValid && customResolved && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Pricing from the{" "}
                  <span className="font-semibold">
                    {customResolved.tier.board_qty}-unit tier
                  </span>{" "}
                  ({formatCurrency(customResolved.perUnit)} / unit) →{" "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(customResolved.subtotal)}
                  </span>{" "}
                  for {parsedCustomQty} units
                </div>
              )}
              {customQty && !customQtyValid && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Enter a positive whole number.
                </p>
              )}
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
                disabled={
                  creating ||
                  (selectedTierIdx === null && !customQtyValid)
                }
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
