"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Merge, Cpu, Calculator, DollarSign, Send, Loader2, CheckCircle2,
  Circle, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { MCodeOverrideCell } from "@/components/quotes/mcode-override-cell";
import { formatCurrency } from "@/lib/utils/format";

// --- Types matching the database shape ---
interface Batch {
  id: string;
  batch_name: string;
  status: string;
  customer_id: string;
  qty_1: number | null;
  qty_2: number | null;
  qty_3: number | null;
  qty_4: number | null;
  component_markup_pct: number | null;
  customers: { code: string; company_name: string } | null;
  quote_batch_boms: Array<{
    bom_id: string;
    board_letter: string;
    boms: { file_name: string; component_count: number } | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
  }>;
}

interface BatchLine {
  id: string;
  line_number: number;
  mpn: string;
  cpc: string | null;
  description: string | null;
  manufacturer: string | null;
  bom_qty: number;
  board_refs: string | null;
  reference_designators: string | null;
  m_code: string | null;
  m_code_confidence: number | null;
  m_code_source: string | null;
  m_code_override: string | null;
  m_code_final: string | null;
  extras: number | null;
  order_qty_1: number | null;
  order_qty_2: number | null;
  order_qty_3: number | null;
  order_qty_4: number | null;
  unit_price_1: number | null;
  extended_price_1: number | null;
  unit_price_2: number | null;
  extended_price_2: number | null;
  unit_price_3: number | null;
  extended_price_3: number | null;
  unit_price_4: number | null;
  extended_price_4: number | null;
  supplier: string | null;
  stock_qty: number | null;
  is_pcb: boolean;
  needs_review: boolean;
}

interface LogEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// --- Workflow Step Definitions ---
const STEPS = [
  { key: "created", label: "1. Create Batch", icon: Circle, actionLabel: "Merge BOMs", nextStatus: "merged" },
  { key: "merged", label: "2. Merge BOMs", icon: Merge, actionLabel: "Assign M-Codes", nextStatus: "mcodes_assigned" },
  { key: "mcodes_assigned", label: "3. Assign M-Codes", icon: Cpu, actionLabel: "Calculate Extras", nextStatus: "extras_calculated", checkpoint: true },
  { key: "extras_calculated", label: "4. Calculate Extras", icon: Calculator, actionLabel: "Run Pricing", nextStatus: "priced", checkpoint: true },
  { key: "priced", label: "5. API Pricing", icon: DollarSign, actionLabel: "Send Back & Generate Quotes", nextStatus: "sent_back", checkpoint: true },
  { key: "sent_back", label: "6. Quotes Generated", icon: Send },
];

const STATUS_ORDER = STEPS.map((s) => s.key);

function getStepIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

// --- Action Endpoint Map ---
const ACTION_ENDPOINTS: Record<string, string> = {
  created: "merge",
  merged: "assign-mcodes",
  mcodes_assigned: "calculate-extras",
  extras_calculated: "run-pricing",
  priced: "send-back",
};

