"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Search } from "lucide-react";
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

type StatusFilter = "active" | "inactive" | "all";

export function CustomersTable({
  customers,
}: {
  customers: Customer[];
  search?: string;
}) {
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  const filtered = useMemo(() => {
    let list = customers;
    // Status filter
    if (statusFilter === "active") list = list.filter((c) => c.is_active);
    else if (statusFilter === "inactive") list = list.filter((c) => !c.is_active);
    // Search filter
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) =>
        c.code.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q) ||
        (c.contact_name ?? "").toLowerCase().includes(q) ||
        (c.contact_email ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [customers, query, statusFilter]);

  const sorted = [...filtered].sort((a, b) => {
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

  const statusButtons: { value: StatusFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search customers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {query && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {filtered.length} of {customers.length}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {statusButtons.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
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
                    query
                      ? `No results for "${query}". Try a different search term.`
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
    </div>
  );
}
