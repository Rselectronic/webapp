"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Calculator, Plus, Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { formatDateTime } from "@/lib/utils/format";

export interface QuoteRow {
  id: string;
  quote_number: string;
  status: string;
  quantities: { tiers?: number[]; [k: string]: unknown } | null;
  pricing: unknown;
  created_at: string | null;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string } | null;
}

type StatusFilter = "all" | "draft" | "review" | "sent" | "accepted" | "rejected" | "expired";
type SortColumn = "quote_number" | "customer" | "gmp" | "status" | "created_at";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

const STATUS_BUTTONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

function SortArrow({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) return null;
  return (
    <span className="ml-1 text-blue-600 dark:text-blue-400">
      {sort.direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

function formatQuantities(q: QuoteRow["quantities"]): string {
  if (!q) return "—";
  if (Array.isArray(q.tiers) && q.tiers.length > 0) return q.tiers.join(", ");
  const legacyNums = Object.values(q).filter(
    (v): v is number => typeof v === "number"
  );
  if (legacyNums.length > 0) return legacyNums.join(" / ");
  return "—";
}

export function QuotesTable({ quotes }: { quotes: QuoteRow[] }) {
  const [sort, setSort] = useState<SortState>({
    column: "created_at",
    direction: "desc",
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  const filtered = useMemo(() => {
    let list = quotes;
    if (statusFilter !== "all") {
      list = list.filter((q) => q.status === statusFilter);
    }
    if (query.trim()) {
      const needle = query.toLowerCase();
      list = list.filter(
        (q) =>
          q.quote_number.toLowerCase().includes(needle) ||
          (q.customers?.code ?? "").toLowerCase().includes(needle) ||
          (q.customers?.company_name ?? "").toLowerCase().includes(needle) ||
          (q.gmps?.gmp_number ?? "").toLowerCase().includes(needle) ||
          q.status.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [quotes, query, statusFilter]);

  const sorted = useMemo(() => {
    if (!sort.column) return filtered;
    const col = sort.column;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let aVal: string;
      let bVal: string;
      switch (col) {
        case "quote_number":
          aVal = a.quote_number;
          bVal = b.quote_number;
          break;
        case "customer":
          aVal = a.customers?.code ?? "";
          bVal = b.customers?.code ?? "";
          break;
        case "gmp":
          aVal = a.gmps?.gmp_number ?? "";
          bVal = b.gmps?.gmp_number ?? "";
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "created_at":
          aVal = a.created_at ?? "";
          bVal = b.created_at ?? "";
          break;
      }
      return (
        dir *
        String(aVal).localeCompare(String(bVal), undefined, {
          sensitivity: "base",
          numeric: true,
        })
      );
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageRows = sorted.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, pageSize]);

  const headerClass =
    "cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by quote #, customer, or GMP..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {query && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {filtered.length} of {quotes.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_BUTTONS.map((s) => (
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
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("quote_number")}>
                  Quote #
                  <SortArrow column="quote_number" sort={sort} />
                </span>
              </TableHead>
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("customer")}>
                  Customer
                  <SortArrow column="customer" sort={sort} />
                </span>
              </TableHead>
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("gmp")}>
                  GMP
                  <SortArrow column="gmp" sort={sort} />
                </span>
              </TableHead>
              <TableHead>Quantities</TableHead>
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("status")}>
                  Status
                  <SortArrow column="status" sort={sort} />
                </span>
              </TableHead>
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("created_at")}>
                  Created
                  <SortArrow column="created_at" sort={sort} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length > 0 ? (
              pageRows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link
                      href={`/quotes/${q.id}`}
                      className="font-mono font-medium text-blue-600 hover:underline"
                    >
                      {q.quote_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {q.customers
                      ? `${q.customers.code} — ${q.customers.company_name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {q.gmps?.gmp_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{formatQuantities(q.quantities)}</TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {q.created_at ? formatDateTime(q.created_at) : "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-0">
                  <EmptyState
                    icon={Calculator}
                    title="No quotes found"
                    description={
                      query
                        ? `No results for "${query}". Try a different search term.`
                        : statusFilter !== "all"
                          ? `No quotes with status "${statusFilter}". Try a different filter.`
                          : "Create your first quote from a parsed BOM."
                    }
                    className="border-0"
                  >
                    <Link href="/quotes/new">
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Create your first quote
                      </Button>
                    </Link>
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
    </div>
  );
}
