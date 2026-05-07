"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, FileText, Check, X } from "lucide-react";
import { CreateSupplierQuoteDialog } from "./create-supplier-quote-dialog";
import { SUPPLIER_CURRENCIES, type SupplierQuoteStatus } from "@/lib/suppliers/types";
import { formatDate } from "@/lib/utils/format";
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

interface SupplierQuoteListRow {
  id: string;
  supplier_id: string;
  currency: string;
  status: SupplierQuoteStatus;
  subtotal: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
  valid_until: string | null;
  resulting_po_id: string | null;
  created_at: string;
  line_count: number;
  suppliers: {
    id: string;
    code: string;
    legal_name: string;
    online_only: boolean;
    default_currency: string;
  } | null;
  supplier_contacts: { id: string; name: string; email: string | null } | null;
}

// A "PROC line" here is a merged BOM row, NOT a procurement_lines row.
// Phase 3: we key on cpc (the business identity at RS) because two BOM lines
// with the same CPC but different MPNs collapse into one merged-BOM entry.
// procurement_lines may not exist yet — they get materialised on quote save.
// `unit_price` is the cached CAD price (from pinned distributor) so the
// dialog can show it as a sanity check next to the supplier-quoted price.
interface ProcLine {
  cpc: string;
  mpn: string | null;
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  qty_needed: number;
  qty_extra: number | null;
  unit_price: number | null;
}

interface Props {
  procId: string;
  procLines: ProcLine[];
}

function statusClass(status: SupplierQuoteStatus): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    case "requested":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "received":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "accepted":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "rejected":
      return "bg-red-100 text-red-800 hover:bg-red-100";
    case "expired":
      return "bg-gray-200 text-gray-600 hover:bg-gray-200";
  }
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null) return "—";
  const cur = SUPPLIER_CURRENCIES.includes(currency as never) ? currency : "CAD";
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

