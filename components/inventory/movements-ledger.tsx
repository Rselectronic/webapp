"use client";

// ----------------------------------------------------------------------------
// components/inventory/movements-ledger.tsx
// Movement history table for one inventory part. Renders the immutable ledger
// returned by /api/inventory/[id]/movements.
// ----------------------------------------------------------------------------

import Link from "next/link";
import {
  type InventoryMovement,
  movementKindLabel,
} from "@/lib/inventory/types";
import { formatDateTime } from "@/lib/utils/format";

interface Props {
  movements: InventoryMovement[];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateTime(iso);
}

function LinkedRef({ m }: { m: InventoryMovement }) {
  // Only one link should normally be set; render whichever is non-null.
  if (m.proc_id) {
    return (
      <Link
        href={`/proc/${m.proc_id}`}
        className="text-blue-700 hover:underline"
      >
        PROC
      </Link>
    );
  }
  if (m.po_id) {
    return (
      <Link
        href={`/purchase-orders/${m.po_id}`}
        className="text-blue-700 hover:underline"
      >
        PO
      </Link>
    );
  }
  if (m.job_id) {
    return (
      <Link
        href={`/jobs/${m.job_id}`}
        className="text-blue-700 hover:underline"
      >
        Job
      </Link>
    );
  }
  return <span className="text-gray-400">—</span>;
}

export function MovementsLedger({ movements }: Props) {
  if (movements.length === 0) {
    return (
      <p className="rounded-md border bg-white p-6 text-sm text-gray-500">
        No movements recorded yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2 text-right">Delta</th>
            <th className="px-4 py-2 text-right">Before → After</th>
            <th className="px-4 py-2">Linked</th>
            <th className="px-4 py-2">Notes</th>
            <th className="px-4 py-2">By</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b last:border-b-0 hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-600">
                {formatWhen(m.created_at)}
              </td>
              <td className="px-4 py-2 text-xs">{movementKindLabel(m.kind)}</td>
              <td
                className={`px-4 py-2 text-right tabular-nums font-medium ${
                  m.delta > 0
                    ? "text-green-700"
                    : m.delta < 0
                      ? "text-red-700"
                      : "text-gray-600"
                }`}
              >
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </td>
              <td className="px-4 py-2 text-right text-xs tabular-nums text-gray-600">
                {m.qty_before} → {m.qty_after}
              </td>
              <td className="px-4 py-2 text-xs">
                <LinkedRef m={m} />
              </td>
              <td className="max-w-[280px] truncate px-4 py-2 text-xs text-gray-600">
                {m.notes ?? "—"}
              </td>
              <td className="px-4 py-2 text-xs text-gray-500">
                {/* The /movements GET joins users:created_by(id, full_name)
                    so the row carries a nested `users` object. We surface
                    full_name when present and fall back to a short id only
                    when the join missed (legacy rows / deleted users). */}
                {(() => {
                  const joined = (
                    m as InventoryMovement & {
                      users?:
                        | { full_name?: string | null }
                        | Array<{ full_name?: string | null }>
                        | null;
                      created_by_name?: string;
                    }
                  );
                  const userObj = Array.isArray(joined.users)
                    ? joined.users[0]
                    : joined.users;
                  return (
                    userObj?.full_name ??
                    joined.created_by_name ??
                    (m.created_by ? m.created_by.slice(0, 8) : "—")
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
