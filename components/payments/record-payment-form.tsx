"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayMontreal } from "@/lib/utils/format";

const PAYMENT_METHODS = [
  { value: "cheque", label: "Cheque" },
  { value: "wire", label: "Wire Transfer" },
  { value: "eft", label: "EFT" },
  { value: "credit_card", label: "Credit Card" },
] as const;

interface RecordPaymentFormProps {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  totalPaid: number;
}

export function RecordPaymentForm({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  totalPaid,
}: RecordPaymentFormProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayMontreal());
  const [paymentMethod, setPaymentMethod] = useState("cheque");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const outstanding = invoiceTotal - totalPaid;

  async function handleSubmit() {
    if (!amount || !paymentDate || !paymentMethod) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          amount: parseFloat(amount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference_number: referenceNumber || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to record payment"
        );
      }
      setShowForm(false);
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  if (outstanding <= 0 && !showForm) return null;

  return (
    <div>
      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)}>
          Record Payment
        </Button>
      ) : (
        <Card className="max-w-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Record Payment for {invoiceNumber}
            </CardTitle>
            <p className="text-xs text-gray-500">
              Outstanding: ${outstanding.toFixed(2)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="payment-amount">Amount ($)</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={outstanding.toFixed(2)}
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v ?? "")}
              >
                <SelectTrigger id="payment-method" className="mt-1 w-full">
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
              <Label htmlFor="payment-ref">Reference # (optional)</Label>
              <Input
                id="payment-ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque #, transaction ref..."
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <textarea
                id="payment-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Optional notes..."
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={saving || !amount || !paymentDate}
                onClick={handleSubmit}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {saving ? "Saving..." : "Confirm Payment"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setShowForm(false)}
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
