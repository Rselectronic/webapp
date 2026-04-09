"use client";

import { useState, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { McodeSelect } from "./mcode-select";
import { createClient } from "@/lib/supabase/client";

interface BomLine {
  id: string;
  line_number: number;
  quantity: number;
  reference_designator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  is_pcb: boolean;
  m_code: string | null;
  m_code_confidence: number | null;
  m_code_source: string | null;
  m_code_reasoning: string | null;
}

interface BomTableProps {
  lines: BomLine[];
  bomId: string;
}

export function BomTable({ lines: initialLines, bomId: _bomId }: BomTableProps) {
  const [lines, setLines] = useState(initialLines);

  // Sync local state when server-provided lines change (e.g. after classification + router.refresh())
  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  const nonPcb = lines.filter((l) => !l.is_pcb);
  const classified = nonPcb.filter((l) => l.m_code).length;
  const unclassified = nonPcb.length - classified;

  async function handleMcodeChange(lineId: string, mcode: string) {
    const supabase = createClient();

    await supabase
      .from("bom_lines")
      .update({ m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual", m_code_reasoning: "Manual override" })
      .eq("id", lineId);

    // Learning loop — save to components table for future auto-classification
    const line = lines.find((l) => l.id === lineId);
    if (line?.mpn) {
      await supabase.from("components").upsert(
        {
          mpn: line.mpn,
          manufacturer: line.manufacturer ?? undefined,
          description: line.description ?? undefined,
          m_code: mcode,
          m_code_source: "manual",
        },
        { onConflict: "mpn,manufacturer" }
      );
    }

    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual", m_code_reasoning: "Manual override" }
          : l
      )
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">{nonPcb.length} components</Badge>
        <Badge variant="default">{classified} classified</Badge>
        {unclassified > 0 && (
          <Badge variant="destructive">{unclassified} need review</Badge>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto dark:border-gray-800 dark:bg-gray-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-14">Qty</TableHead>
              <TableHead className="w-32">Designator</TableHead>
              <TableHead className="w-28">CPC</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-36">MPN</TableHead>
              <TableHead className="w-28">Manufacturer</TableHead>
              <TableHead className="w-28">M-Code</TableHead>
              <TableHead className="w-44">Reasoning</TableHead>
              <TableHead className="w-20">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.id}
                className={
                  line.is_pcb
                    ? "bg-blue-50 dark:bg-blue-950/30"
                    : !line.m_code
                      ? "bg-orange-50/60 dark:bg-orange-950/20"
                      : ""
                }
              >
                <TableCell className="text-xs text-gray-400">
                  {line.is_pcb ? "PCB" : line.line_number}
                </TableCell>
                <TableCell className="font-mono text-sm">{line.quantity}</TableCell>
                <TableCell className="text-xs max-w-[128px] truncate" title={line.reference_designator ?? ""}>
                  {line.reference_designator}
                </TableCell>
                <TableCell className="font-mono text-xs">{line.cpc}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate" title={line.description ?? ""}>
                  {line.description}
                </TableCell>
                <TableCell className="font-mono text-xs">{line.mpn}</TableCell>
                <TableCell className="text-xs">{line.manufacturer}</TableCell>
                <TableCell>
                  {line.is_pcb ? (
                    <Badge variant="secondary" className="text-xs">PCB</Badge>
                  ) : (
                    <McodeSelect
                      value={line.m_code}
                      confidence={line.m_code_confidence}
                      source={line.m_code_source}
                      onSelect={(mcode) => handleMcodeChange(line.id, mcode)}
                    />
                  )}
                </TableCell>
                {/* Reasoning */}
                <TableCell>
                  {line.is_pcb ? null : (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        line.m_code_source === "database" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          : line.m_code_source === "rules" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                          : line.m_code_source === "api" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                          : line.m_code_source === "manual" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {line.m_code_source === "database" ? "DB"
                          : line.m_code_source === "rules" ? "Rule"
                          : line.m_code_source === "api" ? "AI"
                          : line.m_code_source === "manual" ? "Manual"
                          : "—"}
                      </span>
                      <span className="text-xs text-gray-500 max-w-32 truncate" title={line.m_code_reasoning ?? undefined}>
                        {line.m_code_reasoning
                          ? line.m_code_reasoning.replace("KEYWORD: ", "").replace(/^PAR-/, "R-")
                          : ""}
                      </span>
                    </div>
                  )}
                </TableCell>
                {/* Confidence */}
                <TableCell>
                  {line.is_pcb || line.m_code_confidence == null ? null : (
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-12 rounded-full bg-gray-200 overflow-hidden dark:bg-gray-700">
                        <div
                          className={`h-full rounded-full ${
                            line.m_code_confidence >= 0.9 ? "bg-green-500"
                              : line.m_code_confidence >= 0.7 ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.round(line.m_code_confidence * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-semibold ${
                        line.m_code_confidence >= 0.9 ? "text-green-700 dark:text-green-400"
                          : line.m_code_confidence >= 0.7 ? "text-yellow-700 dark:text-yellow-400"
                          : "text-red-700 dark:text-red-400"
                      }`}>
                        {Math.round(line.m_code_confidence * 100)}%
                      </span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
