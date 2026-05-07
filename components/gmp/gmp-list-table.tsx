"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/format";
import { formatMcodeSummary, type McodeSummary } from "@/lib/bom/mcode-summary";

// One row per GMP. The "latest BOM" columns reflect whichever BOM was
// uploaded most recently under this GMP — the operator can click into the
// GMP to see every revision.
export interface GmpRow {
  id: string;
  gmp_number: string;
  board_name: string | null;
  boards_per_panel: number | null;
  board_side: string | null;
  ipc_class: string | null;
  solder_type: string | null;
  customer:
    | { code: string; company_name: string }
    | null;
  bom_count: number;
  latest_bom: {
    id: string;
    file_name: string;
    bom_name: string | null;
    revision: string | null;
    gerber_name: string | null;
    gerber_revision: string | null;
    status: string;
    created_at: string;
  } | null;
  // M-Code summary for the latest BOM. Null until the BOM has been
  // classified — the operator sees the row even on an unclassified BOM,
  // just without the summary line.
  mcode_summary: McodeSummary | null;
}

type SortColumn =
  | "customer"
  | "gmp"
  | "bom_name"
  | "gerber_name"
  | "status"
  | "uploaded";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function SortArrow({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) return null;
  return (
    <span className="ml-1 text-blue-600 dark:text-blue-400">
      {sort.direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

function displayBomName(bom: GmpRow["latest_bom"]): string {
  if (!bom) return "—";
  return bom.bom_name?.trim() || bom.file_name;
}

const formatBoardSide = (side: string | null) => {
  if (side === "single") return "Single";
  if (side === "double") return "Double";
  return "—";
};

const formatSolder = (solder: string | null) => {
  if (solder === "leaded") return "Leaded";
  if (solder === "lead-free") return "Lead-free";
  return "—";
};

export function GmpListTable({ gmps }: { gmps: GmpRow[] }) {
  const [search, setSearch] = useState("");
  // "" = all customers; otherwise the customer code we're filtering on.
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  // List of distinct customers represented in the GMP list, sorted by code,
  // with a per-customer GMP count for the dropdown labels.
  const customerOptions = useMemo(() => {
    const map = new Map<
      string,
      { code: string; company_name: string; count: number }
    >();
    for (const g of gmps) {
      if (!g.customer?.code) continue;
      const existing = map.get(g.customer.code);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(g.customer.code, {
          code: g.customer.code,
          company_name: g.customer.company_name,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [gmps]);

  const filtered = useMemo(() => {
    let rows = gmps;
    // Customer filter first — narrowing here lets the search box only have
    // to scan rows for the picked customer.
    if (customerFilter) {
      rows = rows.filter((g) => g.customer?.code === customerFilter);
    }
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((g) => {
      return (
        g.gmp_number.toLowerCase().includes(q) ||
        (g.board_name?.toLowerCase().includes(q) ?? false) ||
        (g.customer?.code?.toLowerCase().includes(q) ?? false) ||
        (g.customer?.company_name?.toLowerCase().includes(q) ?? false) ||
        (g.latest_bom?.bom_name?.toLowerCase().includes(q) ?? false) ||
        (g.latest_bom?.file_name?.toLowerCase().includes(q) ?? false) ||
        (g.latest_bom?.gerber_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [gmps, search, customerFilter]);

  const sorted = useMemo(() => {
    if (!sort.column) return filtered;

    return [...filtered].sort((a, b) => {
      const col = sort.column!;
      let aVal: string | number;
      let bVal: string | number;

      switch (col) {
        case "customer": {
          aVal = (a.customer?.company_name ?? a.customer?.code ?? "").toLowerCase();
          bVal = (b.customer?.company_name ?? b.customer?.code ?? "").toLowerCase();
          break;
        }
        case "gmp":
          aVal = a.gmp_number.toLowerCase();
          bVal = b.gmp_number.toLowerCase();
          break;
        case "bom_name":
          aVal = displayBomName(a.latest_bom).toLowerCase();
          bVal = displayBomName(b.latest_bom).toLowerCase();
          break;
        case "gerber_name":
          aVal = (a.latest_bom?.gerber_name ?? "").toLowerCase();
          bVal = (b.latest_bom?.gerber_name ?? "").toLowerCase();
          break;
        case "status":
          aVal = a.latest_bom?.status ?? "";
          bVal = b.latest_bom?.status ?? "";
          break;
        case "uploaded":
          aVal = a.latest_bom?.created_at ?? "";
          bVal = b.latest_bom?.created_at ?? "";
          break;
        default:
          return 0;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        sensitivity: "base",
      });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const headerClass =
    "cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by GMP, customer, BOM, Gerber..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <Select
          value={customerFilter || "__all__"}
          onValueChange={(v) =>
            setCustomerFilter(v === "__all__" || v == null ? "" : v)
          }
        >
          <SelectTrigger
            size="sm"
            className="w-80"
            aria-label="Filter by customer"
          >
            {/* base-ui's Select.Value renders the raw value string by
                default. We provide a render function so the trigger shows
                the human label ("CVNS — CEVIANS, LLC (3)") instead of the
                bare code, and "All customers" instead of the "__all__"
                sentinel. */}
            <SelectValue>
              {(value) => {
                if (value === "__all__" || !value) return "All customers";
                const match = customerOptions.find((c) => c.code === value);
                return match
                  ? `${match.code} — ${match.company_name} (${match.count})`
                  : String(value);
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {/* Sentinel value: base-ui treats empty string as "no value",
                so we use "__all__" and translate it back to "" in
                onValueChange.
                alignItemWithTrigger={false}: by default base-ui's Select
                centres the highlighted item over the trigger, which made
                the popup overlay the "Clear filter / N result" buttons
                next to the trigger. Forcing it to open below the trigger
                like a normal dropdown removes the overlap. */}
            <SelectItem value="__all__">All customers</SelectItem>
            {customerOptions.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.company_name} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {customerFilter ? (
          <button
            type="button"
            onClick={() => setCustomerFilter("")}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear filter
          </button>
        ) : null}
        {(search || customerFilter) && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {sorted.length} result{sorted.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("bom_name")}>
                  Latest BOM
                  <SortArrow column="bom_name" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-20 text-center">BOM Version</TableHead>
              <TableHead>
                <span className={headerClass} onClick={() => handleSort("gerber_name")}>
                  Gerber Name
                  <SortArrow column="gerber_name" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-24 text-center">Gerber Version</TableHead>
              <TableHead className="w-24 text-center">Board/Panel</TableHead>
              <TableHead className="w-24 text-center">Board Side</TableHead>
              <TableHead className="w-20 text-center">IPC Class</TableHead>
              <TableHead className="w-28 text-center">Solder Type</TableHead>
              <TableHead className="w-24">
                <span className={headerClass} onClick={() => handleSort("status")}>
                  Status
                  <SortArrow column="status" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-40">
                <span className={headerClass} onClick={() => handleSort("uploaded")}>
                  Last Uploaded
                  <SortArrow column="uploaded" sort={sort} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length > 0 ? (
              sorted.map((g) => {
                const latest = g.latest_bom;
                const statusVariant =
                  latest?.status === "parsed"
                    ? "default"
                    : latest?.status === "error"
                      ? "destructive"
                      : "secondary";
                return (
                  <TableRow
                    key={g.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <TableCell className="text-sm">
                      <span className="font-mono text-xs text-gray-500">
                        {g.customer?.code}
                      </span>{" "}
                      <span className="text-gray-700 dark:text-gray-300">
                        {g.customer?.company_name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/gmp/${g.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {g.gmp_number}
                      </Link>
                      {g.board_name && (
                        <span className="text-gray-400 ml-1 font-sans">
                          &mdash; {g.board_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {latest ? (
                        <div className="space-y-0.5">
                          <Link
                            href={`/bom/${latest.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {displayBomName(latest)}
                          </Link>
                          {g.mcode_summary && g.mcode_summary.lines > 0 && (
                            <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                              {formatMcodeSummary(g.mcode_summary)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {latest?.revision ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {latest?.gerber_name ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {latest?.gerber_revision ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {g.boards_per_panel ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {formatBoardSide(g.board_side)}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {g.ipc_class ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {formatSolder(g.solder_type)}
                    </TableCell>
                    <TableCell>
                      {latest ? (
                        <Badge variant={statusVariant} className="text-xs">
                          {latest.status}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-xs">no BOM</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {latest ? formatDateTime(latest.created_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                  {search ? `No GMPs matching "${search}"` : "No GMPs found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