export function BatchWorkflow({ batch, lines, log }: { batch: Batch; lines: BatchLine[]; log: LogEntry[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [showLog, setShowLog] = useState(false);

  const currentStepIdx = getStepIndex(batch.status);
  const customer = batch.customers as { code: string; company_name: string } | null;
  const boms = batch.quote_batch_boms ?? [];
  const componentLines = lines.filter((l) => !l.is_pcb);
  const pcbLine = lines.find((l) => l.is_pcb);
  const needsReviewCount = componentLines.filter((l) => l.needs_review && !l.m_code_override).length;

  const runStep = async () => {
    const endpoint = ACTION_ENDPOINTS[batch.status];
    if (!endpoint) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/quote-batches/${batch.id}/${endpoint}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Action failed");
      }

      setResult(data);
      // Refresh the page to get updated data
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRunning(false);
    }
  };

  const currentStep = STEPS[currentStepIdx];
  const nextAction = currentStep?.actionLabel;
  const isCheckpoint = currentStep?.checkpoint;
  const isComplete = batch.status === "sent_back" || batch.status === "quotes_generated";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{batch.batch_name}</h2>
        <p className="text-gray-500">
          {customer ? `${customer.code} — ${customer.company_name}` : ""} · {boms.length} BOM{boms.length !== 1 ? "s" : ""}
          {batch.qty_1 && ` · Tiers: ${[batch.qty_1, batch.qty_2, batch.qty_3, batch.qty_4].filter(Boolean).join(" / ")}`}
        </p>
      </div>

      {/* Workflow Progress Bar */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-1">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isDone = idx < currentStepIdx || isComplete;
            const isCurrent = idx === currentStepIdx && !isComplete;
            return (
              <div key={step.key} className="flex flex-1 items-center">
                <div className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium ${
                  isDone
                    ? "text-green-700"
                    : isCurrent
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "text-gray-400"
                }`}>
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Icon className={`h-4 w-4 ${isCurrent ? "text-blue-500" : ""}`} />
                  )}
                  <span className="hidden lg:inline">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-1 h-px flex-1 ${idx < currentStepIdx ? "bg-green-300" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      {!isComplete && nextAction && (
        <div className="rounded-lg border bg-white p-4">
          {isCheckpoint && (
            <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Human checkpoint.</strong> Review the data below before proceeding.
                {batch.status === "mcodes_assigned" && needsReviewCount > 0 && (
                  <> {needsReviewCount} component(s) need M-code review.</>
                )}
                {batch.status === "extras_calculated" && (
                  <> This will make API calls to DigiKey/Mouser/LCSC. Verify order quantities first.</>
                )}
                {batch.status === "priced" && (
                  <> This will generate individual quotes for each board. Verify pricing first.</>
                )}
              </div>
            </div>
          )}

          <Button onClick={runStep} disabled={running} size="lg" className="w-full">
            {running ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Running...</>
            ) : (
              <>{nextAction}</>
            )}
          </Button>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {result && (
            <p className="mt-2 text-sm text-green-600">
              {(result as { message?: string }).message ?? "Done. Refreshing..."}
            </p>
          )}
        </div>
      )}

      {isComplete && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          Quotes generated. View them on the <a href="/quotes" className="font-medium underline">Quotes page</a>.
        </div>
      )}

      {/* BOMs in Batch */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-gray-900">BOMs in Batch</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Board</TableHead>
              <TableHead>GMP</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Components</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boms.map((bb) => {
              const gmp = bb.gmps as { gmp_number: string; board_name: string | null } | null;
              const bom = bb.boms as { file_name: string; component_count: number } | null;
              return (
                <TableRow key={bb.bom_id}>
                  <TableCell className="font-mono font-bold text-blue-600">{bb.board_letter}</TableCell>
                  <TableCell className="font-mono">{gmp?.gmp_number ?? "—"}</TableCell>
                  <TableCell className="text-sm">{bom?.file_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{bom?.component_count ?? 0}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Component Lines Table (only shown after merge) */}
      {componentLines.length > 0 && (
        <div className="rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold text-gray-900">
              Merged Components ({componentLines.length} unique)
              {pcbLine && <span className="ml-2 text-sm font-normal text-gray-500">+ PCB</span>}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>MPN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Boards</TableHead>
                  <TableHead className="text-right">BOM Qty</TableHead>
                  {/* M-Code columns (visible after mcodes_assigned) */}
                  {currentStepIdx >= 2 && (
                    <>
                      <TableHead>M-Code</TableHead>
                      <TableHead>Override</TableHead>
                    </>
                  )}
                  {/* Extras/Order Qty (visible after extras_calculated) */}
                  {currentStepIdx >= 3 && (
                    <>
                      <TableHead className="text-right">Extras</TableHead>
                      <TableHead className="text-right">Order Qty (T1)</TableHead>
                    </>
                  )}
                  {/* Pricing (visible after priced) */}
                  {currentStepIdx >= 4 && (
                    <>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Extended (T1)</TableHead>
                      <TableHead>Supplier</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {componentLines.map((line) => (
                  <TableRow key={line.id} className={line.needs_review && !line.m_code_override ? "bg-amber-50" : ""}>
                    <TableCell className="font-mono text-xs text-gray-400">{line.line_number}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{line.mpn}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-gray-600">{line.description ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{line.board_refs ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{line.bom_qty}</TableCell>

                    {currentStepIdx >= 2 && (
                      <>
                        <TableCell>
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                            line.m_code_final
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {line.m_code_final ?? "???"}
                          </span>
                          {line.m_code_confidence != null && (
                            <span className="ml-1 text-xs text-gray-400">
                              {Math.round(line.m_code_confidence * 100)}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <MCodeOverrideCell
                            lineId={line.id}
                            batchId={batch.id}
                            currentOverride={line.m_code_override}
                            autoMCode={line.m_code}
                            disabled={batch.status !== "mcodes_assigned"}
                          />
                        </TableCell>
                      </>
                    )}

                    {currentStepIdx >= 3 && (
                      <>
                        <TableCell className="text-right font-mono text-sm">{line.extras ?? 0}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{line.order_qty_1 ?? "—"}</TableCell>
                      </>
                    )}

                    {currentStepIdx >= 4 && (
                      <>
                        <TableCell className="text-right font-mono text-sm">
                          {line.unit_price_1 != null ? formatCurrency(line.unit_price_1) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.extended_price_1 != null ? formatCurrency(line.extended_price_1) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{line.supplier ?? "—"}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="rounded-lg border bg-white">
        <button
          onClick={() => setShowLog(!showLog)}
          className="flex w-full items-center justify-between border-b px-4 py-3 text-left"
        >
          <h3 className="font-semibold text-gray-900">Activity Log ({log.length})</h3>
          {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showLog && (
          <div className="divide-y">
            {log.map((entry) => (
              <div key={entry.id} className="px-4 py-2 text-sm">
                <span className="font-medium">{entry.action}</span>
                <span className="ml-2 text-gray-400">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                {entry.details && (
                  <pre className="mt-1 text-xs text-gray-500">{JSON.stringify(entry.details, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
