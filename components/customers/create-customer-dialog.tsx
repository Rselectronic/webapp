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
import { Plus, X, User, MapPin } from "lucide-react";

interface Contact {
  name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: boolean;
}

interface Address {
  label: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

const emptyContact = (): Contact => ({
  name: "", email: "", phone: "", role: "Sales Rep", is_primary: false,
});

const emptyAddress = (): Address => ({
  label: "", street: "", city: "", province: "", postal_code: "", country: "Canada", is_default: false,
});

export function CreateCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([{ ...emptyContact(), is_primary: true }]);
  const [billingAddresses, setBillingAddresses] = useState<Address[]>([{ ...emptyAddress(), label: "Primary", is_default: true }]);
  const [shippingAddresses, setShippingAddresses] = useState<Address[]>([{ ...emptyAddress(), label: "Primary", is_default: true }]);

  const updateContact = (index: number, field: keyof Contact, value: string | boolean) => {
    setContacts(prev => {
      const next = [...prev];
      if (field === "is_primary" && value === true) {
        next.forEach(c => c.is_primary = false);
      }
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addContact = () => setContacts(prev => [...prev, emptyContact()]);
  const removeContact = (i: number) => {
    if (contacts.length <= 1) return;
    setContacts(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      if (!next.some(c => c.is_primary) && next.length > 0) next[0].is_primary = true;
      return next;
    });
  };

  const updateAddress = (
    type: "billing" | "shipping",
    index: number,
    field: keyof Address,
    value: string | boolean,
  ) => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    setter(prev => {
      const next = [...prev];
      if (field === "is_default" && value === true) {
        next.forEach(a => a.is_default = false);
      }
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addAddress = (type: "billing" | "shipping") => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    setter(prev => [...prev, emptyAddress()]);
  };

  const removeAddress = (type: "billing" | "shipping", i: number) => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    const list = type === "billing" ? billingAddresses : shippingAddresses;
    if (list.length <= 1) return;
    setter(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      if (!next.some(a => a.is_default) && next.length > 0) next[0].is_default = true;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!code || !companyName) {
      setError("Customer code and company name are required.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const validContacts = contacts.filter(c => c.name || c.email || c.phone);
      const validBilling = billingAddresses.filter(a => a.street || a.city);
      const validShipping = shippingAddresses.filter(a => a.street || a.city);

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase().trim(),
          company_name: companyName.trim(),
          contacts: validContacts,
          billing_addresses: validBilling,
          shipping_addresses: validShipping,
          payment_terms: paymentTerms,
          notes: notes.trim() || null,
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

  const renderAddressFields = (
    type: "billing" | "shipping",
    addresses: Address[],
  ) => (
    <div className="space-y-3">
      {addresses.map((addr, i) => (
        <div key={i} className="rounded-md border p-3 space-y-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Address {i + 1}</span>
              {addr.is_default && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">Default</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!addr.is_default && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => updateAddress(type, i, "is_default", true)}>
                  Set default
                </Button>
              )}
              {addresses.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                  onClick={() => removeAddress(type, i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Input placeholder="Label (e.g. HQ, Warehouse)" value={addr.label}
                onChange={e => updateAddress(type, i, "label", e.target.value)} className="text-sm" />
            </div>
            <div className="col-span-2">
              <Input placeholder="Street address" value={addr.street}
                onChange={e => updateAddress(type, i, "street", e.target.value)} className="text-sm" />
            </div>
            <Input placeholder="City" value={addr.city}
              onChange={e => updateAddress(type, i, "city", e.target.value)} className="text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Province" value={addr.province}
                onChange={e => updateAddress(type, i, "province", e.target.value)} className="text-sm" />
              <Input placeholder="Postal" value={addr.postal_code}
                onChange={e => updateAddress(type, i, "postal_code", e.target.value)} className="text-sm" />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => addAddress(type)} className="w-full">
        <Plus className="mr-1 h-3 w-3" /> Add Address
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
        <Plus className="h-4 w-4" />
        New Customer
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Set up a new customer account with contacts and addresses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Customer Code *</label>
                <Input placeholder="e.g. TLAN, LABO" value={code}
                  onChange={e => setCode(e.target.value)} maxLength={10} className="font-mono uppercase" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Payment Terms</label>
                <Input placeholder="Net 30" value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Company Name *</label>
              <Input placeholder="Full company name" value={companyName}
                onChange={e => setCompanyName(e.target.value)} />
            </div>
          </div>

          {/* Contacts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Contacts / Sales Reps ({contacts.length})
            </h3>
            {contacts.map((c, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500">Contact {i + 1}</span>
                    {c.is_primary && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">Primary</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!c.is_primary && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => updateContact(i, "is_primary", true)}>
                        Set primary
                      </Button>
                    )}
                    {contacts.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeContact(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Full name" value={c.name}
                    onChange={e => updateContact(i, "name", e.target.value)} className="text-sm" />
                  <Input placeholder="Role (e.g. Sales Rep, Buyer)" value={c.role}
                    onChange={e => updateContact(i, "role", e.target.value)} className="text-sm" />
                  <Input type="email" placeholder="email@company.com" value={c.email}
                    onChange={e => updateContact(i, "email", e.target.value)} className="text-sm" />
                  <Input placeholder="Phone number" value={c.phone}
                    onChange={e => updateContact(i, "phone", e.target.value)} className="text-sm" />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addContact} className="w-full">
              <Plus className="mr-1 h-3 w-3" /> Add Contact
            </Button>
          </div>

          {/* Billing Addresses */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Billing Addresses ({billingAddresses.length})
            </h3>
            {renderAddressFields("billing", billingAddresses)}
          </div>

          {/* Shipping Addresses */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Shipping Addresses ({shippingAddresses.length})
            </h3>
            {renderAddressFields("shipping", shippingAddresses)}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Notes</label>
            <Textarea placeholder="Any special instructions, BOM format notes, etc."
              value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Creating..." : "Create Customer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
