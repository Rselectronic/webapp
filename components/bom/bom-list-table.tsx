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
import { formatDateTime } from "@/lib/utils/format";

interface BomRow {
  id: string;
  file_name: string;
  bom_name: string | null;
  revision: string | null;
  gerber_name: string | null;
  gerber_revision: string | null;
  boards_per_panel: number | null;
  board_side: string | null;
  ipc_class: string | null;
  solder_type: string | null;
  status: string;
  component_count: number | null;
  created_at: string;
  customers:
    | { code: string; company_name: string }
    | { code: string; company_name: string }[]
    | null;
  gmps:
    | { gmp_number: string; board_name: string | null }
    | { gmp_number: string; board_name: string | null }[]
    | null;
}

type SortColumn = "customer" | "gmp" | "bom_name" | "gerber_name" | "status";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function resolveCustomer(raw: BomRow["customers"]) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as
    | { code: string; company_name: string }
    | null;
}

function resolveGmp(raw: BomRow["gmps"]) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as
    | { gmp_number: string; board_name: string | null }
    | null;
}

function SortArrow({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) return null;
  return (
    <span className="ml-1 text-blue-600 dark:text-blue-400">
      {sort.direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

function displayBomName(bom: BomRow): string {
  return bom.bom_name?.trim() || bom.file_name;
}

export function BomListTable({ boms }: { boms: BomRow[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ column: null, direction: "asc" });

  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return boms;
    const q = search.toLowerCase();
    return boms.filter((bom) => {
      const customer = resolveCustomer(bom.customers);
      const gmp = resolveGmp(bom.gmps);
      return (
        displayBomName(bom).toLowerCase().includes(q) ||
        (bom.gerber_name?.toLowerCase().includes(q) ?? false) ||
        (customer?.code?.toLowerCase().includes(q) ?? false) ||
        (customer?.company_name?.toLowerCase().includes(q) ?? false) ||
        (gmp?.gmp_number?.toLowerCase().includes(q) ?? false) ||
        (gmp?.board_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [boms, search]);

  const sorted = useMemo(() => {
    if (!sort.column) return filtered;

    return [...filtered].sort((a, b) => {
      const col = sort.column!;
      let aVal: string;
      let bVal: string;

      switch (col) {
        case "customer": {
          const ac = resolveCustomer(a.customers);
          const bc = resolveCustomer(b.customers);
          aVal = (ac?.company_name ?? ac?.code ?? "").toLowerCase();
          bVal = (bc?.company_name ?? bc?.code ?? "").toLowerCase();
          break;
        }
        case "gmp": {
          const ag = resolveGmp(a.gmps);
          const bg = resolveGmp(b.gmps);
          aVal = (ag?.gmp_number ?? "").toLowerCase();
          bVal = (bg?.gmp_number ?? "").toLowerCase();
          break;
        }
        case "bom_name":
          aVal = displayBomName(a).toLowerCase();
          bVal = displayBomName(b).toLowerCase();
          break;
        case "gerber_name":
          aVal = (a.gerber_name ?? "").toLowerCase();
          bVal = (b.gerber_name ?? "").toLowerCase();
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }

      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        sensitivity: "base",
      });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const headerClass =
    "cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors";

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

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by BOM, Gerber, customer, GMP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        {search && (
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
                  Customer Name
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
                  BOM Name
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
              <TableHead className="w-40">Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length > 0 ? (
              sorted.map((bom) => {
                const customer = resolveCustomer(bom.customers);
                const gmp = resolveGmp(bom.gmps);
                const statusVariant =
                  bom.status === "parsed"
                    ? "default"
                    : bom.status === "error"
                      ? "destructive"
                      : "secondary";
                return (
                  <TableRow
                    key={bom.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <TableCell className="text-sm">
                      <span className="font-mono text-xs text-gray-500">
                        {customer?.code}
                      </span>{" "}
                      <span className="text-gray-700 dark:text-gray-300">
                        {customer?.company_name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {gmp?.gmp_number}
                      {gmp?.board_name && (
                        <span className="text-gray-400 ml-1 font-sans">
                          &mdash; {gmp.board_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/bom/${bom.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {displayBomName(bom)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {bom.revision ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {bom.gerber_name ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {bom.gerber_revision ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {bom.boards_per_panel ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {formatBoardSide(bom.board_side)}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {bom.ipc_class ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {formatSolder(bom.solder_type)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant} className="text-xs">
                        {bom.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDateTime(bom.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                  {search ? `No BOMs matching "${search}"` : "No BOMs found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
