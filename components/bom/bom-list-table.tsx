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
  revision: string | null;
  status: string;
  component_count: number | null;
  created_at: string;
  customers: { code: string; company_name: string } | { code: string; company_name: string }[] | null;
  gmps: { gmp_number: string; board_name: string | null } | { gmp_number: string; board_name: string | null }[] | null;
}

type SortColumn = "file_name" | "customer" | "gmp" | "revision" | "component_count" | "status" | "created_at";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

function resolveCustomer(raw: BomRow["customers"]) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as { code: string; company_name: string } | null;
}

function resolveGmp(raw: BomRow["gmps"]) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as { gmp_number: string; board_name: string | null } | null;
}

function SortArrow({ column, sort }: { column: SortColumn; sort: SortState }) {
  if (sort.column !== column) return null;
  return (
    <span className="ml-1 text-blue-600 dark:text-blue-400">
      {sort.direction === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
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
        bom.file_name.toLowerCase().includes(q) ||
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
      let aVal: string | number;
      let bVal: string | number;

      switch (col) {
        case "file_name":
          aVal = a.file_name.toLowerCase();
          bVal = b.file_name.toLowerCase();
          break;
        case "customer": {
          const ac = resolveCustomer(a.customers);
          const bc = resolveCustomer(b.customers);
          aVal = (ac?.code ?? "").toLowerCase();
          bVal = (bc?.code ?? "").toLowerCase();
          break;
        }
        case "gmp": {
          const ag = resolveGmp(a.gmps);
          const bg = resolveGmp(b.gmps);
          aVal = (ag?.gmp_number ?? "").toLowerCase();
          bVal = (bg?.gmp_number ?? "").toLowerCase();
          break;
        }
        case "revision":
          aVal = a.revision ?? "";
          bVal = b.revision ?? "";
          break;
        case "component_count":
          aVal = a.component_count ?? 0;
          bVal = b.component_count ?? 0;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "created_at":
          aVal = a.created_at;
          bVal = b.created_at;
          break;
        default:
          return 0;
      }

      let cmp: number;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
      }
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const headerClass =
    "cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors";

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by file, customer, GMP..."
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
                <span className={headerClass} onClick={() => handleSort("file_name")}>
                  File
                  <SortArrow column="file_name" sort={sort} />
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
              <TableHead className="w-16">
                <span className={headerClass} onClick={() => handleSort("revision")}>
                  Rev
                  <SortArrow column="revision" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-24">
                <span className={headerClass} onClick={() => handleSort("component_count")}>
                  Components
                  <SortArrow column="component_count" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-24">
                <span className={headerClass} onClick={() => handleSort("status")}>
                  Status
                  <SortArrow column="status" sort={sort} />
                </span>
              </TableHead>
              <TableHead className="w-40">
                <span className={headerClass} onClick={() => handleSort("created_at")}>
                  Uploaded
                  <SortArrow column="created_at" sort={sort} />
                </span>
              </TableHead>
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
                  <TableRow key={bom.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell className="font-medium">
                      <Link href={`/bom/${bom.id}`} className="text-blue-600 hover:underline">
                        {bom.file_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-xs text-gray-500">{customer?.code}</span>
                      {" "}
                      <span className="text-gray-700 dark:text-gray-300">{customer?.company_name}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {gmp?.gmp_number}
                      {gmp?.board_name && (
                        <span className="text-gray-400 ml-1 font-sans">&mdash; {gmp.board_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-center">{bom.revision}</TableCell>
                    <TableCell className="text-sm text-center">{bom.component_count ?? "\u2014"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant} className="text-xs">{bom.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDateTime(bom.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
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
