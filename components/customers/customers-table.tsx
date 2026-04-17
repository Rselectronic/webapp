"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";

interface Customer {
  id: string;
  code: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  payment_terms: string | null;
  is_active: boolean;
}

type SortColumn = "code" | "company_name" | "contact_name" | "payment_terms" | "is_active";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function SortArrow({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) return null;
  return (
    <span className="ml-1 text-blue-600 dark:text-blue-400">
      {sort.direction === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
}

export function CustomersTable({
  customers,
  search,
}: {
  customers: Customer[];
  search?: string;
}) {
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  const sorted = [...customers].sort((a, b) => {
    if (!sort.column) return 0;
    const col = sort.column;
    let aVal: string | boolean | null;
    let bVal: string | boolean | null;

    if (col === "is_active") {
      aVal = a.is_active;
      bVal = b.is_active;
      const cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      return sort.direction === "asc" ? cmp : -cmp;
    }

    aVal = a[col] ?? "";
    bVal = b[col] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
    return sort.direction === "asc" ? cmp : -cmp;
  });

  const headerClass =
    "cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors";

  return (
    <div className="table-responsive rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">
              <span className={headerClass} onClick={() => handleSort("code")}>
                Code
                <SortArrow column="code" sort={sort} />
              </span>
            </TableHead>
            <TableHead>
              <span className={headerClass} onClick={() => handleSort("company_name")}>
                Company Name
                <SortArrow column="company_name" sort={sort} />
              </span>
            </TableHead>
            <TableHead>
              <span className={headerClass} onClick={() => handleSort("contact_name")}>
                Contact
                <SortArrow column="contact_name" sort={sort} />
              </span>
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead>
              <span className={headerClass} onClick={() => handleSort("payment_terms")}>
                Payment Terms
                <SortArrow column="payment_terms" sort={sort} />
              </span>
            </TableHead>
            <TableHead className="w-24">
              <span className={headerClass} onClick={() => handleSort("is_active")}>
                Status
                <SortArrow column="is_active" sort={sort} />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length > 0 ? (
            sorted.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-mono font-medium text-blue-600 hover:underline"
                  >
                    {customer.code}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  {customer.company_name}
                </TableCell>
                <TableCell>{customer.contact_name ?? "\u2014"}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {customer.contact_email ?? "\u2014"}
                </TableCell>
                <TableCell>{customer.payment_terms}</TableCell>
                <TableCell>
                  <Badge variant={customer.is_active ? "default" : "secondary"}>
                    {customer.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-0">
                <EmptyState
                  icon={Users}
                  title="No customers found"
                  description={
                    search
                      ? `No results for "${search}". Try a different search term.`
                      : "Add your first customer to get started."
                  }
                  className="border-0"
                >
                  <CreateCustomerDialog />
                </EmptyState>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
