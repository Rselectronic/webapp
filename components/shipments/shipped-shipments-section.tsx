"use client";

// ----------------------------------------------------------------------------
// ShippedShipmentsSection
//
// Renders the existing shipments list, but multi-job aware. Each row shows a
// shipment with a "# jobs" cell (N) and a chevron to expand the line detail
// (one sub-row per shipment_line). Carrier, tracking, status, etc. are
// shipment-level. Quantity is the total across all lines.
// ----------------------------------------------------------------------------

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import { UpdateShipmentStatus } from "@/components/shipments/update-shipment-status";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { ShipmentRow } from "@/app/(dashboard)/shipping/page";

export function ShippedShipmentsSection({
  rows,
  hasError,
}: {
  rows: ShipmentRow[];
  hasError: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (hasError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load shipments. Make sure the database migration has been applied.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Truck className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-900">No shipments found</p>
          <p className="mt-1 text-gray-500">
            Select pending jobs above and click &quot;New Shipment&quot;.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">
        Shipped
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({rows.length})
        </span>
      </h3>
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Ship Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead># Jobs</TableHead>
              <TableHead>Total Qty</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Tracking / Pickup</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const isOpen = expanded.has(s.id);
              const isPickup = s.carrier === "Customer Pickup";
              return (
                <Fragment key={s.id}>
                  <TableRow>
                    <TableCell className="w-10">
                      <button
                        type="button"
                        onClick={() => toggle(s.id)}
                        aria-label={
                          isOpen ? "Collapse line details" : "Expand line details"
                        }
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {s.ship_date ? formatDate(s.ship_date) : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.customer_code
                        ? `${s.customer_code}${s.customer_company ? ` — ${s.customer_company}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="secondary">
                        {s.lines.length} job{s.lines.length === 1 ? "" : "s"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.totalQty} board{s.totalQty === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.carrier}</Badge>
                    </TableCell>
                    <TableCell>
                      {isPickup ? (
                        <span className="text-sm text-gray-700">
                          {s.picked_up_by ? (
                            <>
                              Picked up by <strong>{s.picked_up_by}</strong>
                            </>
                          ) : (
                            <span className="italic text-gray-400">
                              In-person pickup
                            </span>
                          )}
                        </span>
                      ) : s.tracking_number ? (
                        <span className="font-mono text-sm">
                          {s.tracking_number}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {s.shipping_cost
                        ? formatCurrency(Number(s.shipping_cost))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <UpdateShipmentStatus
                        shipmentId={s.id}
                        currentStatus={s.status}
                      />
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow
                      className="bg-gray-50/50 dark:bg-gray-900/20"
                    >
                      <TableCell colSpan={10} className="p-0">
                        <div className="px-12 py-3">
                          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                            Lines
                          </p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500">
                                <th className="py-1 pr-4 font-medium">Job #</th>
                                <th className="py-1 pr-4 font-medium">GMP</th>
                                <th className="py-1 pr-4 font-medium">Quantity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.lines.map((l) => (
                                <tr key={l.id} className="border-t">
                                  <td className="py-1 pr-4 font-mono">
                                    {l.job_number ? (
                                      <Link
                                        href={`/jobs/${l.job_id}`}
                                        className="text-blue-600 hover:underline"
                                      >
                                        {l.job_number}
                                      </Link>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-1 pr-4 font-mono text-gray-600">
                                    {l.gmp_number ?? "—"}
                                  </td>
                                  <td className="py-1 pr-4">
                                    {l.quantity} board
                                    {l.quantity === 1 ? "" : "s"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {s.notes && (
                            <p className="mt-3 whitespace-pre-wrap text-xs text-gray-600">
                              <span className="font-medium text-gray-500">
                                Notes:{" "}
                              </span>
                              {s.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
