"use client";

// ----------------------------------------------------------------------------
// components/inventory/inventory-detail-client.tsx
// Client wrapper for the inventory part detail page. Owns the local copy of
// the part + movement list so we can patch them inline after edits / manual
// adjustments (no full refetch — see CLAUDE.md feedback).
// ----------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils/format";
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
import { AlertTriangle, Save, Wrench } from "lucide-react";
import {
  poolLabel,
  INVENTORY_POOLS,
  type InventoryMovement,
  type InventoryPartStock,
  type InventoryPool,
  type SerialHistoryRow,
} from "@/lib/inventory/types";
import { MovementsLedger } from "./movements-ledger";
import { ManualAdjustDialog } from "./manual-adjust-dialog";

// Trimmed shape of inventory_allocations + procurements + customers, joined
// in the server page and rendered as the Active Reservations table here.
export interface AllocationDisplayRow {
  id: string;
  qty_allocated: number;
  status: "reserved" | "consumed" | "released";
  notes: string | null;
  created_at: string;
  consumed_at: string | null;
  released_at: string | null;
  procurement_id: string;
  proc_code: string | null;
  customer_code: string | null;
  customer_name: string | null;
  created_by_name: string | null;
}

interface Props {
  initialPart: InventoryPartStock;
  initialMovements: InventoryMovement[];
  initialAllocations: AllocationDisplayRow[];
  initialSerialHistory: SerialHistoryRow[];
  /** Logged-in operator's display name. Used to fill the optimistic
   *  serial-history row's `assigned_by_name` so the table doesn't render
   *  "—" until the next page refresh. */
  currentUserName: string | null;
}

