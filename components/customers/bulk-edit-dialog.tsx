"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_PAYMENT_TERMS = [
  "Net 30",
  "Net 15",
  "Net 45",
  "Net 60",
  "Due on receipt",
  "Prepaid",
];

type Field = "is_active" | "payment_terms";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  /** Pre-selects which field is being edited so the dialog opens with focus
   *  on the relevant input. */
  field: Field;
  onSuccess?: () => void;
}

export function BulkEditDialog({ open, onOpenChange, selectedIds, field, onSuccess }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isActive, setIsActive] = useState<"true" | "false">("true");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [paymentTermsOptions, setPaymentTermsOptions] = useState<string[]>(DEFAULT_PAYMENT_TERMS);

  // Pull the canonical payment terms list from /api/settings (admin-managed
  // dropdown). Falls back to defaults if the endpoint isn't there.
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings?key=payment_terms")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setPaymentTermsOptions(data);
      })
      .catch(() => {
        // already defaulted
      });
  }, [open]);

  // Reset error/saving when reopening
  useEffect(() => {
    if (open) {
      setError(null);
      setSaving(false);
    }
  }, [open, field]);

  async function handleApply() {
    setSaving(true);
    setError(null);

    const updates: Record<string, unknown> = {};
    if (field === "is_active") updates.is_active = isActive === "true";
    if (field === "payment_terms") updates.payment_terms = paymentTerms;

    try {
      const res = await fetch("/api/customers/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  const title =
    field === "is_active"
      ? `Change status for ${selectedIds.length} customer${selectedIds.length === 1 ? "" : "s"}`
      : `Set payment terms for ${selectedIds.length} customer${selectedIds.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This change applies to all selected customers. The previous values are recorded in the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {field === "is_active" && (
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsActive("true")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    isActive === "true"
                      ? "border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-300"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive("false")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    isActive === "false"
                      ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>
          )}

          {field === "payment_terms" && (
            <div className="space-y-2">
              <Label htmlFor="bulk-payment-terms">Payment terms</Label>
              <Select
                value={paymentTerms}
                onValueChange={(v) => setPaymentTerms(v ?? "")}
              >
                <SelectTrigger id="bulk-payment-terms" className="w-full">
                  <SelectValue>{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={saving || selectedIds.length === 0}>
            {saving ? "Applying…" : `Apply to ${selectedIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
