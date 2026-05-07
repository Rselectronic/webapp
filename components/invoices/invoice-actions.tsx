"use client";

// ----------------------------------------------------------------------------
// invoice-actions.tsx
//
// Header action row on the invoice detail page. "Mark as Sent",
// "Record Payment" (opens the modal RecordPaymentDialog), "Cancel
// Invoice". The Record Payment used to expand inline which stretched the
// flex row and made the Delete button next to it grow taller; the modal
// keeps the row tight.
//
// All payments now go through /api/payments (the partial-payment API
// added in migration 101). The legacy /api/invoices PATCH path with
// {status: 'paid', paid_date, payment_method} is no longer used here —
// it bypassed the payments table and produced phantom-paid invoices
// without payment events to back them.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";

interface InvoiceActionsProps {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  paidSoFar: number;
  currentStatus: string;
  invoiceCurrency?: "CAD" | "USD";
}

export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  paidSoFar,
  currentStatus,
  invoiceCurrency = "CAD",
}: InvoiceActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  async function handleMarkSent() {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update invoice");
      }
      router.refresh();
    } catch (err) {
      console.error("Invoice status update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      currentStatus === "paid"
        ? "This invoice is marked as paid. Cancelling it will NOT reverse any recorded payment. Continue?"
        : "Cancel this invoice? It can be re-opened later by changing the status."
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to cancel invoice");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel invoice");
    } finally {
      setLoading(false);
    }
  }

  const recordingDisabled =
    currentStatus === "cancelled" || paidSoFar >= invoiceTotal;

  return (
    <>
      <div className="flex items-start gap-2">
        {currentStatus === "draft" && (
          <Button size="sm" disabled={loading} onClick={handleMarkSent}>
            {loading ? "Updating..." : "Mark as Sent"}
          </Button>
        )}

        {(currentStatus === "sent" || currentStatus === "overdue") && (
          <Button
            size="sm"
            disabled={loading || recordingDisabled}
            onClick={() => setPaymentDialogOpen(true)}
          >
            Record Payment
          </Button>
        )}

        {currentStatus !== "cancelled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={handleCancel}
          >
            {loading ? "Cancelling..." : "Cancel Invoice"}
          </Button>
        )}
      </div>

      <RecordPaymentDialog
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        invoiceTotal={invoiceTotal}
        paidSoFar={paidSoFar}
        invoiceCurrency={invoiceCurrency}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={() => {
          setPaymentDialogOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
