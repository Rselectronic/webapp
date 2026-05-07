"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";

export interface PendingOrderRow {
  id: string;
  po_number: string | null;
  po_date: string | null;
  quantity: number;
  gmp_number: string | null;
  board_name: string | null;
  bom_file_name: string | null;
  quote_number: string | null;
  procurement_mode: string | null;
  frozen_unit_price: number | null;
  frozen_subtotal: number | null;
}

function modeLetter(mode: string | null): string {
  if (!mode) return "—";
  if (mode === "turnkey") return "T";
  if (mode === "assembly_only") return "A";
  if (mode.startsWith("consign")) return "C";
  return "?";
}

export function PendingOrdersTable({
  customerCode,
  customerName,
  rows,
}: {
  customerCode: string;
  customerName: string;
  rows: PendingOrderRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  const modesInSelection = useMemo(() => {
    const s = new Set<string>();
    for (const r of selectedRows) {
      if (r.procurement_mode) s.add(r.procurement_mode);
    }
    return s;
  }, [selectedRows]);

  const mixedModes = modesInSelection.size > 1;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/proc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create PROC Batch");
        setSubmitting(false);
        return;
      }
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="font-semibold">
            {customerCode} — {customerName}
          </div>
          <div className="text-xs text-gray-500">
            {rows.length} pending order{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">PO#</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">PO Date</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">GMP</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">BOM</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Qty</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Quote#</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Mode</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Unit $</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.po_number ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.po_date ? formatDate(r.po_date) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.gmp_number ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.bom_file_name ?? "—"}</td>
                <td className="px-3 py-2">{r.quantity}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.quote_number ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {modeLetter(r.procurement_mode)}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.frozen_unit_price != null
                    ? `$${r.frozen_unit_price.toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.frozen_subtotal != null
                    ? `$${r.frozen_subtotal.toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        <div className="text-xs">
          {mixedModes && (
            <span className="text-amber-600 dark:text-amber-400">
              Mixed procurement modes selected — all orders in a PROC Batch must share one mode.
            </span>
          )}
          {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
        </div>
        <Button
          size="sm"
          disabled={selected.size === 0 || mixedModes || submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? "Creating…"
            : `Create PROC Batch from ${selected.size} selected`}
        </Button>
      </div>
    </div>
  );
}
