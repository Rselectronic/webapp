"use client";

// ----------------------------------------------------------------------------
// components/production/release-to-shipping-dialog.tsx
// Lets the operator release a batch of finished boards into the
// "ready to ship" pool for a job. Default mode is INCREMENT (POST):
// "20 more boards are now done" -> ready_to_ship_qty += 20. A subtle
// pencil affordance flips into ABSOLUTE mode (PATCH): "actually it's 20,
// not 30" -> ready_to_ship_qty := 20. Server (Agent 1) auto-advances
// the job to status='shipping' when ready_to_ship_qty == quantity.
// ----------------------------------------------------------------------------

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, PackageCheck, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobNumber: string;
  jobQuantity: number;
  alreadyReleased: number;
  alreadyShipped: number;
  /** Called with the new authoritative `ready_to_ship_qty` after a
   *  successful submit. Parent uses this to update local kanban state
   *  optimistically (mirrors `latest_event` pattern). */
  onSuccess: (newReleasedQty: number) => void;
}

type Mode = "increment" | "absolute";

export function ReleaseToShippingDialog({
  open,
  onOpenChange,
  jobId,
  jobNumber,
  jobQuantity,
  alreadyReleased,
  alreadyShipped,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>("increment");
  // Increment mode default: the unreleased remainder. Most common case is
  // "we just finished the last batch, release everything that's left."
  const remainder = Math.max(0, jobQuantity - alreadyReleased);
  const [incrementValue, setIncrementValue] = useState<string>(
    String(remainder),
  );
  const [absoluteValue, setAbsoluteValue] = useState<string>(
    String(alreadyReleased),
  );
  const [submitting, setSubmitting] = useState(false);

  // Reset inputs whenever the dialog re-opens against new job data.
  // Cheap to recompute, avoids stale defaults when reusing the dialog.
  const resetForJob = () => {
    setMode("increment");
    setIncrementValue(String(Math.max(0, jobQuantity - alreadyReleased)));
    setAbsoluteValue(String(alreadyReleased));
  };

  const parsedIncrement = useMemo(() => {
    const n = Number(incrementValue);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  }, [incrementValue]);

  const parsedAbsolute = useMemo(() => {
    const n = Number(absoluteValue);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  }, [absoluteValue]);

  const incrementValid =
    parsedIncrement != null &&
    parsedIncrement > 0 &&
    parsedIncrement <= remainder;

  // Absolute mode constraint: cannot drop below shipped count (those
  // boards are already out the door — releasing fewer than that would
  // be nonsense). Can equal alreadyShipped (e.g. a full undo of an
  // unshipped release).
  const absoluteValid =
    parsedAbsolute != null &&
    parsedAbsolute >= alreadyShipped &&
    parsedAbsolute <= jobQuantity;

  const newTotal =
    mode === "increment"
      ? alreadyReleased + (parsedIncrement ?? 0)
      : (parsedAbsolute ?? alreadyReleased);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (mode === "increment") {
      if (!incrementValid) {
        toast.error(
          `Enter a positive integer between 1 and ${remainder}`,
        );
        return;
      }
    } else {
      if (!absoluteValid) {
        toast.error(
          `Value must be between ${alreadyShipped} (already shipped) and ${jobQuantity}`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = `/api/jobs/${jobId}/release-to-shipping`;
      const res =
        mode === "increment"
          ? await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ release_qty: parsedIncrement }),
            })
          : await fetch(url, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ready_to_ship_qty: parsedAbsolute }),
            });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error ?? "Failed to release boards");
      }

      // Trust the server's returned value if present, otherwise fall back
      // to our locally computed new total.
      const authoritative =
        typeof j.ready_to_ship_qty === "number"
          ? j.ready_to_ship_qty
          : newTotal;

      onSuccess(authoritative);
      if (mode === "increment") {
        toast.success(
          `Released ${parsedIncrement} board${parsedIncrement === 1 ? "" : "s"}`,
          { description: `${jobNumber} — ${authoritative}/${jobQuantity} ready to ship` },
        );
      } else {
        toast.success(
          `Released count set to ${parsedAbsolute}`,
          { description: jobNumber },
        );
      }
      resetForJob();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to release boards",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForJob();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Release boards to shipping
          </DialogTitle>
          <DialogDescription>
            {jobNumber} — {alreadyReleased} of {jobQuantity} already
            released; {alreadyShipped} already shipped.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "increment" ? (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="release-qty">
                  How many boards are now ready to ship?
                </Label>
                <button
                  type="button"
                  onClick={() => setMode("absolute")}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  title="Set absolute released count (undo / correction)"
                >
                  <Pencil className="h-3 w-3" />
                  Set absolute
                </button>
              </div>
              <Input
                id="release-qty"
                type="number"
                step={1}
                min={1}
                max={remainder}
                value={incrementValue}
                onChange={(e) => setIncrementValue(e.target.value)}
                disabled={remainder === 0}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {remainder === 0 ? (
                  <span>All {jobQuantity} boards already released.</span>
                ) : (
                  <>
                    New total released:{" "}
                    <span className="font-medium text-foreground">
                      {newTotal} of {jobQuantity}
                    </span>
                    {newTotal === jobQuantity && (
                      <span className="ml-2 text-green-600 dark:text-green-400">
                        (job will move to Ready-to-Ship)
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="release-abs">
                  Set total released count
                </Label>
                <button
                  type="button"
                  onClick={() => setMode("increment")}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Back to increment
                </button>
              </div>
              <Input
                id="release-abs"
                type="number"
                step={1}
                min={alreadyShipped}
                max={jobQuantity}
                value={absoluteValue}
                onChange={(e) => setAbsoluteValue(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be between{" "}
                <span className="font-medium text-foreground">
                  {alreadyShipped}
                </span>{" "}
                (already shipped) and{" "}
                <span className="font-medium text-foreground">
                  {jobQuantity}
                </span>{" "}
                (job quantity).
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                (mode === "increment" ? !incrementValid : !absoluteValid)
              }
            >
              {submitting
                ? "Releasing…"
                : mode === "increment"
                  ? `Release ${parsedIncrement ?? 0} board${
                      parsedIncrement === 1 ? "" : "s"
                    }`
                  : `Set to ${parsedAbsolute ?? 0}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
