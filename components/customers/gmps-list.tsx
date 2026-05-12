"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Gmp = {
  id: string;
  gmp_number: string;
  board_name: string | null;
  revision: string | null;
  is_active: boolean;
  created_at: string;
};

type Bom = {
  id: string;
  gmp_id: string;
  file_name: string;
  revision: string | null;
  status: string;
  component_count: number;
  bom_section?: string | null;
  created_at: string;
};

const SECTION_LABEL: Record<string, string> = {
  full: "Full",
  smt: "SMT",
  th: "TH",
  other: "Other",
};

const SECTION_STYLE: Record<string, string> = {
  full: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  smt: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  th: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  other: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function sectionLabel(s?: string | null) {
  return SECTION_LABEL[(s ?? "full").toLowerCase()] ?? "Full";
}
function sectionStyle(s?: string | null) {
  return SECTION_STYLE[(s ?? "full").toLowerCase()] ?? SECTION_STYLE.full;
}

export function GmpsList({
  gmps,
  bomsByGmp,
}: {
  gmps: Gmp[];
  bomsByGmp: Record<string, Bom[]>;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gmps;
    return gmps.filter((gmp) => {
      const hay = [
        gmp.gmp_number,
        gmp.board_name ?? "",
        gmp.revision ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (hay.includes(q)) return true;
      const boms = bomsByGmp[gmp.id] ?? [];
      return boms.some((b) =>
        [
          b.file_name,
          b.revision ?? "",
          b.status,
          b.bom_section ?? "",
          sectionLabel(b.bom_section),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [gmps, bomsByGmp, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (gmps.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No boards yet. Upload a BOM to create the first board.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by GMP, board name, BOM file..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No boards match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border dark:border-gray-800">
          {pageItems.map((gmp, idx) => {
            const gmpBoms = bomsByGmp[gmp.id] ?? [];
            const isOpen = expanded.has(gmp.id);
            return (
              <div
                key={gmp.id}
                className={idx > 0 ? "border-t dark:border-gray-800" : ""}
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(gmp.id)}
                    aria-label={isOpen ? "Collapse BOMs" : "Expand BOMs"}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ChevronRight
                      className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </button>
                  <span className="font-mono text-sm font-bold text-blue-600">
                    {gmp.gmp_number}
                  </span>
                  {gmp.board_name && (
                    <span className="truncate text-sm text-gray-600 dark:text-gray-300">
                      {gmp.board_name}
                    </span>
                  )}
                  {gmp.revision && (
                    <span className="text-xs text-gray-400">Rev {gmp.revision}</span>
                  )}
                  <Badge
                    variant={gmp.is_active ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {gmp.is_active ? "Active" : "Inactive"}
                  </Badge>
                  {(() => {
                    const sections = Array.from(
                      new Set(
                        gmpBoms.map((b) => (b.bom_section ?? "full").toLowerCase()),
                      ),
                    );
                    const isSplit =
                      sections.length > 1 ||
                      (sections.length === 1 && sections[0] !== "full");
                    return isSplit ? (
                      <div className="ml-auto flex items-center gap-1">
                        {sections.map((s) => (
                          <span
                            key={s}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sectionStyle(s)}`}
                          >
                            {sectionLabel(s)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="ml-auto text-xs text-gray-500">
                        {gmpBoms.length} BOM{gmpBoms.length === 1 ? "" : "s"}
                      </span>
                    );
                  })()}
                  <Link href={`/bom/upload?gmp_id=${gmp.id}`}>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-1 h-3 w-3" />
                      Upload BOM
                    </Button>
                  </Link>
                </div>

                {isOpen && (
                  <div className="border-t bg-gray-50/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                    {gmpBoms.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-gray-400">
                        No BOMs uploaded yet
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {gmpBoms.map((bom) => (
                          <Link
                            key={bom.id}
                            href={`/bom/${bom.id}`}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white dark:hover:bg-gray-800/50"
                          >
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="flex-1 truncate font-mono text-xs">
                              {bom.file_name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sectionStyle(bom.bom_section)}`}
                            >
                              {sectionLabel(bom.bom_section)}
                            </span>
                            {bom.revision && (
                              <span className="text-xs text-gray-400">
                                Rev {bom.revision}
                              </span>
                            )}
                            <Badge
                              variant="secondary"
                              className={`text-xs ${
                                bom.status === "parsed"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                  : bom.status === "error"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                    : ""
                              }`}
                            >
                              {bom.status}
                            </Badge>
                            <span className="font-mono text-xs text-gray-400">
                              {bom.component_count} parts
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-gray-500">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Prev
            </Button>
            <span className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
