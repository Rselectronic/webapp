"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  SUPPLIER_CATEGORIES,
  SUPPLIER_CURRENCIES,
  SUPPLIER_CODE_REGEX,
  categoryLabel,
  type Supplier,
  type SupplierCategory,
  type SupplierCurrency,
} from "@/lib/suppliers/types";
import { PaymentTermsInput } from "./payment-terms-input";

interface SupplierWithCount extends Supplier {
  contact_count: number;
  // Mirrors the list-client shape — a fresh supplier has no contacts yet,
  // so this is always null at create time. Kept on the type so callbacks
  // up the tree can prepend the new row to the existing list.
  primary_contact: { name: string; email: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (s: SupplierWithCount) => void;
}

export function AddSupplierDialog({ open, onOpenChange, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [category, setCategory] = useState<SupplierCategory | "">("");
  const [currency, setCurrency] = useState<SupplierCurrency>("CAD");
  // payment_terms is now a multi-value field. State holds an array of
  // chips; the form sends `null` if empty or the array as-is.
  const [paymentTerms, setPaymentTerms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCode("");
    setLegalName("");
    setCategory("");
    setCurrency("CAD");
    setPaymentTerms([]);
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!SUPPLIER_CODE_REGEX.test(code.toUpperCase().trim())) {
      toast.error("Code must be 2-15 uppercase letters/digits");
      return;
    }
    if (!legalName.trim()) {
      toast.error("Legal name is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase().trim(),
          legal_name: legalName.trim(),
          category: category || null,
          default_currency: currency,
          payment_terms: paymentTerms.length > 0 ? paymentTerms : null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Create failed");

      onCreated({
        id: j.id,
        code: j.code,
        legal_name: j.legal_name,
        category: category || null,
        default_currency: currency,
        payment_terms: paymentTerms.length > 0 ? paymentTerms : null,
        billing_address: {},
        is_approved: !!j.is_approved,
        online_only: false,
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contact_count: 0,
        primary_contact: null,
      });
      toast.success(`Supplier ${j.code} created — pending approval`);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>
            New suppliers start as <strong>pending</strong>. The CEO must approve
            them before they can be selected on a PO.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sup-code">Code *</Label>
              <Input
                id="sup-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="DIGIKEY"
                maxLength={15}
                required
              />
              <p className="mt-1 text-xs text-gray-500">2-15 uppercase letters/digits</p>
            </div>
            <div>
              <Label htmlFor="sup-currency">Default currency</Label>
              <Select
                value={currency}
                onValueChange={(v) => v && setCurrency(v as SupplierCurrency)}
              >
                <SelectTrigger id="sup-currency" className="mt-1 w-full">
                  <SelectValue>{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="sup-name">Legal name *</Label>
            <Input
              id="sup-name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="DigiKey Electronics"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sup-cat">Category</Label>
              <Select
                value={category || "__none__"}
                onValueChange={(v) =>
                  setCategory(
                    v == null || v === "__none__"
                      ? ""
                      : (v as SupplierCategory)
                  )
                }
              >
                <SelectTrigger id="sup-cat" className="mt-1 w-full">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__none__") return "— select —";
                      return categoryLabel(v as SupplierCategory);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— select —</SelectItem>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sup-terms">Payment terms</Label>
              <PaymentTermsInput
                id="sup-terms"
                value={paymentTerms}
                onChange={setPaymentTerms}
                placeholder="Net 30, Credit Card…"
              />
              <p className="mt-1 text-xs text-gray-500">
                Press Enter or comma to add. Multiple terms allowed.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="sup-notes">Notes</Label>
            <Textarea
              id="sup-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
