"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Merge, Calculator, ShoppingCart, FileText, Send, Loader2,
  CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronUp,
  TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

// --- Types ---
interface ProcBatch {
  id: string;
  batch_name: string;
  proc_batch_code: string | null;
  status: string;
  total_procurements: number;
  total_unique_mpns: number;
  total_order_value: number | null;
  notes: string | null;
  created_at: string;
}

interface ProcBatchItem {
  id: string;
  procurement_id: string;
  board_letter: string;
  procurements: {
    proc_code: string;
    status: string;
    total_lines: number;
    jobs: {
      job_number: string;
      quantity: number;
      customers: { code: string; company_name: string } | null;
      gmps: { gmp_number: string; board_name: string | null } | null;
    } | null;
  } | null;
}

interface ProcBatchLine {
  id: string;
  line_number: number;
  mpn: string;
  cpc: string | null;
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  individual_qty: number;
  original_extras: number;
  combined_extras: number;
  extras_savings: number;
  order_qty: number;
  procurement_refs: string | null;
  source_line_ids: string[] | null;
  supplier: string | null;
  supplier_pn: string | null;
  unit_price: number | null;
  extended_price: number | null;
  stock_qty: number | null;
  pricing_source: string | null;
  is_bg: boolean;
  qty_ordered: number;
  qty_received: number;
  order_status: string;
  supplier_po_id: string | null;
  notes: string | null;
}

interface LogEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// --- Workflow Step Definitions ---
const STEPS = [
  { key: "created", label: "1. Select Procurements", icon: Circle, actionLabel: "Merge Components", nextStatus: "merged" },
  { key: "merged", label: "2. Merge Components", icon: Merge, actionLabel: "Calculate Extras", nextStatus: "extras_calculated", checkpoint: true },
  { key: "extras_calculated", label: "3. Calculate Extras", icon: Calculator, actionLabel: "Allocate Suppliers", nextStatus: "suppliers_allocated", checkpoint: true },
  { key: "suppliers_allocated", label: "4. Allocate Suppliers", icon: ShoppingCart, actionLabel: "Create Supplier POs", nextStatus: "pos_created", checkpoint: true },
  { key: "pos_created", label: "5. Create POs", icon: FileText, actionLabel: "Split Back to Procurements", nextStatus: "split_back", checkpoint: true },
  { key: "split_back", label: "6. Split Back", icon: Send },
];

const STATUS_ORDER = STEPS.map((s) => s.key);

function getStepIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

const ACTION_ENDPOINTS: Record<string, string> = {
  created: "merge",
  merged: "calculate-extras",
  extras_calculated: "allocate-suppliers",
  suppliers_allocated: "create-pos",
  pos_created: "split-back",
};

