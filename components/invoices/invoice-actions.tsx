"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAYMENT_METHODS = ["cheque", "wire", "credit_card", "cash"] as const;

interface InvoiceActionsProps {
  invoiceId: string;
  currentStatus: string;
}

export function InvoiceActions({
  invoiceId,
  currentStatus,
}: InvoiceActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<string>("cheque");

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
      // eslint-disable-next-line no-console
      console.error("Invoice status update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordPayment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "paid",
          paid_date: paidDate,
          payment_method: paymentMethod,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to record payment");
      }
      setShowPaymentForm(false);
      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Payment recording failed:", err);
      alert(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {currentStatus === "draft" && (
          <Button size="sm" disabled={loading} onClick={handleMarkSent}>
            {loading ? "Updating..." : "Mark as Sent"}
          </Button>
        )}

        {(currentStatus === "sent" || currentStatus === "overdue") && (
          <Button
            size="sm"
            disabled={loading}
            onClick={() => setShowPaymentForm((prev) => !prev)}
          >
            Record Payment
          </Button>
        )}
      </div>

      {showPaymentForm && (
        <Card className="max-w-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Record Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label
                htmlFor="paid-date"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Payment Date
              </label>
              <input
                id="paid-date"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="payment-method"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Payment Method
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method
                      .replace("_", " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={loading || !paidDate}
                onClick={handleRecordPayment}
              >
                {loading ? "Saving..." : "Confirm Payment"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setShowPaymentForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
