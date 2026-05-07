"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils/format";

interface PurchaseOrderLine {
  mpn?: string | null;
  cpc?: string | null;
  customer_ref?: string | null;
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  currency?: string | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  total_amount: number | null;
  status: string;
  pdf_url: string | null;
  created_at: string;
  currency?: string | null;
  lines?: PurchaseOrderLine[] | null;
}

interface Props {
  procId: string;
}

function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "—";
  const cur = currency ?? "CAD";
  const v = Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${v} ${cur}`;
}

function fmtUnit(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return formatDate(d);
  } catch {
    return d;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    case "sent":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "acknowledged":
    case "shipped":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "received":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "closed":
      return "bg-gray-200 text-gray-700 hover:bg-gray-200";
    default:
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
  }
}

export function PurchaseOrdersList({ procId }: Props) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-PO id while the user generates a PDF. The accept-quote flow
  // creates the supplier_pos row but doesn't auto-render the PDF, so we
  // expose a "Generate PDF" button for any PO whose pdf_url is still null.
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  // Single-row expansion: which PO's line items are currently revealed.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Which PO the operator is being asked to confirm deletion of. Null
  // when no dialog is open. We use the in-app AlertDialog instead of the
  // browser's window.confirm() so it matches the rest of the UI.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Per-PO id while a status PATCH is in flight, so we can disable the
  // dropdown and avoid double-submits.
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proc/${procId}/purchase-orders`);
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

  // React to sibling-driven mutations on the PO graph for this PROC.
  //
  // Two payload shapes flow through `proc:po-created` today:
  //   • `newPo`            → a quote was accepted, append the new PO row
  //                          to the top of the list.
  //   • `revertedQuoteIds` → a PO was deleted (self-dispatched). We
  //                          already cleaned up local state in
  //                          handleDelete; ignore here.
  // Anything else (legacy distributor "Create PO PDF" path that doesn't
  // ship a payload) falls back to a single fetchOrders. We don't blanket
  // refetch on every event — the user explicitly wants tables to update
  // inline whenever possible.
  useEffect(() => {
    function onChanged(e: Event) {
      const ce = e as CustomEvent<{
        procId?: string;
        newPo?: PurchaseOrder | null;
        revertedQuoteIds?: string[];
      }>;
      if (ce.detail?.procId && ce.detail.procId !== procId) return;
      if (ce.detail?.newPo) {
        const incoming = ce.detail.newPo;
        setOrders((prev) =>
          // Don't double-insert if React strict-mode fires the event twice
          // or the user clicks Accept rapidly.
          prev.some((o) => o.id === incoming.id) ? prev : [incoming, ...prev]
        );
        return;
      }
      if (Array.isArray(ce.detail?.revertedQuoteIds)) return; // self-delete; nothing to do
      fetchOrders();
    }
    window.addEventListener("proc:po-created", onChanged);
    return () => window.removeEventListener("proc:po-created", onChanged);
  }, [procId, fetchOrders]);

  async function handleGeneratePdf(id: string) {
    setGeneratingId(id);
    try {
      // Hit the PDF endpoint with ?json=1 so it returns the freshly-signed
      // URL instead of streaming the binary. We then patch ONLY this PO's
      // pdf_url in local state — refetching the whole list would re-fire
      // the loader and collapse any rows the user had expanded.
      const res = await fetch(`/api/supplier-pos/${id}/pdf?json=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { pdf_url: string | null };
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, pdf_url: j.pdf_url } : o))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/supplier-pos/${id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        reverted_quote_ids?: string[];
      };
      if (!res.ok) {
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // Drop the deleted PO from local state instead of refetching the
      // whole list — keeps any expanded rows intact.
      setOrders((prev) => prev.filter((o) => o.id !== id));
      // Tell sibling components what changed. The detail now carries the
      // ids of the supplier_quotes that rolled back to 'received', so the
      // SupplierQuotesPanel can patch its state instead of refetching.
      window.dispatchEvent(
        new CustomEvent("proc:po-created", {
          detail: {
            procId,
            revertedQuoteIds: j.reverted_quote_ids ?? [],
          },
        })
      );
      setPendingDeleteId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  // The PO whose line we're confirming deletion for — used purely to
  // render po_number in the AlertDialog title for context.
  const pendingDeleteOrder = pendingDeleteId
    ? orders.find((o) => o.id === pendingDeleteId) ?? null
    : null;

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  // Status workflow for a supplier PO. Order matters — the dropdown is
  // rendered in this sequence so the operator's eye flows naturally
  // through the lifecycle. The PATCH endpoint accepts any of these.
  const STATUS_OPTIONS = [
    "draft",
    "sent",
    "acknowledged",
    "shipped",
    "received",
    "closed",
  ] as const;

  async function handleStatusChange(id: string, next: string) {
    setStatusBusyId(id);
    // Optimistic update so the dropdown reflects the new value
    // immediately. If the PATCH fails we revert.
    const prevStatus = orders.find((o) => o.id === id)?.status;
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: next } : o))
    );
    try {
      const res = await fetch(`/api/supplier-pos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      // Revert on failure.
      if (prevStatus) {
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: prevStatus } : o))
        );
      }
      setError((e as Error).message);
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Purchase Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-500">
            No purchase orders created for this PROC yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="w-6 py-2 pr-1"></th>
                  <th className="py-2 pr-2">PO #</th>
                  <th className="py-2 pr-2">Supplier</th>
                  <th className="py-2 pr-2 text-right">Total</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Created</th>
                  <th className="py-2 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isOpen = expandedId === o.id;
                  const lines = Array.isArray(o.lines) ? o.lines : [];
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-1">
                          <button
                            type="button"
                            onClick={() => toggleExpand(o.id)}
                            aria-label={isOpen ? "Collapse line items" : "Expand line items"}
                            aria-expanded={isOpen}
                            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">{o.po_number}</td>
                        <td className="py-2 pr-2">{o.supplier_name}</td>
                        <td className="py-2 pr-2 text-right">{fmtMoney(o.total_amount, o.currency)}</td>
                        <td className="py-2 pr-2">
                          {/* Inline status dropdown so the operator can
                              advance draft → sent → received without
                              leaving the page. Visual style mimics the
                              previous Badge — coloured background tied
                              to the chosen status, no obvious select
                              chrome unless hovered/focused. */}
                          <Select
                            value={o.status}
                            disabled={statusBusyId === o.id}
                            onValueChange={(v) => v && handleStatusChange(o.id, v)}
                          >
                            <SelectTrigger
                              size="sm"
                              className={`h-6 rounded-full border-0 px-2 py-0.5 text-xs font-medium ring-1 ring-transparent hover:ring-gray-300 disabled:cursor-wait ${statusClass(o.status)}`}
                            >
                              <SelectValue>{(v: string) => v}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2 text-xs">{fmtDate(o.created_at)}</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            {o.pdf_url ? (
                              <a
                                href={o.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Open PDF
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGeneratePdf(o.id)}
                                disabled={generatingId === o.id}
                                className="text-xs text-blue-600 hover:underline disabled:cursor-wait disabled:opacity-50"
                              >
                                {generatingId === o.id ? "Generating…" : "Generate PDF"}
                              </button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setPendingDeleteId(o.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b bg-gray-50">
                          <td colSpan={7} className="px-4 py-3">
                            {lines.length === 0 ? (
                              <p className="text-xs text-gray-500">
                                No line items captured on this PO.
                              </p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b text-left text-gray-500">
                                      <th className="py-1.5 pr-2">CPC</th>
                                      <th className="py-1.5 pr-2">MPN</th>
                                      <th className="py-1.5 pr-2">Description</th>
                                      <th className="py-1.5 pr-2 text-right">Qty</th>
                                      <th className="py-1.5 pr-2 text-right">Unit</th>
                                      <th className="py-1.5 pr-2 text-right">Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((ln, idx) => (
                                      <tr key={idx} className="border-b border-gray-200 last:border-0">
                                        <td className="py-1.5 pr-2 font-mono text-gray-700">
                                          {ln.cpc ?? "—"}
                                        </td>
                                        <td className="py-1.5 pr-2 font-mono">
                                          {ln.mpn ?? "—"}
                                        </td>
                                        <td className="py-1.5 pr-2 text-gray-700">
                                          {ln.description ?? "—"}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right">
                                          {ln.qty ?? "—"}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right">
                                          {fmtUnit(ln.unit_price)}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right">
                                          {fmtMoney(
                                            ln.line_total,
                                            ln.currency ?? o.currency,
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Delete-confirmation dialog. Lives at Card root so the AlertDialog
          backdrop covers the whole page. We keep the open state coupled to
          pendingDeleteId so dismissing via Esc / backdrop also clears it. */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteOrder ? (
                <>
                  PO <span className="font-mono">{pendingDeleteOrder.po_number}</span>{" "}
                  to <strong>{pendingDeleteOrder.supplier_name}</strong> will be
                  deleted. Any supplier quote that produced this PO rolls back
                  to <em>received</em> and the affected procurement lines
                  return to <em>pending</em>.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (pendingDeleteId) handleDelete(pendingDeleteId);
              }}
            >
              {deleting ? "Deleting…" : "Delete PO"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
