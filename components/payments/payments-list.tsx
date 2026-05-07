"use client";

// ----------------------------------------------------------------------------
// Compact list of payments rendered inside the invoice detail page.
//
// Includes per-row Edit and Delete actions. "Record Payment" trigger lives
// here too so the whole payment surface is self-contained.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const METHOD_LABELS: Record<string, string> = {
  cheque: "Cheque",
  wire: "Wire",
  eft: "EFT",
  credit_card: "Credit Card",
};

export interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  payments: PaymentRow[];
  /**
   * If true, hide the "Record Payment" button (e.g. invoice cancelled or
   * fully paid). Edit/delete remain enabled because corrections may still
   * be needed.
   */
  recordingDisabled?: boolean;
  invoiceCurrency?: "CAD" | "USD";
}

export function PaymentsList({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  payments,
  recordingDisabled,
  invoiceCurrency = "CAD",
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = invoiceTotal - totalPaid;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(p: PaymentRow) {
    setEditing(p);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/payments/${deletingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Delete failed"
        );
      }
      setDeletingId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete payment"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {payments.length === 0 ? (
            <span>No payments recorded yet.</span>
          ) : (
            <span>
              {formatCurrency(totalPaid)} paid of{" "}
              {formatCurrency(invoiceTotal)}
              {outstanding > 0 && (
                <span className="ml-2 text-red-600">
                  ({formatCurrency(outstanding)} outstanding)
                </span>
              )}
            </span>
          )}
        </div>
        {!recordingDisabled && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Record Payment
          </Button>
        )}
      </div>

      {payments.length > 0 && (
        <div className="space-y-1">
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono font-medium text-green-700">
                  {formatCurrency(Number(p.amount))}
                </span>
                <span className="text-gray-500">
                  {formatDate(p.payment_date)}
                </span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                </span>
                {p.reference_number && (
                  <span className="font-mono text-xs text-gray-500">
                    Ref: {p.reference_number}
                  </span>
                )}
                {p.notes && (
                  <span className="max-w-xs truncate text-xs text-gray-400">
                    {p.notes}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(p)}
                  aria-label="Edit payment"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setDeleteError(null);
                    setDeletingId(p.id);
                  }}
                  aria-label="Delete payment"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecordPaymentDialog
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        invoiceTotal={invoiceTotal}
        paidSoFar={totalPaid}
        invoiceCurrency={invoiceCurrency}
        editPayment={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <AlertDialog
        open={!!deletingId}
        onOpenChange={(o) => {
          if (!o) {
            setDeletingId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the payment record and adjust the
              invoice balance. This cannot be undone.
              {deleteError && (
                <span className="mt-2 block text-sm font-medium text-red-600">
                  {deleteError}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
