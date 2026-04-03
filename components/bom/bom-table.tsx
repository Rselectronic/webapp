"use client";

import { useState } from "react";
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
}

interface BomTableProps {
  lines: BomLine[];
  bomId: string;
}

export function BomTable({ lines: initialLines, bomId: _bomId }: BomTableProps) {
  const [lines, setLines] = useState(initialLines);

  const nonPcb = lines.filter((l) => !l.is_pcb);
  const classified = nonPcb.filter((l) => l.m_code).length;
  const unclassified = nonPcb.length - classified;

  async function handleMcodeChange(lineId: string, mcode: string) {
    const supabase = createClient();

    await supabase
      .from("bom_lines")
      .update({ m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual" })
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
          ? { ...l, m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual" }
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

      <div className="rounded-lg border bg-white overflow-x-auto">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.id}
                className={
                  line.is_pcb
                    ? "bg-blue-50"
                    : !line.m_code
                      ? "bg-orange-50/60"
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
