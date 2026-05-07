"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, FileText, X, CheckCircle2, XCircle, CreditCard } from "lucide-react";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { BulkEditDialog } from "@/components/customers/bulk-edit-dialog";

interface Customer {
  id: string;
  code: string;
  company_name: string;
  folder_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  payment_terms: string | null;
  is_active: boolean;
}

type SortColumn = "code" | "company_name" | "folder_name" | "contact_name" | "payment_terms" | "is_active";
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // Bulk selection — IDs selected for bulk edit. Persists across pagination
  // so a user can page through, tick rows, and apply once.
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<"is_active" | "payment_terms">("is_active");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  function toggleOne(id: string) {
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

  function openBulk(field: "is_active" | "payment_terms") {
    setBulkField(field);
    setBulkOpen(true);
  }

  // One-click bulk status change. Skips the dialog because the value is
  // already implied by which button was clicked.
  async function applyStatus(isActive: boolean) {
    if (selected.size === 0) return;
    setBulkSaving(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/customers/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          updates: { is_active: isActive },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      clearSelection();
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  }

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  const filtered = useMemo(() => {
    let list = customers;
    const hasQuery = query.trim().length > 0;
    // Status filter — skipped entirely when a search is active so an
    // inactive customer still appears if their name/folder matches.
    if (!hasQuery) {
      if (statusFilter === "active") list = list.filter((c) => c.is_active);
      else if (statusFilter === "inactive") list = list.filter((c) => !c.is_active);
    }
    // Search filter
    if (hasQuery) {
      const q = query.toLowerCase();
      list = list.filter((c) =>
        c.code.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q) ||
        (c.folder_name ?? "").toLowerCase().includes(q) ||
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

  // Pagination — slice the sorted list down to the active page.
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageRows = sorted.slice(pageStart, pageEnd);

  // Reset to page 1 when filters/search change.
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, pageSize]);

  // Select-all-on-page: ticks every row currently visible. We track on the
  // page slice (not the full filtered list) so the checkbox state matches
  // what the user sees — predictable, even if there are 200 customers.
  const pageRowIds = pageRows.map((r) => r.id);
  const allOnPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.has(id));
  const someOnPageSelected = pageRowIds.some((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageRowIds) next.delete(id);
      } else {
        for (const id of pageRowIds) next.add(id);
      }
      return next;
    });
  }

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
      {/* Bulk action bar — appears only when at least one row is selected.
          "Mark active" / "Mark inactive" are one-click (no dialog) because
          the value is implied by the button. "Set payment terms" opens a
          dialog so the user can pick the new value. */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
            <span>
              {selected.size} customer{selected.size === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-300"
            >
              <X className="h-3 w-3" /> Clear
            </button>
            {bulkError && (
              <span className="ml-2 text-xs text-red-700 dark:text-red-300">{bulkError}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus(true)}
              disabled={bulkSaving}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
              Mark active
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus(false)}
              disabled={bulkSaving}
            >
              <XCircle className="mr-1.5 h-4 w-4 text-gray-600" />
              Mark inactive
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openBulk("payment_terms")}
              disabled={bulkSaving}
            >
              <CreditCard className="mr-1.5 h-4 w-4" />
              Set payment terms
            </Button>
          </div>
        </div>
      )}

      <div className="table-responsive rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                ref={(el) => {
                  // Indeterminate checkbox state when some-but-not-all on the
                  // current page are selected. React doesn't expose it as a
                  // prop, so we set it via ref.
                  if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                }}
                onChange={togglePage}
                aria-label="Select all on page"
                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </TableHead>
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
              <span className={headerClass} onClick={() => handleSort("folder_name")}>
                Folder Name
                <SortArrow column="folder_name" sort={sort} />
              </span>
            </TableHead>
            <TableHead>
              <span className={headerClass} onClick={() => handleSort("contact_name")}>
                Primary Contact
                <SortArrow column="contact_name" sort={sort} />
              </span>
            </TableHead>
            <TableHead>Primary Email</TableHead>
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
            <TableHead className="w-12" aria-label="Statement" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.length > 0 ? (
            pageRows.map((customer) => (
              <TableRow
                key={customer.id}
                className={selected.has(customer.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : undefined}
              >
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    checked={selected.has(customer.id)}
                    onChange={() => toggleOne(customer.id)}
                    aria-label={`Select ${customer.code}`}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </TableCell>
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
                <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">
                  {customer.folder_name ?? "\u2014"}
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
                <TableCell>
                  <Link
                    href={`/customers/${customer.id}/statement`}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    title="View account statement"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Statement</span>
                  </Link>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="py-0">
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

      {/* Pagination controls */}
      {sorted.length > 0 && (
        <div className="flex flex-col gap-2 px-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger size="sm" className="min-w-[5rem]">
                <SelectValue>{(v: string) => v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100, 250, 500].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-3 text-gray-500">
              {sorted.length === 0
                ? "0 of 0"
                : `${pageStart + 1}–${Math.min(pageEnd, sorted.length)} of ${sorted.length}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {selected.size > 0 && (
              <span className="mr-2 text-xs text-gray-500">
                {selected.size} selected across all pages
              </span>
            )}
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700"
            >
              ‹ Prev
            </button>
            <span className="px-2 text-gray-600 dark:text-gray-400">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700"
            >
              Next ›
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={safePage >= totalPages}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700"
            >
              »
            </button>
          </div>
        </div>
      )}

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedIds={Array.from(selected)}
        field={bulkField}
        onSuccess={clearSelection}
      />
    </div>
  );
}
