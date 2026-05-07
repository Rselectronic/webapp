"use client";

// ----------------------------------------------------------------------------
// Record / edit payment dialog
//
// Used in two modes:
//   - create: opened from the invoice detail page, posts to /api/payments
//   - edit:   opened from a row in <PaymentsList>, PATCHes /api/payments/[id]
//
// Amount defaults to the invoice's outstanding balance for new payments.
// Reference field placeholder adapts to the chosen method.
// ----------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, todayMontreal } from "@/lib/utils/format";

const PAYMENT_METHODS = [
  { value: "cheque", label: "Cheque" },
  { value: "wire", label: "Wire Transfer" },
  { value: "eft", label: "EFT" },
  { value: "credit_card", label: "Credit Card" },
] as const;

const REFERENCE_PLACEHOLDERS: Record<string, string> = {
  cheque: "Cheque #12345",
  wire: "Wire ref / SWIFT",
  eft: "EFT confirmation #",
  credit_card: "Auth code / last 4",
};

export interface RecordPaymentDialogProps {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  paidSoFar: number;
  /** Invoice's currency — payments inherit this. Defaults to CAD if absent. */
  invoiceCurrency?: "CAD" | "USD";
  /**
   * If provided, dialog opens in edit mode for this payment.
   */
  editPayment?: {
    id: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    reference_number: string | null;
    notes: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  paidSoFar,
  invoiceCurrency = "CAD",
  editPayment,
  open,
  onOpenChange,
  onSuccess,
}: RecordPaymentDialogProps) {
  const router = useRouter();
  const isEdit = !!editPayment;

  // Outstanding before this edit. When editing, exclude this payment from
  // paidSoFar so the user can change the amount within sane bounds.
  const outstandingBeforeEdit =
    invoiceTotal - paidSoFar + (editPayment?.amount ?? 0);
  const defaultAmount = isEdit
    ? editPayment!.amount.toFixed(2)
    : Math.max(0, outstandingBeforeEdit).toFixed(2);

  const [amount, setAmount] = useState(defaultAmount);
  const [paymentDate, setPaymentDate] = useState(
    editPayment?.payment_date ?? todayMontreal()
  );
  const [paymentMethod, setPaymentMethod] = useState(
    editPayment?.payment_method ?? "cheque"
  );
  const [referenceNumber, setReferenceNumber] = useState(
    editPayment?.reference_number ?? ""
  );
  const [notes, setNotes] = useState(editPayment?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever dialog opens / context changes.
  useEffect(() => {
    if (open) {
      setAmount(defaultAmount);
      setPaymentDate(
        editPayment?.payment_date ?? todayMontreal()
      );
      setPaymentMethod(editPayment?.payment_method ?? "cheque");
      setReferenceNumber(editPayment?.reference_number ?? "");
      setNotes(editPayment?.notes ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editPayment?.id]);

  async function handleSubmit() {
    if (!amount || !paymentDate || !paymentMethod) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The API expects `method` / `reference` (column names per migration
      // 101). The dialog's internal state still uses paymentMethod /
      // referenceNumber for legibility.
      const body = {
        amount: amt,
        payment_date: paymentDate,
        method: paymentMethod,
        reference: referenceNumber || undefined,
        notes: notes || undefined,
      };

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/payments/${editPayment!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice_id: invoiceId, ...body }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to save payment"
        );
      }
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payment");
    } finally {
      setSaving(false);
    }
  }

  const remaining = Math.max(0, outstandingBeforeEdit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Payment" : "Record Payment"} — {invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            Outstanding before this entry:{" "}
            <span className="font-mono">
              {formatCurrency(remaining)} {invoiceCurrency}
            </span>{" "}
            of{" "}
            <span className="font-mono">
              {formatCurrency(invoiceTotal)} {invoiceCurrency}
            </span>
            {invoiceCurrency === "USD" ? (
              <span className="block pt-1 text-xs text-amber-600">
                USD invoice — payment is recorded in USD; the FX rate at
                payment date is captured for your books.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="rp-amount">Amount ({invoiceCurrency})</Label>
            <Input
              id="rp-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 font-mono"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="rp-date">Payment Date</Label>
            <Input
              id="rp-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="rp-method">Payment Method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v ?? "")}
            >
              <SelectTrigger id="rp-method" className="mt-1 w-full">
                <SelectValue>
                  {(v: string) =>
                    PAYMENT_METHODS.find((m) => m.value === v)?.label ?? ""
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rp-ref">Reference (optional)</Label>
            <Input
              id="rp-ref"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={REFERENCE_PLACEHOLDERS[paymentMethod] ?? ""}
              className="mt-1 font-mono"
            />
          </div>

          <div>
            <Label htmlFor="rp-notes">Notes (optional)</Label>
            <textarea
              id="rp-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700"
              placeholder="Optional notes..."
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={saving || !amount || !paymentDate}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
