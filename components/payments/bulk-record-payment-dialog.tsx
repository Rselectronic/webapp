"use client";

// ----------------------------------------------------------------------------
// BulkRecordPaymentDialog
//
// One cheque from a customer can pay for multiple invoices at once. This
// dialog lets the user:
//   1. Pick the customer (the dialog scopes everything to that customer)
//   2. See all outstanding invoices for that customer (sent + overdue, balance > 0)
//   3. Check off which ones the cheque covers
//   4. Enter total amount + date + method + reference, and have the amount
//      auto-allocated oldest-first across the selected invoices. Per-row
//      amounts are editable so the user can correct the split when needed.
//
// On submit, posts to /api/payments/bulk which inserts one `payments` row per
// invoice, all sharing the same reference (so the customer statement shows
// them as parts of the same cheque).
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
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

// One outstanding invoice row passed into the dialog. Already filtered to
// the chosen customer and to invoices with a positive balance.
export interface BulkOutstandingInvoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_code: string | null;
  customer_company: string | null;
  total: number;
  paid: number;
  balance: number;
  due_date: string | null;
  issued_date: string | null;
}

interface BulkRecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: BulkOutstandingInvoice[];
  /**
   * If set, the customer dropdown is locked to this customer (used when the
   * dialog is launched from a customer detail page). When null/undefined the
   * user picks from any customer that has outstanding invoices.
   */
  lockedCustomerId?: string | null;
  onSuccess?: () => void;
}

