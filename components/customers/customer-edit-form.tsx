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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, Plus, Trash2, X } from "lucide-react";
import { AddressFields } from "./address-fields";
import {
  normalizeCountry,
  taxRegionForAddress,
  currencyForAddress,
  type CountryCode,
} from "@/lib/address/regions";
import { TAX_REGION_LABELS } from "@/lib/tax/regions";

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
  /** New ISO country code — added migration 105. Falls back to normalized country text. */
  country_code?: CountryCode;
  /**
   * Optional currency override for billing addresses. Unset → derive from
   * country (US → USD, else → CAD). Set → use this verbatim. Lets a
   * customer ask to be billed in CAD even with a US billing address.
   */
  currency?: "CAD" | "USD";
  is_default: boolean;
}

const DEFAULT_PAYMENT_TERMS = [
  "Net 30",
  "Net 15",
  "Net 45",
  "Net 60",
  "Due on receipt",
  "Prepaid",
];

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
    folder_name?: string | null;
    default_currency?: "CAD" | "USD" | null;
    tax_region?:
      | "QC"
      | "CA_OTHER"
      | "HST_ON"
      | "HST_15"
      | "INTERNATIONAL"
      | null;
  };
  paymentTermsOptions?: string[];
  onClose: () => void;
}

const emptyContact: Contact = { name: "", email: "", phone: "", role: "", is_primary: false };
const emptyAddress: Address = { label: "", street: "", city: "", province: "", postal_code: "", country: "Canada", country_code: "CA", is_default: false };

export function CustomerEditForm({ customerId, initialData, paymentTermsOptions, onClose }: CustomerEditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(initialData.company_name);
  const [paymentTerms, setPaymentTerms] = useState(initialData.payment_terms);
  const [notes, setNotes] = useState(initialData.notes ?? "");
  const [isActive, setIsActive] = useState(initialData.is_active);
  const [folderName, setFolderName] = useState(initialData.folder_name ?? "");
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
          folder_name: folderName.trim() || null,
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
    <div className="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Edit Customer
          </h2>
          <span className="text-sm text-muted-foreground font-mono">
            {initialData.code}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ---- Compact top fields ---- */}
      <div className="grid grid-cols-[1fr_180px_160px_auto] items-end gap-3 py-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Company Name</Label>
          <Input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Folder Name</Label>
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="OneDrive folder"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Payment Terms</Label>
          <Select value={paymentTerms} onValueChange={(v) => { if (v) setPaymentTerms(v); }}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(paymentTermsOptions ?? DEFAULT_PAYMENT_TERMS).map((term) => (
                <SelectItem key={term} value={term}>
                  {term}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className="mb-0.5"
        >
          <Badge variant={isActive ? "default" : "secondary"} className="cursor-pointer select-none">
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </button>
      </div>

      {/* Currency + tax region are now derived from each billing address
          (visible as badges on the address card in the Addresses tab).
          The customer-level fields stay in the DB as a legacy fallback. */}

      {/* ---- Tabbed content ---- */}
      <Tabs defaultValue="contacts" className="flex-1 min-h-0">
        <TabsList variant="line" className="w-full justify-start border-b pb-0">
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="bom-config">BOM Config</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* ---- Contacts Tab ---- */}
        <TabsContent value="contacts" className="pt-4">
          <div className="space-y-3">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_72px_36px] gap-2 px-1">
              <span className="text-xs font-medium text-muted-foreground">Name</span>
              <span className="text-xs font-medium text-muted-foreground">Role</span>
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <span className="text-xs font-medium text-muted-foreground">Phone</span>
              <span className="text-xs font-medium text-muted-foreground">Primary</span>
              <span />
            </div>

            {/* Contact rows */}
            {contacts.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_72px_36px] gap-2 items-center"
              >
                <Input
                  value={c.name}
                  onChange={e => updateContact(i, "name", e.target.value)}
                  placeholder="Full name"
                  className="h-8 text-sm"
                />
                <Input
                  value={c.role}
                  onChange={e => updateContact(i, "role", e.target.value)}
                  placeholder="Title / role"
                  className="h-8 text-sm"
                />
                <Input
                  type="email"
                  value={c.email}
                  onChange={e => updateContact(i, "email", e.target.value)}
                  placeholder="email@co.com"
                  className="h-8 text-sm"
                />
                <Input
                  value={c.phone}
                  onChange={e => updateContact(i, "phone", e.target.value)}
                  placeholder="+1 (514) ..."
                  className="h-8 text-sm"
                />
                <button
                  type="button"
                  onClick={() => updateContact(i, "is_primary", true)}
                  className="flex justify-center"
                >
                  <Badge
                    variant={c.is_primary ? "default" : "outline"}
                    className="cursor-pointer select-none text-xs"
                  >
                    {c.is_primary ? "Primary" : "Set"}
                  </Badge>
                </button>
                <div className="flex justify-center">
                  {contacts.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeContact(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : (
                    <span className="h-7 w-7" />
                  )}
                </div>
              </div>
            ))}

            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={addContact}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add contact
            </Button>
          </div>
        </TabsContent>

        {/* ---- Addresses Tab ---- */}
        <TabsContent value="addresses" className="pt-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Billing column */}
            <AddressColumn
              title="Billing"
              kind="billing"
              addresses={billingAddresses}
              onUpdate={(i, f, v) => updateAddress("billing", i, f, v)}
              onAdd={() => addAddress("billing")}
              onRemove={(i) => removeAddress("billing", i)}
            />
            {/* Shipping column */}
            <AddressColumn
              title="Shipping"
              kind="shipping"
              addresses={shippingAddresses}
              onUpdate={(i, f, v) => updateAddress("shipping", i, f, v)}
              onAdd={() => addAddress("shipping")}
              onRemove={(i) => removeAddress("shipping", i)}
            />
          </div>
        </TabsContent>

        {/* ---- BOM Config Tab ---- */}
        <TabsContent value="bom-config" className="pt-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Column mappings, header row, encoding, separator -- controls how this customer&apos;s BOMs are parsed.
            </p>
            <Textarea
              value={bomConfigJson}
              onChange={e => setBomConfigJson(e.target.value)}
              rows={14}
              spellCheck={false}
              className="font-mono text-[13px] leading-relaxed bg-muted/40 border-muted resize-y"
              placeholder='{"columns": "auto_detect"}'
            />
          </div>
        </TabsContent>

        {/* ---- Notes Tab ---- */}
        <TabsContent value="notes" className="pt-4">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={6}
            className="resize-y"
            placeholder="Internal notes about this customer..."
          />
        </TabsContent>
      </Tabs>

      {/* ---- Footer ---- */}
      <div className="pt-4 mt-4 border-t space-y-3">
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---- Address Column Sub-component ---- */

