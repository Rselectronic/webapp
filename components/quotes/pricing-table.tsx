"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { PricingTier, MissingPriceComponent } from "@/lib/pricing/types";
import { ChevronRight, ChevronDown } from "lucide-react";

interface PricingTableProps {
  tiers: PricingTier[];
  warnings?: string[];
  missingPriceComponents?: MissingPriceComponent[];
  showLabourDetail?: boolean;
}

function getRows(timeModelUsed: boolean): { key: keyof PricingTier; label: string; highlight?: boolean }[] {
  return [
    { key: "component_cost", label: "Components" },
    { key: "pcb_cost", label: "PCB" },
    { key: "assembly_cost", label: timeModelUsed ? "Assembly (Time-Based)" : "Assembly (Placements)" },
    { key: "nre_charge", label: "NRE" },
    { key: "shipping", label: "Shipping" },
    { key: "subtotal", label: "Total", highlight: true },
    { key: "per_unit", label: "Per Unit", highlight: true },
  ];
}

export function PricingTable({ tiers, warnings, missingPriceComponents, showLabourDetail = true }: PricingTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Backward compatibility: old quotes may not have labour breakdown
  const hasLabour = tiers.length > 0 && tiers[0].labour != null && typeof tiers[0].labour === "object";
  const hasMarkupData = tiers.length > 0 && tiers[0].component_cost_before_markup != null;

  function toggleRow(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {warnings && warnings.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-2 dark:border-orange-800 dark:bg-orange-950/30">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-orange-700 dark:text-orange-300">
              {w}
            </p>
          ))}
          {/* Collapsible list of components with missing prices */}
          {missingPriceComponents && missingPriceComponents.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-orange-800 hover:text-orange-900 dark:text-orange-200 dark:hover:text-orange-100">
                Show {missingPriceComponents.length} component{missingPriceComponents.length !== 1 ? "s" : ""} with no price
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-orange-300 bg-white dark:border-orange-700 dark:bg-gray-900">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-orange-100 dark:bg-orange-900/40">
                      <th className="px-3 py-1.5 text-left font-medium text-orange-800 dark:text-orange-200">MPN</th>
                      <th className="px-3 py-1.5 text-left font-medium text-orange-800 dark:text-orange-200">Description</th>
                      <th className="px-3 py-1.5 text-right font-medium text-orange-800 dark:text-orange-200">Qty/Board</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingPriceComponents.map((c, i) => (
                      <tr key={i} className="border-b border-orange-100 dark:border-orange-800">
                        <td className="px-3 py-1 font-mono text-gray-900 dark:text-gray-100">{c.mpn || "---"}</td>
                        <td className="px-3 py-1 max-w-xs truncate text-gray-600 dark:text-gray-400" title={c.description}>{c.description || "---"}</td>
                        <td className="px-3 py-1 text-right font-mono text-gray-700 dark:text-gray-300">{c.qty_per_board}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Main pricing table */}
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                Cost Breakdown
              </th>
              {tiers.map((t) => (
                <th
                  key={t.board_qty}
                  className="px-4 py-2 text-right text-xs font-medium text-gray-500"
                >
                  {t.board_qty} units
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getRows(tiers[0]?.labour?.time_model_used ?? false).map(({ key, label, highlight }) => {
              const expandable = hasMarkupData && (key === "component_cost" || key === "pcb_cost");
              const isExpanded = expandedRows.has(key);
              return (
                <>
                  <tr
                    key={key}
                    className={
                      highlight
                        ? "border-t bg-gray-50 font-semibold dark:border-gray-800 dark:bg-gray-900"
                        : "border-t dark:border-gray-800"
                    }
                  >
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                      {expandable ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                          onClick={() => toggleRow(key)}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
                            : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                          {label}
                        </button>
                      ) : label}
                    </td>
                    {tiers.map((t) => (
                      <td
                        key={t.board_qty}
                        className={`px-4 py-2 text-right font-mono ${highlight ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}
                      >
                        {formatCurrency((t[key] as number) ?? 0)}
                      </td>
                    ))}
                  </tr>
                  {/* Expandable markup sub-rows for Components */}
                  {expandable && isExpanded && key === "component_cost" && (
                    <>
                      <tr key="comp_before" className="dark:border-gray-800 bg-blue-50/30 dark:bg-blue-950/10">
                        <td className="pl-10 pr-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Cost before markup
                        </td>
                        {tiers.map((t) => (
                          <td key={t.board_qty} className="px-4 py-1.5 text-right font-mono text-xs text-gray-500">
                            {formatCurrency(t.component_cost_before_markup ?? 0)}
                          </td>
                        ))}
                      </tr>
                      <tr key="comp_markup" className="dark:border-gray-800 bg-blue-50/30 dark:bg-blue-950/10">
                        <td className="pl-10 pr-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Markup ({tiers[0].component_markup_pct ?? 25}%)
                        </td>
                        {tiers.map((t) => (
                          <td key={t.board_qty} className="px-4 py-1.5 text-right font-mono text-xs text-green-600 dark:text-green-400">
                            +{formatCurrency(t.component_markup_amount ?? 0)}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                  {/* Expandable markup sub-rows for PCB */}
                  {expandable && isExpanded && key === "pcb_cost" && (
                    <>
                      <tr key="pcb_before" className="dark:border-gray-800 bg-blue-50/30 dark:bg-blue-950/10">
                        <td className="pl-10 pr-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Cost before markup
                        </td>
                        {tiers.map((t) => (
                          <td key={t.board_qty} className="px-4 py-1.5 text-right font-mono text-xs text-gray-500">
                            {formatCurrency(t.pcb_cost_before_markup ?? 0)}
                          </td>
                        ))}
                      </tr>
                      <tr key="pcb_markup" className="dark:border-gray-800 bg-blue-50/30 dark:bg-blue-950/10">
                        <td className="pl-10 pr-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Markup ({tiers[0].pcb_markup_pct ?? 25}%)
                        </td>
                        {tiers.map((t) => (
                          <td key={t.board_qty} className="px-4 py-1.5 text-right font-mono text-xs text-green-600 dark:text-green-400">
                            +{formatCurrency(t.pcb_markup_amount ?? 0)}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-unit cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tiers.map((t) => (
          <Card key={t.board_qty} className="text-center">
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs text-gray-500">
                {t.board_qty} units
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-xl font-bold">{formatCurrency(t.per_unit)}</p>
              <p className="text-xs text-gray-400">/unit</p>
              {t.components_missing_price > 0 && (
                <p className="mt-1 text-xs text-orange-500">
                  {t.components_missing_price} missing prices
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Labour Breakdown Detail (collapsible) */}
      {showLabourDetail && hasLabour && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
            Show Labour &amp; NRE Breakdown
          </summary>
          <div className="mt-3 space-y-4">
            {/* Placement stats card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">M-Code Placement Stats (per board)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <StatItem label="Unique lines" value={tiers[0].labour.total_unique_lines} />
                  <StatItem label="Total SMT placements" value={tiers[0].labour.total_smt_placements} />
                  <StatItem label="CP/CPEXP/0402/0201 feeders" value={tiers[0].labour.cp_feeder_count} />
                  <StatItem label="CP placement sum" value={tiers[0].labour.cp_placement_sum} />
                  <StatItem label="IP feeders" value={tiers[0].labour.ip_feeder_count} />
                  <StatItem label="IP placement sum" value={tiers[0].labour.ip_placement_sum} />
                  <StatItem label="Manual SMT placements" value={tiers[0].labour.mansmt_count} />
                  <StatItem label="TH placements" value={tiers[0].labour.th_placement_sum} />
                </div>
              </CardContent>
            </Card>

            {/* Labour cost breakdown table */}
            <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
              {tiers[0].labour.time_model_used && (
                <div className="border-b bg-blue-50 px-4 py-1.5 text-xs text-blue-700 dark:border-gray-800 dark:bg-blue-950/30 dark:text-blue-300">
                  Time-Based Model (DM/TIME V11) — Assembly cost = (assembly hours x labour rate) + (SMT hours x machine rate)
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-blue-50 dark:border-gray-800 dark:bg-blue-950/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-blue-700 dark:text-blue-300">
                      Labour Breakdown
                    </th>
                    {tiers.map((t) => (
                      <th
                        key={t.board_qty}
                        className="px-4 py-2 text-right text-xs font-medium text-blue-700 dark:text-blue-300"
                      >
                        {t.board_qty} units
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers[0].labour.time_model_used && (
                    <>
                      <TimeRow label="SMT time" tiers={tiers} field="smt_time_hours" />
                      <TimeRow label="TH time" tiers={tiers} field="th_time_hours" />
                      <TimeRow label="MANSMT time" tiers={tiers} field="mansmt_time_hours" />
                      <TimeRow label="Setup time (feeders + printer)" tiers={tiers} field="setup_time_hours_computed" />
                      <TimeRow label="Total assembly time" tiers={tiers} field="assembly_time_hours" bold />
                      <LabourRow label="Labour cost (all hours x rate)" tiers={tiers} field="labour_cost" />
                      <LabourRow label="Machine cost (SMT hours x rate)" tiers={tiers} field="machine_cost" />
                    </>
                  )}
                  <LabourRow label={`SMT placements (${tiers[0].smt_placements}/brd)`} tiers={tiers} field="smt_placement_cost" />
                  <LabourRow label={`TH placements (${tiers[0].th_placements}/brd)`} tiers={tiers} field="th_placement_cost" />
                  <LabourRow label={`Manual SMT (${tiers[0].mansmt_placements}/brd)`} tiers={tiers} field="mansmt_placement_cost" />
                  <LabourRow label="Total placement cost" tiers={tiers} field="total_placement_cost" bold />
                  <LabourRow label="Setup cost" tiers={tiers} field="setup_cost" />
                  <LabourRow label="Programming cost" tiers={tiers} field="programming_cost" />
                  <LabourRow label="Total labour cost" tiers={tiers} field="total_labour_cost" bold />
                </tbody>
              </table>
            </div>

            {/* NRE breakdown table */}
            {tiers[0].labour.nre_total > 0 && (
              <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-purple-50 dark:border-gray-800 dark:bg-purple-950/30">
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-700 dark:text-purple-300">
                        NRE Breakdown <span className="font-normal text-purple-500 dark:text-purple-400">(per quote, not per tier)</span>
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-purple-700 dark:text-purple-300">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers[0].labour.nre_programming > 0 && (
                      <NreRow label="Programming fees" amount={tiers[0].labour.nre_programming} />
                    )}
                    {tiers[0].labour.nre_stencil > 0 && (
                      <NreRow label="Stencil fees" amount={tiers[0].labour.nre_stencil} />
                    )}
                    {tiers[0].labour.nre_setup > 0 && (
                      <NreRow label="Setup fees" amount={tiers[0].labour.nre_setup} />
                    )}
                    {tiers[0].labour.nre_pcb_fab > 0 && (
                      <NreRow label="PCB fabrication NRE" amount={tiers[0].labour.nre_pcb_fab} />
                    )}
                    {tiers[0].labour.nre_misc > 0 && (
                      <NreRow label="Misc NRE" amount={tiers[0].labour.nre_misc} />
                    )}
                    <tr className="border-t bg-purple-50 font-semibold dark:border-gray-800 dark:bg-purple-950/30">
                      <td className="px-4 py-2 text-purple-800 dark:text-purple-200">NRE Total</td>
                      <td className="px-4 py-2 text-right font-mono text-purple-800 dark:text-purple-200">
                        {formatCurrency(tiers[0].labour.nre_total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function LabourRow({
  label,
  tiers,
  field,
  bold,
}: {
  label: string;
  tiers: PricingTier[];
  field: keyof PricingTier["labour"];
  bold?: boolean;
}) {
  return (
    <tr className={bold ? "border-t bg-blue-50/50 font-semibold dark:border-gray-800 dark:bg-blue-950/20" : "border-t dark:border-gray-800"}>
      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{label}</td>
      {tiers.map((t) => (
        <td
          key={t.board_qty}
          className={`px-4 py-2 text-right font-mono ${bold ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}
        >
          {formatCurrency((t.labour?.[field] as number) ?? 0)}
        </td>
      ))}
    </tr>
  );
}

function TimeRow({
  label,
  tiers,
  field,
  bold,
}: {
  label: string;
  tiers: PricingTier[];
  field: keyof PricingTier["labour"];
  bold?: boolean;
}) {
  return (
    <tr className={bold ? "border-t bg-green-50/50 font-semibold dark:border-gray-800 dark:bg-green-950/20" : "border-t dark:border-gray-800"}>
      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{label}</td>
      {tiers.map((t) => {
        const hours = (t.labour?.[field] as number) ?? 0;
        const mins = hours * 60;
        return (
          <td
            key={t.board_qty}
            className={`px-4 py-2 text-right font-mono ${bold ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}
          >
            {hours < 1 ? `${mins.toFixed(1)} min` : `${hours.toFixed(2)} hr`}
          </td>
        );
      })}
    </tr>
  );
}

function NreRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-t dark:border-gray-800">
      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{label}</td>
      <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
        {formatCurrency(amount)}
      </td>
    </tr>
  );
}
