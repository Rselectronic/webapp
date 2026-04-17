"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Source mapping data
// ---------------------------------------------------------------------------

interface SourceRow {
  setting: string;
  value: string;
  source: string;
}

const SOURCE_ROWS: SourceRow[] = [
  {
    setting: "Labour Rate",
    value: "$130/hr",
    source: "TIME V11 \u2192 final!C18 (Qty 4 tier)",
  },
  {
    setting: "SMT Machine Rate",
    value: "$165/hr",
    source: "TIME V11 \u2192 QTY 1!B195",
  },
  {
    setting: "Component Markup",
    value: "20%",
    source: "TIME V11 \u2192 final!H15",
  },
  {
    setting: "PCB Markup",
    value: "30%",
    source: "App default (DM file uses 20%)",
  },
  {
    setting: "Shipping",
    value: "$200",
    source: "TIME V11 \u2192 QTY 1!D207",
  },
  {
    setting: "CP/CPEXP CPH",
    value: "4,500",
    source: "DM/TIME V11 time calculation model",
  },
  {
    setting: "0402 CPH",
    value: "3,500",
    source: "DM/TIME V11 time calculation model",
  },
  {
    setting: "IP CPH",
    value: "2,000",
    source: "DM/TIME V11 time calculation model",
  },
  {
    setting: "TH CPH",
    value: "150",
    source: "Manual insertion rate",
  },
  {
    setting: "MANSMT CPH",
    value: "100",
    source: "Manual soldering rate",
  },
  {
    setting: "Programming (1-39 lines, single)",
    value: "$300",
    source: "DM V11 \u2192 Programming sheet",
  },
  {
    setting: "Programming (1-39 lines, double)",
    value: "$400",
    source: "DM V11 \u2192 Programming sheet",
  },
  {
    setting: "Feeder setup (CP)",
    value: "2 min",
    source: "DM/TIME V11",
  },
  {
    setting: "Feeder setup (IP)",
    value: "3 min",
    source: "DM/TIME V11",
  },
  {
    setting: "Printer setup",
    value: "15 min/side",
    source: "DM/TIME V11",
  },
];

// ---------------------------------------------------------------------------
// Downloadable source files
// ---------------------------------------------------------------------------

interface SourceFile {
  filename: string;
  label: string;
  size: string;
}

const SOURCE_FILES: SourceFile[] = [
  {
    filename: "_SOURCE_DM_Common_File_V11_2026-04-15.xlsm",
    label: "DM Common File V11",
    size: "9.6 MB",
  },
  {
    filename: "_SOURCE_TIME_V11_2026-04-15.xlsm",
    label: "TIME File V11",
    size: "574 KB",
  },
  {
    filename: "_SOURCE_admin_file_2026-04-15.xlsx",
    label: "Admin File",
    size: "20 KB",
  },
  {
    filename: "programming_fees.csv",
    label: "Programming Fee Table",
    size: "536 B",
  },
  {
    filename: "overage_tables.csv",
    label: "Overage/Extras Table",
    size: "36 KB",
  },
  {
    filename: "vba_extracted_settings.md",
    label: "VBA Extraction Document (cell references)",
    size: "25 KB",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PricingSourceReference() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Source Reference</CardTitle>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {open ? "\u25B2 Collapse" : "\u25BC Expand"}
          </span>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-6">
          {/* Note */}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            These settings were extracted from the DM Common File V11 and TIME
            V11 Excel workbooks on April 15, 2026. The extraction document below
            maps each value to its exact cell reference in the original files.
          </p>

          {/* Source mapping table */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Parameter Sources
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Setting</TableHead>
                  <TableHead className="w-[100px]">Value</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SOURCE_ROWS.map((row) => (
                  <TableRow key={row.setting}>
                    <TableCell className="font-medium">{row.setting}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.value}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {row.source}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Download links */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Source Files
            </h4>
            <ul className="space-y-2">
              {SOURCE_FILES.map((file) => (
                <li key={file.filename} className="flex items-center gap-3">
                  <DownloadIcon />
                  <a
                    href={`/api/settings/source-files/${encodeURIComponent(file.filename)}`}
                    download
                    className="text-sm font-medium text-blue-600 underline decoration-blue-300 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
                  >
                    {file.label}
                  </a>
                  <span className="text-xs text-gray-400">
                    ({file.size})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon — avoids external dependency
// ---------------------------------------------------------------------------

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-gray-400"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