export function SupplierQuotesPanel({ procId, procLines }: Props) {
  const [quotes, setQuotes] = useState<SupplierQuoteListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Pending confirm dialogs — null when closed. Two separate "intents" so
  // the same id can drive different prompts. We use the in-app
  // AlertDialog instead of window.confirm to match the rest of the UI.
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proc/${procId}/quotes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setQuotes(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [procId]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // React to sibling-driven mutations on the PO/quote graph. The
  // PurchaseOrdersList sends `revertedQuoteIds` in the event detail when
  // it deletes a PO — we use that to patch only the affected rows
  // instead of refetching the entire list (which would flash the loader
  // and reset scroll). If we ever miss a payload, the merged-BOM panel
  // still refetches its own data via the same event.
  useEffect(() => {
    function onChanged(e: Event) {
      const ce = e as CustomEvent<{
        procId?: string;
        revertedQuoteIds?: string[];
      }>;
      if (ce.detail?.procId && ce.detail.procId !== procId) return;
      const reverted = ce.detail?.revertedQuoteIds;
      if (Array.isArray(reverted) && reverted.length > 0) {
        const ids = new Set(reverted);
        setQuotes((prev) =>
          prev.map((q) =>
            ids.has(q.id)
              ? { ...q, status: "received", resulting_po_id: null }
              : q
          )
        );
      }
      // No payload? Don't refetch — the panel only cares about delete
      // rollbacks here. New quote creates and acceptance already patch
      // local state at their source.
    }
    window.addEventListener("proc:po-created", onChanged);
    return () => window.removeEventListener("proc:po-created", onChanged);
    // fetchQuotes stays in the deps array — it's a useCallback so its
    // identity is stable across renders, and keeping it pinned avoids the
    // "deps array changed size between renders" warning HMR throws when
    // the previous build still has the old [procId, fetchQuotes] shape.
  }, [procId, fetchQuotes]);

  // CPCs already covered by an accepted quote — exclude from the Create
  // dialog so the operator doesn't double-book them. We look at each
  // accepted quote's lines and join through procurement_lines.cpc. Falls back
  // to procurement_lines.mpn when cpc is null (legacy rows pre-migration 081
  // that haven't been backfilled).
  const [coveredCpcs, setCoveredCpcs] = useState<Set<string>>(new Set());
  const refreshCovered = useCallback(async () => {
    const accepted = quotes.filter((q) => q.status === "accepted");
    if (accepted.length === 0) {
      setCoveredCpcs(new Set());
      return;
    }
    const all: string[] = [];
    for (const q of accepted) {
      const r = await fetch(`/api/quotes-supplier/${q.id}`);
      if (r.ok) {
        // The GET response joins procurement_lines on each quote line, so
        // cpc/mpn arrive as `lines[].procurement_lines.{cpc,mpn}`. Supabase
        // returns the joined record as either a single object or an array
        // depending on the relation hint — handle both shapes.
        const j = (await r.json()) as {
          lines: Array<{
            procurement_lines:
              | { cpc?: string | null; mpn?: string | null }
              | Array<{ cpc?: string | null; mpn?: string | null }>
              | null;
          }>;
        };
        for (const l of j.lines ?? []) {
          const pl = Array.isArray(l.procurement_lines)
            ? l.procurement_lines[0]
            : l.procurement_lines;
          const key = (pl?.cpc ?? pl?.mpn ?? "").trim().toUpperCase();
          if (key) all.push(key);
        }
      }
    }
    setCoveredCpcs(new Set(all));
  }, [quotes]);
  useEffect(() => {
    refreshCovered();
  }, [refreshCovered]);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes-supplier/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Quote marked ${status}`);
      fetchQuotes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function acceptQuote(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes-supplier/${id}/accept`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        po_id?: string;
        po_number?: string;
        // The accept route returns the full new PO row in the same shape
        // the purchase-orders list endpoint serves so we can hand it
        // straight to that sibling component without a refetch.
        new_po?: {
          id: string;
          po_number: string;
          supplier_name: string;
          total_amount: number | null;
          status: string;
          pdf_url: string | null;
          created_at: string;
          currency: string;
          lines: unknown[];
        };
      };
      if (!res.ok) throw new Error(j.error ?? "Accept failed");
      toast.success(`Quote accepted — PO ${j.po_number} created`);
      // Patch only the row that just changed instead of refetching the
      // whole list.
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: "accepted",
                resulting_po_id: j.po_id ?? q.resulting_po_id,
              }
            : q
        )
      );
      // Tell siblings what changed. PurchaseOrdersList prepends `newPo`
      // to its state; merged-bom-table still refetches its distributor
      // quotes (many cells affected, no clean delta).
      window.dispatchEvent(
        new CustomEvent("proc:po-created", {
          detail: { procId, newPo: j.new_po ?? null },
        })
      );
      setPendingAcceptId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuote(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes-supplier/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Delete failed");
      toast.success("Quote deleted");
      fetchQuotes();
      setPendingDeleteId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const availableLines = useMemo(
    () => procLines.filter((l) => !coveredCpcs.has(l.cpc.trim().toUpperCase())),
    [procLines, coveredCpcs]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Supplier Quotes</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={availableLines.length === 0}>
          <Plus className="mr-1 h-3 w-3" />
          Create Quote
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : quotes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No supplier quotes yet. Click <strong>Create Quote</strong> to enter
            a price quoted by a supplier (PCB fab, stencil, mechanical, etc.).
          </p>
        ) : (
          <div className="space-y-3">
            {quotes.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 bg-white p-3 text-sm"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">
                      {q.suppliers?.code ?? "—"}
                    </span>
                    <span className="font-medium">
                      {q.suppliers?.legal_name ?? "Unknown supplier"}
                    </span>
                    <Badge className={statusClass(q.status)}>{q.status}</Badge>
                  </div>
                  <div className="text-xs text-gray-500">
                    {q.line_count} line{q.line_count === 1 ? "" : "s"}
                    {q.supplier_contacts?.name && (
                      <>
                        {" · Attn: "}
                        <span className="text-gray-700">
                          {q.supplier_contacts.name}
                          {q.supplier_contacts.email ? ` <${q.supplier_contacts.email}>` : ""}
                        </span>
                      </>
                    )}
                    {q.valid_until && (
                      <>
                        {" · valid until "}
                        {formatDate(q.valid_until)}
                      </>
                    )}
                    {q.resulting_po_id && (
                      <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                        <FileText className="h-3 w-3" />
                        PO generated
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-right text-sm">
                    <span className="text-xs text-gray-500">Subtotal: </span>
                    {fmtMoney(q.subtotal, q.currency)}
                    <span className="ml-3 text-xs text-gray-500">Total: </span>
                    <span className="font-bold">{fmtMoney(q.total, q.currency)}</span>
                    <span className="ml-1 text-xs text-gray-500">{q.currency}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {/* New quotes always start as `received` (the operator
                        only enters prices that the supplier has actually
                        sent). draft / requested are kept in the schema for
                        legacy / backward-compat but the create flow skips
                        them, so the only actions on a non-accepted quote
                        are Accept, Reject, and Delete. */}
                    {(q.status === "draft" || q.status === "requested" || q.status === "received") && (
                      <>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busyId === q.id}
                          onClick={() => setPendingAcceptId(q.id)}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Accept &amp; Create PO
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-red-600"
                          disabled={busyId === q.id}
                          onClick={() => changeStatus(q.id, "rejected")}
                        >
                          <X className="mr-1 h-3 w-3" />
                          Reject
                        </Button>
                      </>
                    )}
                    {q.status !== "accepted" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-600"
                        disabled={busyId === q.id}
                        onClick={() => setPendingDeleteId(q.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {createOpen && (
          <CreateSupplierQuoteDialog
            procId={procId}
            availableLines={availableLines}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => {
              setCreateOpen(false);
              fetchQuotes();
            }}
          />
        )}
      </CardContent>

      {/* Confirm dialogs — both share the same busyId state machine; we
          only render two dialogs because the prompt + action label
          differs. Closing via Esc / backdrop is allowed unless busy. */}
      {(() => {
        const acceptingQuote = pendingAcceptId
          ? quotes.find((q) => q.id === pendingAcceptId) ?? null
          : null;
        const isAcceptBusy = !!pendingAcceptId && busyId === pendingAcceptId;
        return (
          <AlertDialog
            open={pendingAcceptId !== null}
            onOpenChange={(next) => {
              if (!next && !isAcceptBusy) setPendingAcceptId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Accept this quote?</AlertDialogTitle>
                <AlertDialogDescription>
                  {acceptingQuote ? (
                    <>
                      Accepting will generate a draft PO to{" "}
                      <strong>
                        {acceptingQuote.suppliers?.legal_name ?? "this supplier"}
                      </strong>{" "}
                      and mark the affected procurement lines as ordered.
                    </>
                  ) : (
                    "A draft PO will be generated."
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isAcceptBusy}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isAcceptBusy}
                  onClick={() => {
                    if (pendingAcceptId) acceptQuote(pendingAcceptId);
                  }}
                >
                  {isAcceptBusy ? "Accepting…" : "Accept & Create PO"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {(() => {
        const isDeleteBusy = !!pendingDeleteId && busyId === pendingDeleteId;
        return (
          <AlertDialog
            open={pendingDeleteId !== null}
            onOpenChange={(next) => {
              if (!next && !isDeleteBusy) setPendingDeleteId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
                <AlertDialogDescription>
                  The quote and its line items will be removed. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleteBusy}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isDeleteBusy}
                  onClick={() => {
                    if (pendingDeleteId) deleteQuote(pendingDeleteId);
                  }}
                >
                  {isDeleteBusy ? "Deleting…" : "Delete quote"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </Card>
  );
}
