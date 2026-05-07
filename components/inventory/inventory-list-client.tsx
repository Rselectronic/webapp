"use client";

// ----------------------------------------------------------------------------
// components/inventory/inventory-list-client.tsx
// Client-side list table for the BG / Safety inventory feature. Used by
// both the main /inventory page and the Settings → Inventory landing page.
// ----------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import {
  type InventoryPartStock,
  type InventoryPool,
  poolLabel,
} from "@/lib/inventory/types";

type PoolFilter = "all" | InventoryPool;

interface Props {
  initialParts: InventoryPartStock[];
  /**
   * When true, the table renders without the surrounding Card chrome — useful
   * when the parent already wraps it in a Card (Settings → Inventory).
   */
  embedded?: boolean;
  /**
   * Optional slot to render extra controls (Add part / Import / etc.) on the
   * filter row. Used by Settings → Inventory.
   */
  rightSlot?: React.ReactNode;
  /**
   * Allow callers to mutate the in-memory list (e.g. after Add Part). Parents
   * pass setParts down so they can prepend new rows without a refetch.
   */
  setParts?: React.Dispatch<React.SetStateAction<InventoryPartStock[]>>;
}

export function InventoryListClient({
  initialParts,
  embedded = false,
  rightSlot,
  setParts: setPartsExternal,
}: Props) {
  // If the parent passed setParts in, we treat its initialParts as the source
  // of truth and skip the local mirror — otherwise hold our own state.
  const [internalParts, setInternalParts] = useState<InventoryPartStock[]>(initialParts);
  const parts = setPartsExternal ? initialParts : internalParts;
  const setParts = setPartsExternal ?? setInternalParts;
  // setParts isn't used inside this component yet, but exposing it keeps the
  // "no full refetch" rule available to parents (Add part, Import, etc.).
  void setParts;

  const [search, setSearch] = useState("");
  const [pool, setPool] = useState<PoolFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  // Sort state for the Serial No. column. Defaults to no sort (preserves the
  // server's CPC ordering). Click the header to toggle asc → desc → off.
  const [serialSort, setSerialSort] = useState<"asc" | "desc" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = parts.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (pool !== "all" && p.pool !== pool) return false;
      if (q) {
        // Serial first (operators ask "what's in slot 47?"), then CPC, MPN,
        // description, manufacturer.
        const hay = `${p.serial_no ?? ""} ${p.cpc} ${p.mpn ?? ""} ${p.description ?? ""} ${p.manufacturer ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (serialSort) {
      // Empty serials sort to the bottom regardless of direction so the
      // populated slots stay grouped at the top of the list.
      const dir = serialSort === "asc" ? 1 : -1;
      out.sort((a, b) => {
        const sa = a.serial_no ?? "";
        const sb = b.serial_no ?? "";
        if (!sa && !sb) return 0;
        if (!sa) return 1;
        if (!sb) return -1;
        // Natural-sort numbers when both serials look numeric, otherwise fall
        // back to a locale compare. Slots are typically integers ("47") but
        // the column is TEXT so we accommodate alphas too.
        const na = Number(sa);
        const nb = Number(sb);
        if (Number.isFinite(na) && Number.isFinite(nb)) {
          return (na - nb) * dir;
        }
        return sa.localeCompare(sb) * dir;
      });
    }
    return out;
  }, [parts, search, pool, showInactive, serialSort]);

  function toggleSerialSort() {
    setSerialSort((prev) =>
      prev === null ? "asc" : prev === "asc" ? "desc" : null,
    );
  }

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">
              <button
                type="button"
                onClick={toggleSerialSort}
                className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700"
                title="Sort by serial"
              >
                Serial No.
                {serialSort === "asc" && <span aria-hidden>▲</span>}
                {serialSort === "desc" && <span aria-hidden>▼</span>}
              </button>
            </th>
            <th className="px-4 py-2">CPC</th>
            <th className="px-4 py-2">MPN</th>
            <th className="px-4 py-2">Manufacturer</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Pool</th>
            <th className="px-4 py-2 text-right">Physical</th>
            <th className="px-4 py-2 text-right">Reserved</th>
            <th className="px-4 py-2 text-right">Available</th>
            <th className="px-4 py-2 text-right">Min</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const min = p.min_stock_threshold;
            const lowStock = min != null && p.available_qty < min;
            return (
              <tr
                key={p.id}
                className="border-b last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-4 py-2 font-mono text-xs text-gray-700">
                  {p.serial_no ?? "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  <Link
                    href={`/inventory/${p.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {p.cpc}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">
                  {p.mpn ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {p.manufacturer ?? "—"}
                </td>
                <td className="max-w-[260px] truncate px-4 py-2 text-xs text-gray-600">
                  {p.description ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant="outline">{poolLabel(p.pool)}</Badge>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {p.physical_qty}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                  {p.reserved_qty}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    lowStock ? "font-semibold text-red-600" : "text-gray-900"
                  }`}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {lowStock && <AlertTriangle className="h-3.5 w-3.5" />}
                    {p.available_qty}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                  {min ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {!p.is_active ? (
                    <Badge variant="outline" className="bg-gray-100 text-gray-600">
                      Inactive
                    </Badge>
                  ) : lowStock ? (
                    <Badge variant="destructive">Low</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      OK
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search serial, CPC, MPN, description…"
          className="max-w-xs"
        />
        <div className="flex items-center gap-1 rounded-md border bg-white p-0.5">
          {(["all", "bg", "safety"] as PoolFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPool(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                pool === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all" ? "All" : f === "bg" ? "BG" : "Safety"}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <span className="text-xs text-gray-500">
          {filtered.length} of {parts.length}
        </span>
        {rightSlot && <div className="ml-auto flex gap-2">{rightSlot}</div>}
      </div>

      {embedded ? (
        filtered.length === 0 ? (
          <p className="rounded-md border bg-white p-6 text-sm text-gray-500">
            No inventory parts match these filters.
          </p>
        ) : (
          <div className="rounded-md border bg-white">{table}</div>
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">
                No inventory parts match these filters.
              </p>
            ) : (
              table
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
