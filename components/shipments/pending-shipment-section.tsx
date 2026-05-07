"use client";

// ----------------------------------------------------------------------------
// PendingShipmentSection
//
// Client-side selection state for the Pending Shipment list. Each row is a
// JOB with available_to_ship > 0. Operators tick checkboxes from the SAME
// customer and click "New Shipment" — opens <CreateShipmentDialog> seeded
// with those jobs.
//
// Cross-customer selections are blocked: the bulk-action button is disabled
// with explanatory text. This is the cleanest UX given that one shipment
// (carrier + tracking + addressee) can only ship to one customer.
// ----------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateShipmentDialog } from "@/components/shipments/create-shipment-dialog";
import type { PendingJobRow } from "@/app/(dashboard)/shipping/page";
import { formatDate } from "@/lib/utils/format";

function formatDateShort(d: string | null): string {
  if (!d) return "—";
  return formatDate(d);
}

export function PendingShipmentSection({ rows }: { rows: PendingJobRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  // The bulk action only makes sense within a single customer. If the user
  // crosses customers we keep their selection (so they can correct it) but
  // disable the New Shipment button with explanatory text.
  const customerIds = useMemo(
    () => new Set(selectedRows.map((r) => r.customer_id)),
    [selectedRows]
  );
  const hasSelection = selectedRows.length > 0;
  const sameCustomer = customerIds.size <= 1;
  const customerCode = selectedRows[0]?.customer_code ?? "";
  const customerCompany = selectedRows[0]?.customer_company ?? "";
  const customerLabel =
    customerCode && customerCompany
      ? `${customerCode} — ${customerCompany}`
      : customerCode || customerCompany;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Pending Shipment
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({rows.length})
          </span>
        </h3>
      </div>

      {/* Sticky bulk-action bar — only visible when selection > 0. */}
      {hasSelection && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30">
          <div className="text-sm">
            <span className="font-medium">
              {selectedRows.length} selected
            </span>
            {sameCustomer ? (
              customerCode ? (
                <span className="ml-1 text-gray-700 dark:text-gray-300">
                  ({customerCode})
                </span>
              ) : null
            ) : (
              <span className="ml-2 text-red-700">
                All selected jobs must be from the same customer
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              disabled={!sameCustomer}
              onClick={() => setDialogOpen(true)}
            >
              New Shipment
              {sameCustomer && customerCode ? ` for ${selectedRows.length} ${customerCode} job${selectedRows.length === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Truck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-900">Nothing pending shipment</p>
            <p className="mt-1 text-sm text-gray-500">
              When operators release boards from production they appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead>GMP / Board</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isChecked = selected.has(r.id);
                return (
                  <TableRow
                    key={r.id}
                    className={isChecked ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}
                  >
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.job_number}`}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.customer_code}
                      {r.customer_company ? (
                        <span className="ml-1 font-normal text-gray-500">
                          — {r.customer_company}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/jobs/${r.id}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {r.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono">{r.gmp_number ?? "—"}</span>
                      {r.board_name ? (
                        <span className="ml-1 text-gray-500">
                          ({r.board_name})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium text-gray-900">
                        {r.available}
                      </span>{" "}
                      <span className="text-gray-500">of {r.quantity}</span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDateShort(r.due_date)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* The dialog is rendered once and driven by props from the selection.
          When the user closes it we also clear the selection — they're done. */}
      {hasSelection && sameCustomer && (
        <CreateShipmentDialog
          open={dialogOpen}
          onOpenChange={(next) => {
            setDialogOpen(next);
            if (!next) {
              // After successful submit (router.refresh) the selection is
              // stale anyway — clear so the bar disappears cleanly.
              clearSelection();
            }
          }}
          customerId={selectedRows[0]?.customer_id ?? ""}
          customerLabel={customerLabel}
          candidateJobs={rows
            .filter((r) => r.customer_id === selectedRows[0]?.customer_id)
            .map((r) => ({
              id: r.id,
              job_number: r.job_number,
              available_to_ship: r.available,
              customer_id: r.customer_id,
              gmps: r.gmp_number ? { gmp_number: r.gmp_number } : null,
            }))}
          initialSelectedJobIds={selectedRows.map((r) => r.id)}
        />
      )}
    </section>
  );
}