export function InventoryDetailClient({
  initialPart,
  initialMovements,
  initialAllocations,
  initialSerialHistory,
  currentUserName,
}: Props) {
  const [part, setPart] = useState<InventoryPartStock>(initialPart);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [allocations] = useState<AllocationDisplayRow[]>(initialAllocations);
  const [serialHistory, setSerialHistory] =
    useState<SerialHistoryRow[]>(initialSerialHistory);

  // Edit form state (mirrors the editable fields on the part).
  const [serialNo, setSerialNo] = useState<string>(part.serial_no ?? "");
  const [cpc, setCpc] = useState<string>(part.cpc);
  const [mpn, setMpn] = useState<string>(part.mpn ?? "");
  const [pool, setPool] = useState<InventoryPool>(part.pool);
  const [minThreshold, setMinThreshold] = useState<string>(
    part.min_stock_threshold != null ? String(part.min_stock_threshold) : "",
  );
  const [notes, setNotes] = useState<string>(part.notes ?? "");
  const [isActive, setIsActive] = useState<boolean>(part.is_active);
  const [saving, setSaving] = useState(false);

  // Surface a soft warning when the operator edits CPC — BOM-line matches key
  // off CPC, so changes break linkage to existing parsed BOMs.
  const cpcChanged = cpc.trim() !== part.cpc;

  const [adjustOpen, setAdjustOpen] = useState(false);

  const lowStock =
    part.min_stock_threshold != null &&
    part.available_qty < part.min_stock_threshold;

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const cpcTrimmed = cpc.trim();
    if (!cpcTrimmed) {
      toast.error("CPC is required");
      return;
    }

    const minNum = minThreshold.trim() ? Number(minThreshold) : null;
    if (minNum != null && (!Number.isFinite(minNum) || minNum < 0)) {
      toast.error("Min threshold must be a non-negative number");
      return;
    }

    const mpnNext = mpn.trim() || null;
    const serialTrimmed = serialNo.trim();
    const serialNext = serialTrimmed === "" ? null : serialTrimmed;
    const serialChanged = (part.serial_no ?? null) !== serialNext;

    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/${part.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_no: serialNext,
          cpc: cpcTrimmed,
          mpn: mpnNext,
          pool,
          min_stock_threshold: minNum,
          notes: notes.trim() || null,
          is_active: isActive,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 from a serial collision returns existing_part_id so the
        // operator can deep-link to the conflicting part and clear it
        // first. Surface the message verbatim.
        throw new Error(j.error ?? "Save failed");
      }

      // Patch the in-memory part — qty fields are unchanged by an edit, so
      // we don't need to refetch the view.
      setPart((prev) => ({
        ...prev,
        serial_no: serialNext,
        cpc: cpcTrimmed,
        mpn: mpnNext,
        pool,
        min_stock_threshold: minNum,
        notes: notes.trim() || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }));

      // Inline-patch the serial history. The API performed best-effort
      // close + open writes; mirror them locally so the operator sees the
      // change without a refetch. We use the logged-in operator's display
      // name (passed in from the server page) so "Assigned by" / "Released
      // by" populate immediately rather than rendering "—" until refresh.
      if (serialChanged) {
        const nowIso = new Date().toISOString();
        setSerialHistory((prev) => {
          // Close the currently-open row (if any) — stamp the operator
          // as the unassigner so the closed-row "Released by" cell fills
          // in optimistically too.
          const closed = prev.map((row) =>
            row.unassigned_at == null
              ? {
                  ...row,
                  unassigned_at: nowIso,
                  unassigned_by_name: currentUserName,
                }
              : row,
          );
          // Prepend a new open row when the operator set a non-null
          // value. Clearing the serial only closes — no new open row.
          if (serialNext != null) {
            const optimistic: SerialHistoryRow = {
              id: `optimistic-${Date.now()}`,
              serial_no: serialNext,
              inventory_part_id: part.id,
              assigned_at: nowIso,
              unassigned_at: null,
              notes: null,
              assigned_by_name: currentUserName,
              unassigned_by_name: null,
            };
            return [optimistic, ...closed];
          }
          return closed;
        });
      }

      // Reset the local form refs to the saved values so the cpc-changed hint
      // clears after a successful save.
      setCpc(cpcTrimmed);
      setMpn(mpnNext ?? "");
      setSerialNo(serialNext ?? "");
      toast.success("Part saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleAdjusted(m: InventoryMovement) {
    // Prepend the new movement and update physical_qty / available_qty inline.
    setMovements((prev) => [m, ...prev]);
    setPart((prev) => ({
      ...prev,
      physical_qty: m.qty_after,
      // available = physical - reserved; reserved is unaffected by manual adj.
      available_qty: m.qty_after - prev.reserved_qty,
      updated_at: new Date().toISOString(),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {part.cpc}
            </h2>
            <Badge variant="outline">{poolLabel(part.pool)}</Badge>
            {!part.is_active && (
              <Badge variant="outline" className="bg-gray-100 text-gray-600">
                Inactive
              </Badge>
            )}
            {lowStock && (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Low stock
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Serial:{" "}
            <span className="font-mono">{part.serial_no ?? "—"}</span>
            {" · "}MPN:{" "}
            <span className="font-mono">{part.mpn ?? "—"}</span>
            {part.manufacturer ? <> · {part.manufacturer}</> : null}
          </p>
          {part.description && (
            <p className="text-sm text-gray-600">{part.description}</p>
          )}
        </div>
        <Button onClick={() => setAdjustOpen(true)}>
          <Wrench className="mr-1 h-4 w-4" />
          Manual adjust
        </Button>
      </div>

      {/* Stock at a glance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock at a glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Physical
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                {part.physical_qty}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Reserved
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-500">
                {part.reserved_qty}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Available
              </p>
              <p
                className={`mt-1 text-3xl font-bold tabular-nums ${
                  lowStock ? "text-red-600" : "text-gray-900"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {lowStock && <AlertTriangle className="h-5 w-5" />}
                  {part.available_qty}
                </span>
              </p>
            </div>
          </div>
          {part.min_stock_threshold != null && (
            <p
              className={`mt-4 text-center text-xs ${
                lowStock ? "font-medium text-red-600" : "text-gray-500"
              }`}
            >
              Min threshold: {part.min_stock_threshold}
              {lowStock && " — below threshold"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit part */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit part</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveEdits} className="space-y-4">
            {/* Serial No. — feeder-slot identifier. Lives at the very top of
                the form and immediately BEFORE CPC, mirroring the operator's
                Excel column order (Serial · CPC · MPN · …). */}
            <div>
              <Label htmlFor="edit-serial">Serial No.</Label>
              <Input
                id="edit-serial"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                className="font-mono"
                placeholder="— (no slot assigned)"
              />
              <p className="mt-1 text-xs text-gray-500">
                BG feeder-slot identifier. Leave blank to release the slot.
                Reassigning a slot held by another part will fail with a
                conflict — clear it from that part first.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-cpc">CPC *</Label>
                <Input
                  id="edit-cpc"
                  value={cpc}
                  onChange={(e) => setCpc(e.target.value)}
                  className="font-mono"
                  required
                />
                {cpcChanged && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      Changing CPC will break any existing BOM-line matches
                      against this part.
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-mpn">MPN</Label>
                <Input
                  id="edit-mpn"
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  className="font-mono"
                  placeholder="—"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-pool">Pool</Label>
                <Select
                  value={pool}
                  onValueChange={(v) => v && setPool(v as InventoryPool)}
                >
                  <SelectTrigger id="edit-pool" className="mt-1 w-full">
                    <SelectValue>
                      {(v: string) => v ? poolLabel(v as InventoryPool) : ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_POOLS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {poolLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-min">Min stock threshold</Label>
                <Input
                  id="edit-min"
                  type="number"
                  step={1}
                  min={0}
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="mr-1 h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Movements ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <MovementsLedger movements={movements} />
        </CardContent>
      </Card>

      {/* Active reservations + recent history. Reserved rows are open holds
          against future PROCs; consumed rows are historical and tell the
          operator when a build pulled the parts off the shelf. Released
          rows show "Re-run allocation" undos and operator-driven releases. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Reservations
            <span className="ml-2 text-xs font-normal text-gray-500">
              who has this part on hold
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {allocations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              No PROC has reserved this part yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">PROC</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Reserved by</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => {
                    const statusColor =
                      a.status === "reserved"
                        ? "bg-amber-100 text-amber-800"
                        : a.status === "consumed"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-200 text-gray-700";
                    return (
                      <tr
                        key={a.id}
                        className="border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {formatDateTime(a.created_at)}
                        </td>
                        <td className="px-4 py-2 text-xs font-mono">
                          {a.proc_code ? (
                            <Link
                              href={`/proc/${a.procurement_id}`}
                              className="text-blue-700 hover:underline"
                            >
                              {a.proc_code}
                            </Link>
                          ) : (
                            <Link
                              href={`/proc/${a.procurement_id}`}
                              className="text-blue-700 hover:underline"
                            >
                              (open)
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-700">
                          {a.customer_code ? (
                            <>
                              <span className="font-mono text-gray-500">
                                {a.customer_code}
                              </span>{" "}
                              {a.customer_name ?? ""}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {a.qty_allocated}
                        </td>
                        <td className="px-4 py-2">
                          <Badge
                            className={`text-xs ${statusColor} hover:${statusColor}`}
                          >
                            {a.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {a.created_by_name ?? "—"}
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

      {/* Serial assignment history — every (slot ↔ part) mapping that has
          ever been recorded against THIS part. Open rows (unassigned_at is
          null) get the "currently active" badge so the operator can see at
          a glance which slot the part lives in right now. The full audit
          trail lets them answer "what was in slot 47 last quarter?" by
          cross-referencing other parts with the same serial. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Serial assignments
            <span className="ml-2 text-xs font-normal text-gray-500">
              feeder-slot history for this part
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {serialHistory.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">—</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Serial</th>
                    <th className="px-4 py-2">Assigned at</th>
                    <th className="px-4 py-2">Assigned by</th>
                    <th className="px-4 py-2">Released at</th>
                    <th className="px-4 py-2">Released by</th>
                    <th className="px-4 py-2">Notes</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {serialHistory.map((row) => {
                    const open = row.unassigned_at == null;
                    return (
                      <tr
                        key={row.id}
                        className="border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2 font-mono text-xs">
                          {row.serial_no}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {formatDateTime(row.assigned_at)}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {row.assigned_by_name ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {row.unassigned_at
                            ? formatDateTime(row.unassigned_at)
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {row.unassigned_by_name ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {row.notes ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          {open ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Currently active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-100 text-gray-600"
                            >
                              Released
                            </Badge>
                          )}
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

      <ManualAdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        partId={part.id}
        currentPhysicalQty={part.physical_qty}
        onAdjusted={handleAdjusted}
      />
    </div>
  );
}
