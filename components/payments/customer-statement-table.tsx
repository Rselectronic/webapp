"use client";

// ----------------------------------------------------------------------------
// Customer statement ledger table
//
// Renders the chronological ledger: each row is either an invoice (charge) or
// a payment (credit), with a running balance column. Reference cells link to
// the underlying record where applicable. Pure presentational — no fetching.
// ----------------------------------------------------------------------------

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export type LedgerEntry =
  | {
      kind: "invoice";
      id: string;
      date: string; // ISO
      reference: string; // invoice_number
      description: string;
      amount: number; // positive — charges to the customer
    }
  | {
      kind: "payment";
      id: string;
      date: string; // ISO
      reference: string; // method + ref no
      description: string;
      amount: number; // positive — credit to the customer
    };

interface Props {
  entries: LedgerEntry[];
  openingBalance?: number;
}

export function CustomerStatementTable({ entries, openingBalance = 0 }: Props) {
  // Compute running balance.
  let balance = openingBalance;
  const rows = entries.map((e) => {
    if (e.kind === "invoice") balance += e.amount;
    else balance -= e.amount;
    return { entry: e, balance };
  });

  return (
    <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Date</TableHead>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-40">Reference</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-32 text-right">Charges</TableHead>
            <TableHead className="w-32 text-right">Payments</TableHead>
            <TableHead className="w-32 text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {openingBalance !== 0 && (
            <TableRow className="bg-muted/40">
              <TableCell className="text-sm text-gray-500">—</TableCell>
              <TableCell className="text-sm italic text-gray-500">
                Opening
              </TableCell>
              <TableCell />
              <TableCell className="italic text-gray-500">
                Opening balance
              </TableCell>
              <TableCell className="text-right font-mono text-sm" />
              <TableCell className="text-right font-mono text-sm" />
              <TableCell className="text-right font-mono text-sm font-medium">
                {formatCurrency(openingBalance)}
              </TableCell>
            </TableRow>
          )}

          {rows.length === 0 && openingBalance === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-sm italic text-gray-500"
              >
                No activity in this period.
              </TableCell>
            </TableRow>
          )}

          {rows.map(({ entry, balance: runningBalance }) => {
            const isInvoice = entry.kind === "invoice";
            return (
              <TableRow key={`${entry.kind}-${entry.id}`}>
                <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                  {formatDate(entry.date)}
                </TableCell>
                <TableCell className="text-sm">
                  {isInvoice ? (
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      Invoice
                    </span>
                  ) : (
                    <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      Payment
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {isInvoice ? (
                    <Link
                      href={`/invoices/${entry.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {entry.reference}
                    </Link>
                  ) : (
                    <span className="text-gray-700 dark:text-gray-300">
                      {entry.reference}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                  {entry.description || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {isInvoice ? formatCurrency(entry.amount) : ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-green-700">
                  {!isInvoice ? formatCurrency(entry.amount) : ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">
                  {formatCurrency(runningBalance)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
