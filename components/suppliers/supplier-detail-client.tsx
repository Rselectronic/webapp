"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Trash2, Star, Plus, Save } from "lucide-react";
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_CURRENCIES,
  EMAIL_REGEX,
  categoryLabel,
  type Supplier,
  type SupplierContact,
  type SupplierAddress,
  type SupplierCategory,
  type SupplierCurrency,
} from "@/lib/suppliers/types";
import { PaymentTermsInput } from "./payment-terms-input";

interface Props {
  supplier: Supplier;
  contacts: SupplierContact[];
  isCeo: boolean;
}

export function SupplierDetailClient({ supplier, contacts: initialContacts, isCeo }: Props) {
  const router = useRouter();

  // Supplier form state
  const [code, setCode] = useState(supplier.code);
  const [legalName, setLegalName] = useState(supplier.legal_name);
  const [category, setCategory] = useState<SupplierCategory | "">(supplier.category ?? "");
  const [currency, setCurrency] = useState<SupplierCurrency>(supplier.default_currency);
  // payment_terms is TEXT[] (migration 078). Tolerate the legacy string
  // shape just in case the loader returns the old format from cached data.
  const [paymentTerms, setPaymentTerms] = useState<string[]>(() => {
    const pt = supplier.payment_terms as unknown;
    if (Array.isArray(pt)) return pt.filter((s): s is string => typeof s === "string" && s.length > 0);
    if (typeof pt === "string" && pt.trim().length > 0) return [pt.trim()];
    return [];
  });
  const [notes, setNotes] = useState(supplier.notes ?? "");
  const [address, setAddress] = useState<SupplierAddress>(supplier.billing_address ?? {});
  const [onlineOnly, setOnlineOnly] = useState(supplier.online_only);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(supplier.is_approved);

  // Contacts state
  const [contacts, setContacts] = useState<SupplierContact[]>(initialContacts);

  function setAddrField<K extends keyof SupplierAddress>(k: K, v: SupplierAddress[K]) {
    setAddress((prev) => ({ ...prev, [k]: v }));
  }

  async function saveSupplier() {
    setSavingSupplier(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          legal_name: legalName,
          category: category || null,
          default_currency: currency,
          payment_terms: paymentTerms.length > 0 ? paymentTerms : null,
          billing_address: address,
          online_only: onlineOnly,
          notes: notes || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      toast.success("Supplier saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingSupplier(false);
    }
  }

  async function approveSupplier() {
    setApproving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Approval failed");
      }
      setIsApproved(true);
      toast.success("Supplier approved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  async function refreshContacts() {
    const res = await fetch(`/api/suppliers/${supplier.id}/contacts`);
    if (res.ok) setContacts(await res.json());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">{supplier.legal_name}</h2>
            {isApproved ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>
            )}
            {onlineOnly && (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Online-only</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Code: <span className="font-mono">{supplier.code}</span> · Category:{" "}
            {categoryLabel(supplier.category)}
          </p>
        </div>
        {!isApproved && isCeo && (
          <Button onClick={approveSupplier} disabled={approving}>
            <Check className="mr-1 h-4 w-4" />
            {approving ? "Approving…" : "Approve supplier"}
          </Button>
        )}
      </div>

      {/* Supplier info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supplier info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={!isCeo}
              />
            </div>
            <div>
              <Label htmlFor="cur">Default currency</Label>
              <Select
                value={currency}
                onValueChange={(v) => v && setCurrency(v as SupplierCurrency)}
                disabled={!isCeo}
              >
                <SelectTrigger id="cur" className="mt-1 w-full">
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
            <Label htmlFor="lname">Legal name</Label>
            <Input id="lname" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!isCeo} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cat">Category</Label>
              <Select
                value={category || "__none__"}
                onValueChange={(v) =>
                  setCategory(
                    v == null || v === "__none__"
                      ? ""
                      : (v as SupplierCategory)
                  )
                }
                disabled={!isCeo}
              >
                <SelectTrigger id="cat" className="mt-1 w-full">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__none__") return "—";
                      return categoryLabel(v as SupplierCategory);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="terms">Payment terms</Label>
              {isCeo ? (
                <PaymentTermsInput
                  id="terms"
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  placeholder="Net 30, Credit Card…"
                />
              ) : (
                // Read-only render for non-CEO viewers — chip strip without
                // input affordance, matching the editor's visual style.
                <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border bg-gray-50 px-2 py-1.5 min-h-9">
                  {paymentTerms.length === 0 ? (
                    <span className="text-xs text-gray-400">—</span>
                  ) : (
                    paymentTerms.map((t, i) => (
                      <span
                        key={`${t}-${i}`}
                        className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              )}
              {isCeo && (
                <p className="mt-1 text-xs text-gray-500">
                  Press Enter or comma to add. Multiple terms allowed.
                </p>
              )}
            </div>
          </div>

          {/* Billing address */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-gray-500">Billing address</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Address line 1"
                value={address.line1 ?? ""}
                onChange={(e) => setAddrField("line1", e.target.value)}
                disabled={!isCeo}
              />
              <Input
                placeholder="Address line 2"
                value={address.line2 ?? ""}
                onChange={(e) => setAddrField("line2", e.target.value)}
                disabled={!isCeo}
              />
              <Input
                placeholder="City"
                value={address.city ?? ""}
                onChange={(e) => setAddrField("city", e.target.value)}
                disabled={!isCeo}
              />
              <Input
                placeholder="State / Province"
                value={address.state_province ?? ""}
                onChange={(e) => setAddrField("state_province", e.target.value)}
                disabled={!isCeo}
              />
              <Input
                placeholder="Postal code"
                value={address.postal_code ?? ""}
                onChange={(e) => setAddrField("postal_code", e.target.value)}
                disabled={!isCeo}
              />
              <Input
                placeholder="Country"
                value={address.country ?? ""}
                onChange={(e) => setAddrField("country", e.target.value)}
                disabled={!isCeo}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={!isCeo}
            />
          </div>

          <label className="flex items-start gap-2 rounded border border-dashed bg-gray-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={onlineOnly}
              onChange={(e) => setOnlineOnly(e.target.checked)}
              disabled={!isCeo}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Online-only distributor</span>
              <span className="ml-2 text-xs text-gray-500">
                We buy directly from this supplier&apos;s website (DigiKey,
                Mouser, LCSC). They are excluded from the supplier-quote and PO
                flow but kept here for API credentials and reference.
              </span>
            </span>
          </label>

          {isCeo && (
            <div className="flex justify-end">
              <Button onClick={saveSupplier} disabled={savingSupplier}>
                <Save className="mr-1 h-4 w-4" />
                {savingSupplier ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contacts card */}
      <ContactsCard
        supplierId={supplier.id}
        contacts={contacts}
        setContacts={setContacts}
        isCeo={isCeo}
        onChanged={refreshContacts}
      />
    </div>
  );
}

interface ContactsCardProps {
  supplierId: string;
  contacts: SupplierContact[];
  setContacts: (c: SupplierContact[]) => void;
  isCeo: boolean;
  onChanged: () => void;
}

function ContactsCard({ supplierId, contacts, setContacts, isCeo, onChanged }: ContactsCardProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTitle, setNewTitle] = useState("");

  async function addContact() {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (newEmail && !EMAIL_REGEX.test(newEmail.trim())) {
      toast.error("Invalid email");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          title: newTitle.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Add failed");
      setContacts([...contacts, j as SupplierContact]);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewTitle("");
      toast.success("Contact added");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function deleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Delete failed");
      }
      setContacts(contacts.filter((c) => c.id !== id));
      toast.success("Contact deleted");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function promoteContact(id: string) {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/contacts/${id}/promote`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Promote failed");
      }
      setContacts(
        contacts.map((c) => ({ ...c, is_primary: c.id === id }))
      );
      toast.success("Primary contact updated");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    }
  }

  async function patchContact(id: string, patch: Partial<SupplierContact>) {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      toast.success("Contact saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contacts</CardTitle>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="mb-3 text-sm text-gray-500">No contacts on file yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-2">Primary</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Phone</th>
                  <th className="px-2 py-2">Title</th>
                  {isCeo && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    isCeo={isCeo}
                    onPromote={() => promoteContact(c.id)}
                    onDelete={() => deleteContact(c.id)}
                    onSave={(patch) => patchContact(c.id, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isCeo && (
          <div className="mt-4 rounded border border-dashed bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase text-gray-500">Add contact</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input
                placeholder="Name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="Email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Input
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <Input
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={addContact} disabled={adding}>
                <Plus className="mr-1 h-3 w-3" />
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ContactRowProps {
  contact: SupplierContact;
  isCeo: boolean;
  onPromote: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<SupplierContact>) => void;
}

function ContactRow({ contact, isCeo, onPromote, onDelete, onSave }: ContactRowProps) {
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [title, setTitle] = useState(contact.title ?? "");

  const dirty =
    name !== contact.name ||
    email !== (contact.email ?? "") ||
    phone !== (contact.phone ?? "") ||
    title !== (contact.title ?? "");

  function handleBlurSave() {
    if (!dirty) return;
    if (email && !EMAIL_REGEX.test(email)) {
      toast.error("Invalid email");
      return;
    }
    onSave({
      name,
      email: email || null,
      phone: phone || null,
      title: title || null,
    });
  }

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={onPromote}
          disabled={!isCeo || contact.is_primary}
          title={contact.is_primary ? "Primary" : "Make primary"}
          className={`rounded p-1 ${contact.is_primary ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
        >
          <Star className={`h-4 w-4 ${contact.is_primary ? "fill-amber-500" : ""}`} />
        </button>
      </td>
      <td className="px-2 py-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlurSave}
          disabled={!isCeo}
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleBlurSave}
          disabled={!isCeo}
          className="h-8 text-sm"
          type="email"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handleBlurSave}
          disabled={!isCeo}
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleBlurSave}
          disabled={!isCeo}
          className="h-8 text-sm"
        />
      </td>
      {isCeo && (
        <td className="px-2 py-2 text-right">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="h-7 px-2 text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}
