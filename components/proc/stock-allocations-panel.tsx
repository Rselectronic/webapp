"use client";

// ----------------------------------------------------------------------------
// components/proc/stock-allocations-panel.tsx
//
// Sibling panel on the PROC detail page that shows every BG / Safety stock
// allocation tied to this procurement. Reserved rows can be released
// (DELETE /api/inventory/allocations/[id]); consumed rows are read-only
// history. A "Re-run allocation" button re-POSTs to the auto endpoint so
// operators can refresh after editing the BOM.
//
// Sibling components dispatch a `proc:allocations-changed` window event when
// they touch allocations; this panel listens for that event AND fires it
// after its own mutations so other views (merged BOM stock badge, inventory
// page) stay in sync without a full page reload.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/format";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  poolLabel,
  type InventoryAllocationStatus,
  type InventoryPool,
} from "@/lib/inventory/types";

export interface StockAllocationRow {
  id: string;
  inventory_part_id: string;
  qty_allocated: number;
  status: InventoryAllocationStatus;
  notes: string | null;
  created_at: string;
  consumed_at: string | null;
  released_at: string | null;
  // Joined fields off inventory_parts. CPC is the primary identifier
  // (UNIQUE NOT NULL on inventory_parts after migration 080); MPN is
  // informational and can be null when the bin's preferred MPN isn't recorded.
  pool: InventoryPool;
  cpc: string;
  mpn: string | null;
  description: string | null;
}

interface Props {
  procId: string;
  initialRows: StockAllocationRow[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return formatDateTime(d);
  } catch {
    return d;
  }
}

function poolBadgeClass(pool: InventoryPool): string {
  // BG = green (we have it loaded in feeders), Safety = blue (sit-on-shelf).
  return pool === "bg"
    ? "bg-green-100 text-green-800 hover:bg-green-100"
    : "bg-blue-100 text-blue-800 hover:bg-blue-100";
}

function statusBadgeClass(status: InventoryAllocationStatus): string {
  switch (status) {
    case "reserved":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    case "consumed":
      return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    case "released":
      return "bg-red-100 text-red-700 hover:bg-red-100";
  }
}

export function StockAllocationsPanel({ procId, initialRows }: Props) {
  const [rows, setRows] = useState<StockAllocationRow[]>(initialRows);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunMsg, setRerunMsg] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<StockAllocationRow | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // Re-fetch from server (used after re-run so we don't have to roundtrip the
  // full payload through the auto endpoint's response).
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/proc/${procId}/allocations`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = (await res.json()) as { allocations: StockAllocationRow[] };
      setRows(j.allocations ?? []);
    } catch {
      // best-effort; existing rows stay on screen
    }
  }, [procId]);

  // Listen for sibling-driven mutations so this panel stays current.
  useEffect(() => {
    function onChanged(e: Event) {
      const ce = e as CustomEvent<{ procId?: string }>;
      if (!ce.detail?.procId || ce.detail.procId === procId) refetch();
    }
    window.addEventListener("proc:allocations-changed", onChanged);
    return () =>
      window.removeEventListener("proc:allocations-changed", onChanged);
  }, [procId, refetch]);

  function notifySiblings() {
    window.dispatchEvent(
      new CustomEvent("proc:allocations-changed", { detail: { procId } }),
    );
  }

  async function handleRerun() {
    if (rerunBusy) return;
    setRerunBusy(true);
    setRerunMsg(null);
    try {
      // The auto endpoint server-side recomputes the merged BOM from the PROC's
      // member jobs. The UI only needs to ping it; payload is optional.
      const res = await fetch(`/api/proc/${procId}/allocations/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Re-run failed (${res.status})`);
      }
      await refetch();
      notifySiblings();
      setRerunMsg("Allocation refreshed.");
    } catch (err) {
      setRerunMsg(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunBusy(false);
      // Auto-clear the status after a couple seconds.
      setTimeout(() => setRerunMsg(null), 4000);
    }
  }

  async function handleRelease() {
    if (!releaseTarget || releaseBusy) return;
    setReleaseBusy(true);
    setReleaseError(null);
    const targetId = releaseTarget.id;
    try {
      const res = await fetch(`/api/inventory/allocations/${targetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Release failed (${res.status})`);
      }
      // Patch local state — the released row drops out of the reserved list.
      // (We don't keep released rows visible; they're noise after the fact.)
      setRows((s) => s.filter((r) => r.id !== targetId));
      setReleaseTarget(null);
      notifySiblings();
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleaseBusy(false);
    }
  }

  // Visible rows: reserved + consumed (released rows are pruned by the API
  // and by handleRelease above — keep historical 'consumed' for visibility).
  const visible = rows.filter((r) => r.status !== "released");

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm">
            Stock Allocations
            {visible.length > 0 && (
              <span className="ml-2 font-normal text-gray-500">
                ({visible.length} row{visible.length === 1 ? "" : "s"})
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {rerunMsg && (
              <span className="text-xs text-gray-500">{rerunMsg}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRerun}
              disabled={rerunBusy}
            >
              {rerunBusy ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Re-run allocation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-gray-500">
              No BG or Safety stock allocated for this PROC.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Pool</TableHead>
                  {/* CPC before MPN — CPC is the business identity at RS. */}
                  <TableHead>CPC</TableHead>
                  <TableHead>MPN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty allocated</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-44">Created</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={poolBadgeClass(r.pool)}
                      >
                        {poolLabel(r.pool)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.cpc ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.mpn ?? "—"}</TableCell>
                    <TableCell
                      className="max-w-[280px] truncate text-sm"
                      title={r.description ?? undefined}
                    >
                      {r.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.qty_allocated.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${statusBadgeClass(r.status)}`}
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {fmtDate(r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "reserved" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setReleaseError(null);
                            setReleaseTarget(r);
                          }}
                        >
                          Release
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={releaseTarget !== null}
        onOpenChange={(open) => {
          if (!open && !releaseBusy) {
            setReleaseTarget(null);
            setReleaseError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release this allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will return{" "}
              <span className="font-semibold">
                {releaseTarget?.qty_allocated.toLocaleString()}
              </span>{" "}
              unit{releaseTarget?.qty_allocated === 1 ? "" : "s"} of{" "}
              <span className="font-mono">
                {releaseTarget?.cpc ?? releaseTarget?.mpn ?? "—"}
              </span> from this
              PROC's reservation back into the{" "}
              {poolLabel(releaseTarget?.pool ?? "bg")} pool's available stock.
              Physical inventory is unchanged — this only undoes the soft hold.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseError && (
            <p className="text-sm text-red-600">{releaseError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releaseBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Prevent the dialog from auto-closing — let our handler manage it.
                e.preventDefault();
                handleRelease();
              }}
              disabled={releaseBusy}
              className="bg-red-600 hover:bg-red-700"
            >
              {releaseBusy ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Releasing…
                </>
              ) : (
                "Release"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
