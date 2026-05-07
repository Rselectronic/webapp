"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils/format";

const PCB_STATUS_OPTIONS = [
  { value: "ordered", label: "ordered" },
  { value: "shipped", label: "shipped" },
  { value: "received", label: "received" },
  { value: "cancelled", label: "cancelled" },
] as const;

interface MemberGmp {
  id: string;
  gmp_number: string;
  board_name: string | null;
}

interface PcbOrder {
  id: string;
  gmp_id: string | null;
  supplier: string | null;
  external_order_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  ordered_date: string | null;
  expected_arrival: string | null;
  received_date: string | null;
  status: string | null;
  notes: string | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

interface Props {
  procId: string;
  memberGmps: MemberGmp[];
}

const SUPPLIER_SUGGESTIONS = ["PCBWay", "JLCPCB", "Candor", "WMD"];

function statusVariant(status: string | null | undefined) {
  switch (status) {
    case "ordered":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "shipped":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "received":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "cancelled":
      return "bg-gray-200 text-gray-700 hover:bg-gray-200";
    default:
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  }
}

function fmtMoney(n: number | null | undefined, currency: string | null | undefined) {
  if (n == null) return "—";
  return `${currency ?? ""} ${Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return formatDate(d);
  } catch {
    return d;
  }
}

type FormState = {
  gmp_id: string;
  supplier: string;
  external_order_id: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  currency: string;
  ordered_date: string;
  expected_arrival: string;
  received_date: string;
  status: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    gmp_id: "",
    supplier: "",
    external_order_id: "",
    quantity: "",
    unit_price: "",
    total_price: "",
    currency: "USD",
    ordered_date: "",
    expected_arrival: "",
    received_date: "",
    status: "ordered",
    notes: "",
  };
}

function orderToForm(o: PcbOrder): FormState {
  return {
    gmp_id: o.gmp_id ?? "",
    supplier: o.supplier ?? "",
    external_order_id: o.external_order_id ?? "",
    quantity: o.quantity != null ? String(o.quantity) : "",
    unit_price: o.unit_price != null ? String(o.unit_price) : "",
    total_price: o.total_price != null ? String(o.total_price) : "",
    currency: o.currency ?? "USD",
    ordered_date: o.ordered_date ?? "",
    expected_arrival: o.expected_arrival ?? "",
    received_date: o.received_date ?? "",
    status: o.status ?? "ordered",
    notes: o.notes ?? "",
  };
}

function formToBody(f: FormState) {
  return {
    gmp_id: f.gmp_id || null,
    supplier: f.supplier,
    external_order_id: f.external_order_id || null,
    quantity: f.quantity ? Number(f.quantity) : null,
    unit_price: f.unit_price ? Number(f.unit_price) : null,
    total_price: f.total_price ? Number(f.total_price) : null,
    currency: f.currency || null,
    ordered_date: f.ordered_date || null,
    expected_arrival: f.expected_arrival || null,
    received_date: f.received_date || null,
    status: f.status || null,
    notes: f.notes || null,
  };
}

export function PcbOrdersCard({ procId, memberGmps }: Props) {
  const [orders, setOrders] = useState<PcbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proc/${procId}/pcb-orders`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOrders(json.orders ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [procId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const gmpsOrdered = new Set(
    orders.filter((o) => o.status !== "cancelled" && o.gmp_id).map((o) => o.gmp_id!)
  );
  const receivedCount = orders.filter((o) => o.status === "received").length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier || !form.quantity) {
      setError("Supplier and quantity are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proc/${procId}/pcb-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(form)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm(emptyForm());
      setShowForm(false);
      await fetchOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proc/${procId}/pcb-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(editForm)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingId(null);
      await fetchOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this PCB order?")) return;
    try {
      const res = await fetch(`/api/proc/${procId}/pcb-orders/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchOrders();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">PCB Orders</CardTitle>
          <p className="mt-1 text-xs text-gray-500">
            {gmpsOrdered.size} of {memberGmps.length} board
            {memberGmps.length === 1 ? "" : "s"} ordered ({receivedCount} received)
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setShowForm((s) => !s);
            setForm(emptyForm());
          }}
        >
          {showForm ? "Cancel" : "+ Record PCB Order"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-4 grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3"
          >
            <div>
              <Label className="text-xs">GMP / Board</Label>
              <Select
                value={form.gmp_id || "__multi__"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    gmp_id: v == null || v === "__multi__" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === "__multi__")
                        return "(covers multiple / unsure)";
                      const g = memberGmps.find((g) => g.id === v);
                      if (!g) return "";
                      return `${g.gmp_number}${g.board_name ? ` — ${g.board_name}` : ""}`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__multi__">
                    (covers multiple / unsure)
                  </SelectItem>
                  {memberGmps.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.gmp_number}
                      {g.board_name ? ` — ${g.board_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier *</Label>
              <Input
                list="pcb-supplier-list"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                required
              />
              <datalist id="pcb-supplier-list">
                {SUPPLIER_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="text-xs">External Order #</Label>
              <Input
                value={form.external_order_id}
                onChange={(e) =>
                  setForm({ ...form, external_order_id: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Quantity *</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Unit Price</Label>
              <Input
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Total Price</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total_price}
                onChange={(e) => setForm({ ...form, total_price: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Ordered Date</Label>
              <Input
                type="date"
                value={form.ordered_date}
                onChange={(e) => setForm({ ...form, ordered_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Expected Arrival</Label>
              <Input
                type="date"
                value={form.expected_arrival}
                onChange={(e) =>
                  setForm({ ...form, expected_arrival: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => v && setForm({ ...form, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PCB_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label className="text-xs">Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-500">No PCB orders recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-2">GMP / Board</th>
                  <th className="py-2 pr-2">Supplier</th>
                  <th className="py-2 pr-2">External #</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2 pr-2 text-right">Unit $</th>
                  <th className="py-2 pr-2 text-right">Total $</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Ordered</th>
                  <th className="py-2 pr-2">Expected</th>
                  <th className="py-2 pr-2">Received</th>
                  <th className="py-2 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isEditing = editingId === o.id;
                  if (isEditing) {
                    return (
                      <tr key={o.id} className="border-b bg-yellow-50 align-top">
                        <td className="py-1 pr-2">
                          <Select
                            value={editForm.gmp_id || "__multi__"}
                            onValueChange={(v) =>
                              setEditForm({
                                ...editForm,
                                gmp_id:
                                  v == null || v === "__multi__" ? "" : v,
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="h-7 px-1 text-xs">
                              <SelectValue>
                                {(v: string) => {
                                  if (!v || v === "__multi__") return "(multi)";
                                  const g = memberGmps.find((g) => g.id === v);
                                  return g?.gmp_number ?? "";
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__multi__">(multi)</SelectItem>
                              {memberGmps.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.gmp_number}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            value={editForm.supplier}
                            onChange={(e) =>
                              setEditForm({ ...editForm, supplier: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            value={editForm.external_order_id}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                external_order_id: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="number"
                            value={editForm.quantity}
                            onChange={(e) =>
                              setEditForm({ ...editForm, quantity: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="number"
                            step="0.01"
                            value={editForm.unit_price}
                            onChange={(e) =>
                              setEditForm({ ...editForm, unit_price: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="number"
                            step="0.01"
                            value={editForm.total_price}
                            onChange={(e) =>
                              setEditForm({ ...editForm, total_price: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Select
                            value={editForm.status}
                            onValueChange={(v) =>
                              v && setEditForm({ ...editForm, status: v })
                            }
                          >
                            <SelectTrigger size="sm" className="h-7 px-1 text-xs">
                              <SelectValue>{(v: string) => v}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {PCB_STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="date"
                            value={editForm.ordered_date}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                ordered_date: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="date"
                            value={editForm.expected_arrival}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                expected_arrival: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            className="h-7 text-xs"
                            type="date"
                            value={editForm.received_date}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                received_date: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleUpdate(o.id)}
                              disabled={submitting}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b hover:bg-gray-50"
                      onClick={() => {
                        setEditingId(o.id);
                        setEditForm(orderToForm(o));
                      }}
                    >
                      <td className="py-2 pr-2 font-mono text-xs">
                        {o.gmps?.gmp_number ?? "—"}
                        {o.gmps?.board_name ? ` (${o.gmps.board_name})` : ""}
                      </td>
                      <td className="py-2 pr-2">{o.supplier ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono text-xs">
                        {o.external_order_id ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-right">{o.quantity ?? "—"}</td>
                      <td className="py-2 pr-2 text-right">
                        {fmtMoney(o.unit_price, o.currency)}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {fmtMoney(o.total_price, o.currency)}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge className={statusVariant(o.status)}>
                          {o.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 text-xs">{fmtDate(o.ordered_date)}</td>
                      <td className="py-2 pr-2 text-xs">
                        {fmtDate(o.expected_arrival)}
                      </td>
                      <td className="py-2 pr-2 text-xs">{fmtDate(o.received_date)}</td>
                      <td className="py-2 pr-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(o.id);
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