export function ProcBatchWorkflow({
  batch, items, lines, log,
}: {
  batch: ProcBatch;
  items: ProcBatchItem[];
  lines: ProcBatchLine[];
  log: LogEntry[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [showLog, setShowLog] = useState(false);

  const currentStepIdx = getStepIndex(batch.status);
  const isComplete = ["split_back", "completed", "archived"].includes(batch.status);

  const totalExtrasSavings = lines.reduce((s, l) => s + Math.max(0, l.extras_savings), 0);
  const totalOrderValue = lines.reduce((s, l) => s + (l.extended_price ?? 0), 0);

  const runStep = async () => {
    const endpoint = ACTION_ENDPOINTS[batch.status];
    if (!endpoint) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/procurement-batches/${batch.id}/${endpoint}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Action failed");
      }

      setResult(data);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{batch.batch_name}</h2>
        <p className="text-gray-500 dark:text-gray-400">
          {batch.proc_batch_code && <span className="font-mono mr-2">{batch.proc_batch_code}</span>}
          {items.length} procurement{items.length !== 1 ? "s" : ""}
          {batch.total_unique_mpns > 0 && ` · ${batch.total_unique_mpns} unique MPNs`}
          {totalOrderValue > 0 && ` · ${formatCurrency(totalOrderValue)} total`}
        </p>
      </div>

      {/* Workflow Progress Bar */}
      <div className="rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-1">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isDone = idx < currentStepIdx || isComplete;
            const isCurrent = idx === currentStepIdx && !isComplete;
            return (
              <div key={step.key} className="flex flex-1 items-center">
                <div className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium ${
                  isDone
                    ? "text-green-700 dark:text-green-400"
                    : isCurrent
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800"
                      : "text-gray-400 dark:text-gray-600"
                }`}>
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Icon className={`h-4 w-4 ${isCurrent ? "text-blue-500" : ""}`} />
                  )}
                  <span className="hidden lg:inline">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-1 h-px flex-1 ${idx < currentStepIdx ? "bg-green-300 dark:bg-green-700" : "bg-gray-200 dark:bg-gray-700"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Extras Savings Banner (show after extras calculated) */}
      {currentStepIdx >= 2 && totalExtrasSavings > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <TrendingDown className="h-5 w-5 flex-shrink-0" />
          <div>
            <span className="font-semibold">Batch ordering saves {totalExtrasSavings} extra parts</span>
            <span className="ml-1 text-sm">vs ordering each procurement separately.</span>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isComplete && nextAction && (
        <div className="rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          {isCheckpoint && (
            <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Human checkpoint.</strong> Review the data below before proceeding.
                {batch.status === "merged" && (
                  <> Review merged quantities. Extras will be recalculated at combined volumes.</>
                )}
                {batch.status === "extras_calculated" && (
                  <> This will make API calls to DigiKey/Mouser/LCSC. Verify order quantities first.</>
                )}
                {batch.status === "suppliers_allocated" && (
                  <> This will generate supplier POs. Verify supplier allocations and pricing first.</>
                )}
                {batch.status === "pos_created" && (
                  <> This will push supplier info and quantities back to individual procurements.</>
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
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          Split back complete. Individual procurements now have supplier info and order quantities.
          View them on the <a href="/procurement" className="font-medium underline">Procurement page</a>.
        </div>
      )}

      {/* Procurements in Batch */}
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="border-b px-4 py-3 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Procurements in Batch</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Board</TableHead>
              <TableHead>Proc Code</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>GMP</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Lines</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const proc = item.procurements;
              const job = proc?.jobs;
              const customer = job?.customers;
              const gmp = job?.gmps;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-bold text-blue-600">{item.board_letter}</TableCell>
                  <TableCell className="font-mono text-sm">{proc?.proc_code ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{job?.job_number ?? "—"}</TableCell>
                  <TableCell>{customer ? `${customer.code} — ${customer.company_name}` : "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{gmp?.gmp_number ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{job?.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{proc?.total_lines ?? 0}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Component Lines Table (shown after merge) */}
      {lines.length > 0 && (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b px-4 py-3 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Merged Components ({lines.length} unique)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>MPN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>M-Code</TableHead>
                  <TableHead>Procs</TableHead>
                  <TableHead className="text-right">Ind. Qty</TableHead>
                  {/* Extras columns (visible after extras_calculated) */}
                  {currentStepIdx >= 2 && (
                    <>
                      <TableHead className="text-right">Orig Extras</TableHead>
                      <TableHead className="text-right">Combined</TableHead>
                      <TableHead className="text-right">Savings</TableHead>
                      <TableHead className="text-right">Order Qty</TableHead>
                    </>
                  )}
                  {/* Supplier columns (visible after suppliers_allocated) */}
                  {currentStepIdx >= 3 && (
                    <>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Extended</TableHead>
                    </>
                  )}
                  {/* PO status (visible after pos_created) */}
                  {currentStepIdx >= 4 && (
                    <TableHead>Status</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id} className={line.is_bg ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}>
                    <TableCell className="font-mono text-xs text-gray-400">{line.line_number}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{line.mpn}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-gray-600 dark:text-gray-400">
                      {line.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      {line.m_code ? (
                        <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          {line.m_code}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{line.procurement_refs ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{line.individual_qty}</TableCell>

                    {currentStepIdx >= 2 && (
                      <>
                        <TableCell className="text-right font-mono text-sm text-gray-500">{line.original_extras}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{line.combined_extras}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.extras_savings > 0 ? (
                            <span className="text-green-600 dark:text-green-400">-{line.extras_savings}</span>
                          ) : line.extras_savings < 0 ? (
                            <span className="text-red-600 dark:text-red-400">+{Math.abs(line.extras_savings)}</span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">{line.order_qty}</TableCell>
                      </>
                    )}

                    {currentStepIdx >= 3 && (
                      <>
                        <TableCell className="text-xs">
                          {line.is_bg ? (
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                              BG Stock
                            </span>
                          ) : (
                            line.supplier ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.unit_price != null ? formatCurrency(Number(line.unit_price)) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.extended_price != null ? formatCurrency(Number(line.extended_price)) : "—"}
                        </TableCell>
                      </>
                    )}

                    {currentStepIdx >= 4 && (
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          line.order_status === "received" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : line.order_status === "ordered" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {line.order_status === "ordered" ? "Ordered"
                            : line.order_status === "received" ? "Received"
                            : line.order_status === "partial_received" ? "Partial"
                            : "Pending"}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Summary row */}
          {currentStepIdx >= 2 && (
            <div className="border-t px-4 py-3 flex items-center justify-between text-sm dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400">
                {lines.length} components
                {totalExtrasSavings > 0 && (
                  <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                    {totalExtrasSavings} parts saved by batch ordering
                  </span>
                )}
              </span>
              {currentStepIdx >= 3 && totalOrderValue > 0 && (
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                  Total: {formatCurrency(totalOrderValue)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <button
          onClick={() => setShowLog(!showLog)}
          className="flex w-full items-center justify-between border-b px-4 py-3 text-left dark:border-gray-800"
        >
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Activity Log ({log.length})</h3>
          {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showLog && (
          <div className="divide-y dark:divide-gray-800">
            {log.map((entry) => (
              <div key={entry.id} className="px-4 py-2 text-sm">
                <span className="font-medium">{entry.action}</span>
                <span className="ml-2 text-gray-400">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                {entry.details && (
                  <pre className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
