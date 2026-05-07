"use client";

// ----------------------------------------------------------------------------
// components/inventory/manual-adjust-dialog.tsx
// "Manual adjustment" dialog. Lets the operator post a signed-delta movement
// against an inventory part. Parent passes onAdjusted so it can patch the
// movements table inline (no full refetch — see CLAUDE.md / recent feedback).
// ----------------------------------------------------------------------------

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type InventoryMovement,
  type InventoryMovementKind,
} from "@/lib/inventory/types";

// Only the manual-entry kinds are valid here. Procurement-driven kinds
// (buy_for_proc / consume_proc) are written by the system, not the operator.
const MANUAL_KINDS: InventoryMovementKind[] = [
  "manual_adjust",
  "buy_external",
  "safety_topup",
];

function kindLabel(k: InventoryMovementKind): string {
  switch (k) {
    case "manual_adjust":
      return "Manual adjustment";
    case "buy_external":
      return "Bought (external — not on a PROC)";
    case "safety_topup":
      return "Safety stock top-up";
    default:
      return k;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partId: string;
  currentPhysicalQty: number;
  onAdjusted: (movement: InventoryMovement) => void;
}

export function ManualAdjustDialog({
  open,
  onOpenChange,
  partId,
  currentPhysicalQty,
  onAdjusted,
}: Props) {
  const [kind, setKind] = useState<InventoryMovementKind>("manual_adjust");
  const [delta, setDelta] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setKind("manual_adjust");
    setDelta("");
    setNotes("");
  }

  const parsedDelta = (() => {
    if (!delta.trim()) return null;
    const n = Number(delta);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  })();

  const previewAfter =
    parsedDelta != null ? currentPhysicalQty + parsedDelta : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (parsedDelta == null || parsedDelta === 0) {
      toast.error("Delta must be a non-zero integer (use negative for removal)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${partId}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          delta: parsedDelta,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Adjustment failed");

      // The API should return the inserted movement row. Fall back to a
      // synthesized record if it doesn't, so the UI still updates inline.
      const movement: InventoryMovement =
        j.movement ??
        j ??
        ({
          id: crypto.randomUUID(),
          inventory_part_id: partId,
          delta: parsedDelta,
          kind,
          proc_id: null,
          po_id: null,
          job_id: null,
          qty_before: currentPhysicalQty,
          qty_after: currentPhysicalQty + parsedDelta,
          notes: notes.trim() || null,
          created_by: null,
          created_at: new Date().toISOString(),
        } as InventoryMovement);

      onAdjusted(movement);
      toast.success(
        parsedDelta > 0
          ? `Added ${parsedDelta} unit${parsedDelta === 1 ? "" : "s"}`
          : `Removed ${Math.abs(parsedDelta)} unit${parsedDelta === -1 ? "" : "s"}`,
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual stock adjustment</DialogTitle>
          <DialogDescription>
            Use a positive delta to add stock, negative to remove. The
            adjustment is recorded in the movement ledger.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="adj-kind">Kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => v && setKind(v as InventoryMovementKind)}
            >
              <SelectTrigger id="adj-kind" className="mt-1 w-full">
                <SelectValue>
                  {(v: string) => v ? kindLabel(v as InventoryMovementKind) : ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MANUAL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {kindLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="adj-delta">Delta (signed integer)</Label>
            <Input
              id="adj-delta"
              type="number"
              step={1}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 50 or -3"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Current physical: <span className="font-medium">{currentPhysicalQty}</span>
              {previewAfter != null && (
                <>
                  {" → after: "}
                  <span
                    className={`font-medium ${
                      previewAfter < 0 ? "text-red-600" : "text-gray-900"
                    }`}
                  >
                    {previewAfter}
                  </span>
                </>
              )}
            </p>
          </div>

          <div>
            <Label htmlFor="adj-notes">Notes</Label>
            <Textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional — what / why"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Record adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
