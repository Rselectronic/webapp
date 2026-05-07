"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  SUPPLIER_CURRENCIES,
  type Supplier,
  type SupplierContact,
  type SupplierCurrency,
} from "@/lib/suppliers/types";

// Each "line" comes from the merged BOM, not procurement_lines — we key
// on cpc (the business identity at RS) for the entire dialog flow. mpn is
// retained for display / supplier-PO output. The API materialises
// procurement_lines on save so the FK on supplier_quote_lines stays valid.
interface ProcLine {
  cpc: string;
  mpn: string | null;
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  qty_needed: number;
  qty_extra: number | null;
  unit_price: number | null; // CAD-cached price for reference
}

interface Props {
  procId: string;
  availableLines: ProcLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface SupplierWithCount extends Supplier {
  contact_count: number;
}

interface LineEntry {
  // CPC is the row identity in the dialog; mpn comes along for display only.
  cpc: string;
  mpn: string | null;
  qty: number;
  unit_price: string; // input string for free typing
  selected: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function CreateSupplierQuoteDialog({
  procId,
  availableLines,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [suppliers, setSuppliers] = useState<SupplierWithCount[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [currency, setCurrency] = useState<SupplierCurrency>("CAD");
  const [validUntil, setValidUntil] = useState("");
  const [shipping, setShipping] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Operator-only filter for the lines table. Matches mpn or cpc — typing
  // "0805" or "TLAN-12" jumps straight to the relevant row in a 100+ MPN
  // BOM without scrolling.
  const [search, setSearch] = useState("");

  // Load eligible suppliers (approved + non-online-only).
  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await fetch("/api/suppliers?approved=true&online_only=false");
      if (res.ok) {
        const data = (await res.json()) as SupplierWithCount[];
        setSuppliers(data);
      }
    })();
  }, [open]);

  // When supplier changes, load contacts + apply default currency.
  useEffect(() => {
    if (!supplierId) {
      setContacts([]);
      setContactId("");
      return;
    }
    const sup = suppliers.find((s) => s.id === supplierId);
    if (sup) setCurrency(sup.default_currency);
    (async () => {
      const res = await fetch(`/api/suppliers/${supplierId}/contacts`);
      if (res.ok) {
        const data = (await res.json()) as SupplierContact[];
        setContacts(data);
        const primary = data.find((c) => c.is_primary);
        setContactId(primary?.id ?? "");
      }
    })();
  }, [supplierId, suppliers]);

  // Quote line state — one row per available proc line.
  const [entries, setEntries] = useState<LineEntry[]>([]);
  useEffect(() => {
    setEntries(
      availableLines.map((l) => ({
        cpc: l.cpc,
        mpn: l.mpn,
        qty: (l.qty_needed ?? 0) + (l.qty_extra ?? 0),
        unit_price: "",
        selected: false,
      }))
    );
  }, [availableLines]);

  const subtotal = useMemo(() => {
    let s = 0;
    for (const e of entries) {
      if (!e.selected) continue;
      const qty = Number(e.qty) || 0;
      const unit = Number(e.unit_price) || 0;
      s += qty * unit;
    }
    return round2(s);
  }, [entries]);

  const total = round2(subtotal + (Number(shipping) || 0) + (Number(tax) || 0));

