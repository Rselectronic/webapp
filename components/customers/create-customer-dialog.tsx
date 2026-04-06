"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    payment_terms: "Net 30",
    billing_address: {
      street: "",
      city: "",
      province: "",
      postal_code: "",
      country: "Canada",
    },
    shipping_address: {
      street: "",
      city: "",
      province: "",
      postal_code: "",
      country: "Canada",
      same_as_billing: true,
    },
    notes: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateBilling = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      billing_address: { ...prev.billing_address, [field]: value },
    }));
  };

  const updateShipping = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      shipping_address: { ...prev.shipping_address, [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!form.code || !form.company_name) {
      setError("Customer code and company name are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const shippingAddr = form.shipping_address.same_as_billing
        ? form.billing_address
        : form.shipping_address;

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.toUpperCase().trim(),
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          payment_terms: form.payment_terms,
          billing_address: form.billing_address,
          shipping_address: shippingAddr,
          notes: form.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }

      const data = await res.json();
      setOpen(false);
      router.push(`/customers/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
        <Plus className="h-4 w-4" />
        New Customer
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Set up a new customer account. This is equivalent to adding a row in the Job Queue Admin sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Customer Code (abbreviation) *
                </label>
                <Input
                  placeholder="e.g. TLAN, LABO, CSA"
                  value={form.code}
                  onChange={(e) => updateField("code", e.target.value)}
                  maxLength={10}
                  className="font-mono uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Payment Terms
                </label>
                <Input
                  placeholder="Net 30"
                  value={form.payment_terms}
                  onChange={(e) => updateField("payment_terms", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Company Name *
              </label>
              <Input
                placeholder="Full company name"
                value={form.company_name}
                onChange={(e) => updateField("company_name", e.target.value)}
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Contact Person</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Contact Name
                </label>
                <Input
                  placeholder="First Last"
                  value={form.contact_name}
                  onChange={(e) => updateField("contact_name", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Phone
                </label>
                <Input
                  placeholder="+1 (514) 555-0000"
                  value={form.contact_phone}
                  onChange={(e) => updateField("contact_phone", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Email
              </label>
              <Input
                type="email"
                placeholder="contact@company.com"
                value={form.contact_email}
                onChange={(e) => updateField("contact_email", e.target.value)}
              />
            </div>
          </div>

          {/* Billing Address */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Billing Address</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Street
              </label>
              <Input
                placeholder="123 Main St"
                value={form.billing_address.street}
                onChange={(e) => updateBilling("street", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  City
                </label>
                <Input
                  placeholder="Montreal"
                  value={form.billing_address.city}
                  onChange={(e) => updateBilling("city", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Province
                </label>
                <Input
                  placeholder="QC"
                  value={form.billing_address.province}
                  onChange={(e) => updateBilling("province", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Postal Code
                </label>
                <Input
                  placeholder="H4S 1P9"
                  value={form.billing_address.postal_code}
                  onChange={(e) => updateBilling("postal_code", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Country
              </label>
              <Input
                placeholder="Canada"
                value={form.billing_address.country}
                onChange={(e) => updateBilling("country", e.target.value)}
              />
            </div>
          </div>

          {/* Shipping Address */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Shipping Address</h3>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={form.shipping_address.same_as_billing}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      shipping_address: {
                        ...prev.shipping_address,
                        same_as_billing: e.target.checked,
                      },
                    }))
                  }
                  className="rounded"
                />
                Same as billing
              </label>
            </div>

            {!form.shipping_address.same_as_billing && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Street
                  </label>
                  <Input
                    placeholder="456 Shipping Blvd"
                    value={form.shipping_address.street}
                    onChange={(e) => updateShipping("street", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      City
                    </label>
                    <Input
                      placeholder="City"
                      value={form.shipping_address.city}
                      onChange={(e) => updateShipping("city", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Province
                    </label>
                    <Input
                      placeholder="QC"
                      value={form.shipping_address.province}
                      onChange={(e) => updateShipping("province", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Postal Code
                    </label>
                    <Input
                      placeholder="H4S 1P9"
                      value={form.shipping_address.postal_code}
                      onChange={(e) => updateShipping("postal_code", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Country
                  </label>
                  <Input
                    placeholder="Canada"
                    value={form.shipping_address.country}
                    onChange={(e) => updateShipping("country", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Notes
            </label>
            <Textarea
              placeholder="Any special instructions, BOM format notes, etc."
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Creating..." : "Create Customer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
