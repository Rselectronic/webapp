"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Plus, Trash2, X } from "lucide-react";

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

interface CustomerEditFormProps {
  customerId: string;
  initialData: {
    company_name: string;
    code: string;
    payment_terms: string;
    notes: string | null;
    is_active: boolean;
    contacts: Contact[];
    billing_addresses: Address[];
    shipping_addresses: Address[];
    bom_config: Record<string, unknown> | null;
  };
  onClose: () => void;
}

const emptyContact: Contact = { name: "", email: "", phone: "", role: "", is_primary: false };
const emptyAddress: Address = { label: "", street: "", city: "", province: "", postal_code: "", country: "Canada", is_default: false };

export function CustomerEditForm({ customerId, initialData, onClose }: CustomerEditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(initialData.company_name);
  const [paymentTerms, setPaymentTerms] = useState(initialData.payment_terms);
  const [notes, setNotes] = useState(initialData.notes ?? "");
  const [isActive, setIsActive] = useState(initialData.is_active);
  const [contacts, setContacts] = useState<Contact[]>(
    initialData.contacts.length > 0 ? initialData.contacts : [{ ...emptyContact, is_primary: true }]
  );
  const [billingAddresses, setBillingAddresses] = useState<Address[]>(initialData.billing_addresses);
  const [shippingAddresses, setShippingAddresses] = useState<Address[]>(initialData.shipping_addresses);
  const [bomConfigJson, setBomConfigJson] = useState(
    initialData.bom_config ? JSON.stringify(initialData.bom_config, null, 2) : ""
  );

  const updateContact = (index: number, field: keyof Contact, value: string | boolean) => {
    setContacts(prev => prev.map((c, i) => {
      if (i !== index) return field === "is_primary" && value === true ? { ...c, is_primary: false } : c;
      return { ...c, [field]: value };
    }));
  };

  const addContact = () => setContacts(prev => [...prev, { ...emptyContact }]);
  const removeContact = (index: number) => {
    if (contacts.length <= 1) return;
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateAddress = (
    type: "billing" | "shipping",
    index: number,
    field: keyof Address,
    value: string | boolean
  ) => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    setter(prev => prev.map((a, i) => {
      if (i !== index) return field === "is_default" && value === true ? { ...a, is_default: false } : a;
      return { ...a, [field]: value };
    }));
  };

  const addAddress = (type: "billing" | "shipping") => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    setter(prev => [...prev, { ...emptyAddress, is_default: prev.length === 0 }]);
  };

  const removeAddress = (type: "billing" | "shipping", index: number) => {
    const setter = type === "billing" ? setBillingAddresses : setShippingAddresses;
    setter(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let parsedBomConfig = null;
    if (bomConfigJson.trim()) {
      try {
        parsedBomConfig = JSON.parse(bomConfigJson);
      } catch {
        setError("Invalid BOM config JSON");
        setSaving(false);
        return;
      }
    }

    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          payment_terms: paymentTerms,
          notes: notes || null,
          is_active: isActive,
          contacts,
          billing_addresses: billingAddresses,
          shipping_addresses: shippingAddresses,
          bom_config: parsedBomConfig,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Edit Customer — {initialData.code}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Company Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={(v) => { if (v) setPaymentTerms(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 15">Net 15</SelectItem>
                  <SelectItem value="Net 45">Net 45</SelectItem>
                  <SelectItem value="Net 60">Net 60</SelectItem>
                  <SelectItem value="Due on receipt">Due on receipt</SelectItem>
                  <SelectItem value="Prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label>Status</Label>
            <Button
              variant={isActive ? "default" : "secondary"}
              size="sm"
              onClick={() => setIsActive(!isActive)}
            >
              {isActive ? "Active" : "Inactive"}
            </Button>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes about this customer..." />
          </div>
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contacts ({contacts.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={addContact}>
              <Plus className="mr-1 h-3 w-3" /> Add Contact
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.map((c, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Contact {i + 1}</span>
                  <Button
                    variant={c.is_primary ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => updateContact(i, "is_primary", true)}
                  >
                    {c.is_primary ? "Primary" : "Set Primary"}
                  </Button>
                </div>
                {contacts.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeContact(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={c.name} onChange={e => updateContact(i, "name", e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Input value={c.role} onChange={e => updateContact(i, "role", e.target.value)} placeholder="e.g. Purchasing Manager" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={c.email} onChange={e => updateContact(i, "email", e.target.value)} placeholder="email@company.com" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={c.phone} onChange={e => updateContact(i, "phone", e.target.value)} placeholder="+1 (514) 555-0000" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Addresses */}
      {(["billing", "shipping"] as const).map(type => {
        const addresses = type === "billing" ? billingAddresses : shippingAddresses;
        return (
          <Card key={type}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base capitalize">{type} Addresses ({addresses.length})</CardTitle>
                <Button variant="outline" size="sm" onClick={() => addAddress(type)}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {addresses.length === 0 && (
                <p className="text-sm text-gray-500">No {type} addresses. Click Add to create one.</p>
              )}
              {addresses.map((a, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Input
                        value={a.label}
                        onChange={e => updateAddress(type, i, "label", e.target.value)}
                        placeholder="Label (e.g. HQ, Warehouse)"
                        className="h-7 w-40 text-xs"
                      />
                      <Button
                        variant={a.is_default ? "default" : "outline"}
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => updateAddress(type, i, "is_default", true)}
                      >
                        {a.is_default ? "Default" : "Set Default"}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeAddress(type, i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs">Street</Label>
                    <Input value={a.street} onChange={e => updateAddress(type, i, "street", e.target.value)} placeholder="123 Main St" />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input value={a.city} onChange={e => updateAddress(type, i, "city", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Province</Label>
                      <Input value={a.province} onChange={e => updateAddress(type, i, "province", e.target.value)} placeholder="QC" />
                    </div>
                    <div>
                      <Label className="text-xs">Postal Code</Label>
                      <Input value={a.postal_code} onChange={e => updateAddress(type, i, "postal_code", e.target.value)} placeholder="H4S 1P9" />
                    </div>
                    <div>
                      <Label className="text-xs">Country</Label>
                      <Input value={a.country} onChange={e => updateAddress(type, i, "country", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* BOM Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">BOM Configuration (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={bomConfigJson}
            onChange={e => setBomConfigJson(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder='{"columns": "auto_detect"}'
          />
          <p className="mt-1 text-xs text-gray-400">
            Column mappings, header row, encoding, separator — controls how this customer&apos;s BOMs are parsed.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