  function updateEntry(idx: number, patch: Partial<LineEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  async function submit() {
    if (submitting) return;
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    const selected = entries.filter((e) => e.selected);
    if (selected.length === 0) {
      toast.error("Select at least one line and enter its unit price");
      return;
    }
    for (const e of selected) {
      const unit = Number(e.unit_price);
      if (!Number.isFinite(unit) || unit < 0) {
        toast.error("Each selected line needs a non-negative unit price");
        return;
      }
      if (!e.qty || e.qty <= 0) {
        toast.error("Each selected line needs a positive quantity");
        return;
      }
    }
    setSubmitting(true);
    try {
      const body = {
        supplier_id: supplierId,
        supplier_contact_id: contactId || null,
        currency,
        valid_until: validUntil || null,
        notes: notes || null,
        shipping: Number(shipping) || 0,
        tax: Number(tax) || 0,
        // Quotes always start as `received` — the operator only opens
        // this dialog after the supplier has replied with prices, so the
        // intermediate draft/requested states aren't useful.
        mark_received: true,
        // Send cpc + descriptive fields. The server resolves these to
        // procurement_lines (creating new rows when needed) before
        // attaching them to supplier_quote_lines. mpn is included
        // alongside so the materialised procurement_line keeps the
        // supplier-facing winning MPN for downstream PO output.
        lines: selected.map((e) => {
          const src = procLineMap.get(e.cpc);
          return {
            cpc: e.cpc,
            mpn: e.mpn,
            description: src?.description ?? null,
            manufacturer: src?.manufacturer ?? null,
            m_code: src?.m_code ?? null,
            qty: e.qty,
            unit_price: Number(e.unit_price) || 0,
          };
        }),
      };
      const res = await fetch(`/api/proc/${procId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Create failed");
      toast.success("Supplier quote saved");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  const procLineMap = useMemo(() => {
    const m = new Map<string, ProcLine>();
    for (const l of availableLines) m.set(l.cpc, l);
    return m;
  }, [availableLines]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The base DialogContent applies `sm:max-w-sm`, which would clip
          this dialog to ~24rem at every breakpoint above mobile. We need
          to override it explicitly at the same `sm:` scope so the lines
          table can show every column (M-Code / MPN / CPC / Description /
          Qty / Cached CAD / Unit price / Line total) without horizontal
          scrolling. tailwind-merge picks the later sm:max-w-* class. */}
      <DialogContent className="w-[95vw] sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>Create supplier quote</DialogTitle>
          <DialogDescription>
            Enter the prices a supplier quoted you. The quote is saved as
            received; click <strong>Accept</strong> on the panel to generate
            a draft PO and mark the procurement lines as ordered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Supplier + contact + currency */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Supplier *</Label>
              <Select
                value={supplierId || "__none__"}
                onValueChange={(v) =>
                  setSupplierId(v == null || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__none__") return "— select supplier —";
                      const s = suppliers.find((s) => s.id === v);
                      return s ? `${s.code} — ${s.legal_name}` : "";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— select supplier —</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No approved non-online suppliers yet. Add one in Settings →
                  Suppliers.
                </p>
              )}
            </div>
            <div>
              <Label>Contact</Label>
              <Select
                value={contactId || "__none__"}
                onValueChange={(v) =>
                  setContactId(v == null || v === "__none__" ? "" : v)
                }
                disabled={!supplierId || contacts.length === 0}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__none__") return "— none —";
                      const c = contacts.find((c) => c.id === v);
                      if (!c) return "";
                      return `${c.name}${c.is_primary ? " (primary)" : ""}${c.email ? ` · ${c.email}` : ""}`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.is_primary ? " (primary)" : ""}
                      {c.email ? ` · ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Currency</Label>
              <Select
                value={currency}
                onValueChange={(v) => v && setCurrency(v as SupplierCurrency)}
              >
                <SelectTrigger className="mt-1 w-full">
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
            <div>
              <Label>Valid until</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          {/* Lines table */}
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label>Quote lines</Label>
                <p className="mt-1 text-xs text-gray-500">
                  Tick the lines this supplier quoted, enter their quantity
                  and unit price in {currency}. The cached CAD column is RS&apos;s
                  last known distributor price for reference.
                </p>
              </div>
              <div className="w-72">
                <Label className="text-xs">Search</Label>
                <Input
                  type="search"
                  value={search}
                  onChange={(ev) => setSearch(ev.target.value)}
                  placeholder="MPN or CPC…"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {availableLines.length === 0 ? (
              <p className="mt-2 rounded border border-dashed p-3 text-sm text-gray-500">
                All procurement lines are already covered by an accepted quote
                or there are no lines on this PROC yet.
              </p>
            ) : (
              <div className="mt-2 max-h-[420px] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-b bg-gray-50 text-left text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">M-Code</th>
                      <th className="px-2 py-2">MPN</th>
                      <th className="px-2 py-2">CPC</th>
                      <th className="px-2 py-2">Description</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">
                        Cached CAD price
                      </th>
                      <th className="px-2 py-2 text-right">
                        Unit price ({currency})
                      </th>
                      <th className="px-2 py-2 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => {
                      const line = procLineMap.get(e.cpc);
                      if (!line) return null;
                      // Filter by mpn or cpc — case-insensitive substring
                      // match. Selected rows always stay visible so the
                      // operator can still see what they've already
                      // entered while narrowing the list.
                      const q = search.trim().toLowerCase();
                      if (q.length > 0 && !e.selected) {
                        const mpnMatch = (line.mpn ?? "").toLowerCase().includes(q);
                        const cpcMatch = line.cpc.toLowerCase().includes(q);
                        if (!mpnMatch && !cpcMatch) return null;
                      }
                      const lineTotal = e.selected
                        ? round2((Number(e.qty) || 0) * (Number(e.unit_price) || 0))
                        : 0;
                      return (
                        <tr key={e.cpc} className="border-b last:border-b-0">
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={e.selected}
                              onChange={(ev) =>
                                updateEntry(i, { selected: ev.target.checked })
                              }
                            />
                          </td>
                          <td className="px-2 py-1 font-mono">
                            {line.m_code ?? "—"}
                          </td>
                          <td className="px-2 py-1 font-mono whitespace-nowrap">
                            {line.mpn ?? "—"}
                          </td>
                          <td className="px-2 py-1 font-mono text-gray-600 whitespace-nowrap">
                            {line.cpc}
                          </td>
                          <td className="px-2 py-1 text-gray-600">
                            {line.description ?? ""}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <Input
                              type="number"
                              min={1}
                              value={e.qty}
                              onChange={(ev) =>
                                updateEntry(i, { qty: parseInt(ev.target.value, 10) || 0 })
                              }
                              disabled={!e.selected}
                              className="h-7 w-20 text-right text-xs"
                            />
                          </td>
                          <td className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">
                            {line.unit_price != null
                              ? `$${Number(line.unit_price).toFixed(4)}`
                              : "—"}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <Input
                              type="number"
                              step="0.0001"
                              min={0}
                              value={e.unit_price}
                              onChange={(ev) =>
                                updateEntry(i, { unit_price: ev.target.value })
                              }
                              disabled={!e.selected}
                              placeholder="0.00"
                              className="h-7 w-24 text-right text-xs"
                            />
                          </td>
                          <td className="px-2 py-1 text-right font-medium whitespace-nowrap">
                            {e.selected ? lineTotal.toFixed(2) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Shipping</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
              />
            </div>
            <div>
              <Label>Tax</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
            <div className="rounded border bg-gray-50 p-2 text-right text-sm">
              <div className="text-xs text-gray-500">
                Subtotal: {subtotal.toFixed(2)} {currency}
              </div>
              <div className="text-base font-bold">
                Total: {total.toFixed(2)} {currency}
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this quote"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit()} disabled={submitting}>
            {submitting ? "Saving…" : "Save Quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