function AddressColumn({
  title,
  kind,
  addresses,
  onUpdate,
  onAdd,
  onRemove,
}: {
  title: string;
  /** Tax region + currency only apply to billing addresses (where the
   *  invoice is billed to). Shipping addresses are pure logistics. */
  kind: "billing" | "shipping";
  addresses: Address[];
  onUpdate: (index: number, field: keyof Address, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onAdd}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>

      {addresses.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No {title.toLowerCase()} address
        </p>
      )}

      {addresses.map((a, i) => {
        // Normalize legacy rows that pre-date country_code: derive a code
        // from the free-text country once at render-time; user can change it
        // by picking a different country in the dropdown.
        const code: CountryCode = (a.country_code ?? normalizeCountry(a.country)) as CountryCode;
        const region = taxRegionForAddress({
          country_code: code,
          province: a.province,
        });
        // Effective currency = override if set, else country default.
        const currency = currencyForAddress({
          country_code: code,
          currency: a.currency,
        });
        const isOverride = a.currency === "CAD" || a.currency === "USD";

        return (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Input
                  value={a.label}
                  onChange={e => onUpdate(i, "label", e.target.value)}
                  placeholder="Label (HQ, Warehouse)"
                  className="h-7 w-36 text-xs"
                />
                <button type="button" onClick={() => onUpdate(i, "is_default", true)}>
                  <Badge
                    variant={a.is_default ? "default" : "outline"}
                    className="cursor-pointer select-none text-xs"
                  >
                    {a.is_default ? "Default" : "Set default"}
                  </Badge>
                </button>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(i)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>

            <AddressFields
              size="sm"
              value={{
                country_code: code,
                country: a.country ?? "",
                street: a.street ?? "",
                city: a.city ?? "",
                province: a.province ?? "",
                postal_code: a.postal_code ?? "",
              }}
              onChange={(next) => {
                onUpdate(i, "country_code", next.country_code);
                onUpdate(i, "country", next.country);
                onUpdate(i, "street", next.street);
                onUpdate(i, "city", next.city);
                onUpdate(i, "province", next.province);
                onUpdate(i, "postal_code", next.postal_code);
              }}
            />

            {/* Derived tax region + editable currency — billing only. The
                shipping address is pure logistics; tax + currency are
                properties of where the invoice is sent, not the parts. */}
            {kind === "billing" ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary" className="text-[10px]">
                  {TAX_REGION_LABELS[region]}
                </Badge>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Currency:
                  </span>
                  <Select
                    value={a.currency || "__auto__"}
                    onValueChange={(v) => {
                      onUpdate(
                        i,
                        "currency",
                        v === "CAD" || v === "USD" ? v : ""
                      );
                    }}
                  >
                    <SelectTrigger size="sm" className="h-6 px-1 text-[10px] min-w-[7rem]">
                      <SelectValue>
                        {(v: string) =>
                          v === "__auto__" || !v
                            ? `Auto (${currencyForAddress({ country_code: code })})`
                            : v
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">
                        Auto ({currencyForAddress({ country_code: code })})
                      </SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                  {isOverride ? (
                    <Badge variant="outline" className="text-[10px]">
                      {currency} (override)
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
