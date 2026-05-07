"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  supplier_name: string;
  total_amount: number | null;
  status: string;
  pdf_url: string | null;
  created_at: string;
  procurement_id: string | null;
  procurements: {
    proc_code: string | null;
    customers: { code: string | null; company_name: string | null } | null;
  } | null;
}

interface Props {
  rows: PurchaseOrderRow[];
}

function fmtCAD(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export function PurchaseOrdersTable({ rows }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this purchase order?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/supplier-pos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No purchase orders found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-2 pr-2">PO #</th>
            <th className="py-2 pr-2">Supplier</th>
            <th className="py-2 pr-2">PROC Code</th>
            <th className="py-2 pr-2">Customer</th>
            <th className="py-2 pr-2 text-right">Total</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2 pr-2">Created</th>
            <th className="py-2 pr-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const cust = o.procurements?.customers;
            const custLabel = cust
              ? `${cust.code ?? ""}${cust.company_name ? ` — ${cust.company_name}` : ""}`
              : "—";
            return (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-2 font-mono text-xs">{o.po_number}</td>
                <td className="py-2 pr-2">{o.supplier_name}</td>
                <td className="py-2 pr-2 font-mono text-xs">
                  {o.procurement_id && o.procurements?.proc_code ? (
                    <Link
                      href={`/proc/${o.procurement_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {o.procurements.proc_code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-2 text-xs">{custLabel}</td>
                <td className="py-2 pr-2 text-right">{fmtCAD(o.total_amount)}</td>
                <td className="py-2 pr-2">
                  <Badge className={statusClass(o.status)}>{o.status}</Badge>
                </td>
                <td className="py-2 pr-2 text-xs">{fmtDate(o.created_at)}</td>
                <td className="py-2 pr-2">
                  <div className="flex gap-2">
                    {o.pdf_url && (
                      <a
                        href={o.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Open PDF
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-600"
                      onClick={() => handleDelete(o.id)}
                      disabled={deletingId === o.id}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