export function BulkRecordPaymentDialog({
  open,
  onOpenChange,
  invoices,
  lockedCustomerId,
  onSuccess,
}: BulkRecordPaymentDialogProps) {
  const router = useRouter();

  // Customers represented in the outstanding list.
  const customers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; code: string | null; company: string | null; balance: number }
    >();
    for (const inv of invoices) {
      const prev = map.get(inv.customer_id);
      if (prev) {
        prev.balance += inv.balance;
      } else {
        map.set(inv.customer_id, {
          id: inv.customer_id,
          code: inv.customer_code,
          company: inv.customer_company,
          balance: inv.balance,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "")
    );
  }, [invoices]);

  const [customerId, setCustomerId] = useState<string>(
    lockedCustomerId ?? customers[0]?.id ?? ""
  );
  const [paymentDate, setPaymentDate] = useState(todayMontreal());
  const [paymentMethod, setPaymentMethod] = useState("cheque");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("");

  // Per-invoice selection + amount. amounts keyed by invoice_id.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perRowAmount, setPerRowAmount] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Outstanding rows for the active customer, oldest issued first (so
  // oldest-first auto-allocation makes sense).
  const customerInvoices = useMemo(() => {
    return invoices
      .filter((i) => i.customer_id === customerId && i.balance > 0)
      .sort((a, b) => {
        const ad = a.issued_date ?? "";
        const bd = b.issued_date ?? "";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.invoice_number.localeCompare(b.invoice_number);
      });
  }, [invoices, customerId]);

  // Reset state whenever the dialog opens or customer changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelected(new Set());
    setPerRowAmount({});
    setTotalAmount("");
    setReferenceNumber("");
    setNotes("");
    setPaymentDate(todayMontreal());
    setPaymentMethod("cheque");
  }, [open, customerId]);

  // Auto-distribute the total amount across selected invoices, oldest-first.
  // Each selected invoice grabs up to its balance until the total runs out.
  // This re-runs whenever total or selection changes — but a manual edit on
  // a row freezes that row's amount (we only fill rows whose amount is empty
  // or matches the previous auto-fill). To keep this simple we always
  // overwrite — the user can edit afterward.
  function autoAllocate(total: number, ids: string[]) {
    const next: Record<string, string> = {};
    let remaining = Math.round(total * 100) / 100;
    for (const id of ids) {
      const inv = customerInvoices.find((i) => i.id === id);
      if (!inv) continue;
      if (remaining <= 0) {
        next[id] = "";
        continue;
      }
      const take = Math.min(inv.balance, remaining);
      const rounded = Math.round(take * 100) / 100;
      next[id] = rounded.toFixed(2);
      remaining = Math.round((remaining - rounded) * 100) / 100;
    }
    setPerRowAmount(next);
  }

  function toggleInvoice(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Re-allocate based on the new selection.
      const total = parseFloat(totalAmount);
      if (Number.isFinite(total) && total > 0) {
        autoAllocate(
          total,
          customerInvoices.filter((i) => next.has(i.id)).map((i) => i.id)
        );
      } else {
        // No total entered yet — pre-fill each selected row with its full balance.
        const filled: Record<string, string> = {};
        for (const inv of customerInvoices) {
          if (next.has(inv.id)) filled[inv.id] = inv.balance.toFixed(2);
        }
        setPerRowAmount(filled);
      }
      return next;
    });
  }

  function handleTotalChange(value: string) {
    setTotalAmount(value);
    const total = parseFloat(value);
    if (Number.isFinite(total) && total > 0 && selected.size > 0) {
      autoAllocate(
        total,
        customerInvoices.filter((i) => selected.has(i.id)).map((i) => i.id)
      );
    }
  }

  function handleRowAmountChange(id: string, value: string) {
    setPerRowAmount((prev) => ({ ...prev, [id]: value }));
  }

  // Sum of the currently entered per-row amounts.
  const allocatedSum = useMemo(() => {
    let sum = 0;
    for (const id of selected) {
      const v = parseFloat(perRowAmount[id] ?? "");
      if (Number.isFinite(v)) sum += v;
    }
    return Math.round(sum * 100) / 100;
  }, [selected, perRowAmount]);

  const totalNum = parseFloat(totalAmount);
  const totalEntered = Number.isFinite(totalNum) ? totalNum : 0;
  const allocationDelta = Math.round((totalEntered - allocatedSum) * 100) / 100;

  async function handleSubmit() {
    setError(null);

    if (!customerId) {
      setError("Pick a customer.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one invoice.");
      return;
    }
    if (!paymentDate || !paymentMethod) {
      setError("Date and method are required.");
      return;
    }

    const allocations: Array<{ invoice_id: string; amount: number }> = [];
    for (const id of selected) {
      const v = parseFloat(perRowAmount[id] ?? "");
      if (!Number.isFinite(v) || v <= 0) {
        const inv = customerInvoices.find((i) => i.id === id);
        setError(`Enter an amount for ${inv?.invoice_number ?? "invoice"}.`);
        return;
      }
      allocations.push({ invoice_id: id, amount: Math.round(v * 100) / 100 });
    }

    // Sanity-check vs the total the user typed (if any).
    if (Number.isFinite(totalNum) && totalNum > 0) {
      if (Math.abs(allocationDelta) > 0.01) {
        setError(
          `Allocations sum to ${formatCurrency(allocatedSum)} but total is ${formatCurrency(totalEntered)}. ` +
            `Adjust the rows or change the total.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/payments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_date: paymentDate,
          method: paymentMethod,
          reference: referenceNumber || undefined,
          notes: notes || undefined,
          allocations,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to record payment"
        );
      }
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  const lockedCustomer = lockedCustomerId
    ? customers.find((c) => c.id === lockedCustomerId)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Bulk Payment</DialogTitle>
          <DialogDescription>
            One payment covering multiple invoices for the same customer. Each
            invoice gets its own row in the ledger sharing this reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div>
            <Label htmlFor="brp-customer">Customer</Label>
            {lockedCustomer ? (
              <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                {lockedCustomer.code} — {lockedCustomer.company}
              </p>
            ) : (
              <Select
                value={customerId}
                onValueChange={(v) => setCustomerId(v ?? "")}
                disabled={customers.length === 0}
              >
                <SelectTrigger id="brp-customer" className="mt-1 w-full">
                  <SelectValue placeholder={
                    customers.length === 0
                      ? "No customers with outstanding invoices"
                      : "Select a customer..."
                  }>
                    {(v: string) => {
                      const c = customers.find((c) => c.id === v);
                      if (!c) return "";
                      return `${c.code} — ${c.company} (${formatCurrency(c.balance)} outstanding)`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.company} ({formatCurrency(c.balance)} outstanding)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Common payment fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="brp-total">Total Amount ($)</Label>
              <Input
                id="brp-total"
                type="number"
                step="0.01"
                min="0.01"
                value={totalAmount}
                onChange={(e) => handleTotalChange(e.target.value)}
                placeholder="Cheque amount"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="brp-date">Payment Date</Label>
              <Input
                id="brp-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="brp-method">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v ?? "")}
              >
                <SelectTrigger id="brp-method" className="mt-1 w-full">
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
              <Label htmlFor="brp-ref">Reference (optional)</Label>
              <Input
                id="brp-ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder={REFERENCE_PLACEHOLDERS[paymentMethod] ?? ""}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="brp-notes">Notes (optional)</Label>
            <textarea
              id="brp-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700"
              placeholder="Optional notes..."
            />
          </div>

          {/* Outstanding invoices for the picked customer */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-medium">
                Outstanding invoices ({customerInvoices.length})
              </Label>
              {selected.size > 0 ? (
                <span className="text-xs text-gray-500">
                  Allocated: {formatCurrency(allocatedSum)}
                  {Number.isFinite(totalNum) && totalNum > 0 ? (
                    <>
                      {" "}of <span className="font-mono">{formatCurrency(totalEntered)}</span>
                      {Math.abs(allocationDelta) > 0.01 ? (
                        <span className="ml-1 text-amber-600">
                          (off by {formatCurrency(Math.abs(allocationDelta))})
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>

            {customerInvoices.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                No outstanding invoices for this customer.
              </p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-900">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2 font-medium">Invoice #</th>
                      <th className="px-2 py-2 font-medium">Issued</th>
                      <th className="px-2 py-2 font-medium">Due</th>
                      <th className="px-2 py-2 text-right font-medium">Balance</th>
                      <th className="px-2 py-2 text-right font-medium">Apply ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerInvoices.map((inv) => {
                      const isSelected = selected.has(inv.id);
                      return (
                        <tr
                          key={inv.id}
                          className={`border-t border-gray-100 dark:border-gray-800 ${
                            isSelected ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleInvoice(inv.id)}
                              aria-label={`Apply to ${inv.invoice_number}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {inv.invoice_number}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {inv.issued_date ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {inv.due_date ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {formatCurrency(inv.balance)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={inv.balance}
                              value={perRowAmount[inv.id] ?? ""}
                              onChange={(e) =>
                                handleRowAmountChange(inv.id, e.target.value)
                              }
                              disabled={!isSelected}
                              className="ml-auto h-8 w-24 text-right font-mono"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
            disabled={
              saving ||
              selected.size === 0 ||
              !paymentDate ||
              customerInvoices.length === 0
            }
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving
              ? "Saving..."
              : `Record ${formatCurrency(allocatedSum)} across ${selected.size} invoice${
                  selected.size === 1 ? "" : "s"
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
