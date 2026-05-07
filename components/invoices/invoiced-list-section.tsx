"use client";

// ----------------------------------------------------------------------------
// InvoicedListSection
//
// Renders the existing invoices list, multi-job aware. Each row shows an
// invoice with a "# jobs" cell (N) and a chevron to expand the line detail
// (one sub-row per invoice_line). Customer, status, dates, total are
// invoice-level. Total Qty is the sum across all lines.
// ----------------------------------------------------------------------------

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { InvoiceRow } from "@/app/(dashboard)/invoices/page";

export function InvoicedListSection({
  rows,
  hasError,
  activeStatus,
}: {
  rows: InvoiceRow[];
  hasError: boolean;
  activeStatus: string;
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
        Failed to load invoices. Make sure the database migration has been applied.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description={
              activeStatus !== "all"
                ? `No invoices with status "${activeStatus}". Try a different filter.`
                : "Select pending jobs above and click “New Invoice”."
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">
        Invoiced
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({rows.length})
        </span>
      </h3>
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead># Jobs</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Days Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((inv) => {
              const isOpen = expanded.has(inv.id);
              const isOverdue = inv.effectiveStatus === "overdue";
              return (
                <Fragment key={inv.id}>
                  <TableRow className={isOverdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                    <TableCell className="w-10">
                      <button
                        type="button"
                        onClick={() => toggle(inv.id)}
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
                    <TableCell>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {inv.customer_code
                        ? `${inv.customer_code}${inv.customer_company ? ` — ${inv.customer_company}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        // NRE rows are engineering charges, not jobs — count
                        // distinct job_ids on board lines only.
                        const jobCount = new Set(
                          inv.lines
                            .filter((l) => !l.is_nre)
                            .map((l) => l.job_id)
                        ).size;
                        return (
                          <Badge variant="secondary">
                            {jobCount} job{jobCount === 1 ? "" : "s"}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {inv.totalQty}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(inv.total)}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.effectiveStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {inv.issued_date ? formatDate(inv.issued_date) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {inv.due_date ? formatDate(inv.due_date) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {inv.daysOutstanding != null ? (
                        <span
                          className={
                            isOverdue
                              ? "font-medium text-red-600"
                              : "text-gray-500"
                          }
                        >
                          {inv.daysOutstanding}d
                        </span>
                      ) : inv.status === "paid" ? (
                        <span className="text-green-600">Paid</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-gray-50/50 dark:bg-gray-900/20">
                      <TableCell colSpan={10} className="p-0">
                        <div className="px-12 py-3">
                          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                            Lines
                          </p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500">
                                <th className="py-1 pr-4 font-medium">Job #</th>
                                <th className="py-1 pr-4 font-medium">GMP / Board</th>
                                <th className="py-1 pr-4 font-medium">Qty</th>
                                <th className="py-1 pr-4 font-medium">Unit Price</th>
                                <th className="py-1 pr-4 font-medium">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inv.lines.map((l) => (
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
                                    {l.is_nre ? (
                                      <>
                                        <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                                          NRE
                                        </span>
                                        {l.gmp_number ?? ""}
                                      </>
                                    ) : (
                                      <>
                                        {l.gmp_number ?? "—"}
                                        {l.board_name ? (
                                          <span className="ml-1 text-gray-500">
                                            ({l.board_name})
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-1 pr-4">{l.quantity}</td>
                                  <td className="py-1 pr-4 font-mono">
                                    {formatCurrency(l.unit_price)}
                                  </td>
                                  <td className="py-1 pr-4 font-mono">
                                    {formatCurrency(l.line_total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {inv.notes && (
                            <p className="mt-3 whitespace-pre-wrap text-xs text-gray-600">
                              <span className="font-medium text-gray-500">
                                Notes:{" "}
                              </span>
                              {inv.notes}
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
