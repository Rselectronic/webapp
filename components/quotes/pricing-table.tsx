import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { PricingTier, MissingPriceComponent } from "@/lib/pricing/types";

interface PricingTableProps {
  tiers: PricingTier[];
  warnings?: string[];
  missingPriceComponents?: MissingPriceComponent[];
}

const ROWS: { key: keyof PricingTier; label: string; highlight?: boolean }[] = [
  { key: "component_cost", label: "Components" },
  { key: "pcb_cost", label: "PCB" },
  { key: "assembly_cost", label: "Assembly" },
  { key: "nre_charge", label: "NRE" },
  { key: "shipping", label: "Shipping" },
  { key: "subtotal", label: "Total", highlight: true },
  { key: "per_unit", label: "Per Unit", highlight: true },
];

export function PricingTable({ tiers, warnings, missingPriceComponents }: PricingTableProps) {
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
            {ROWS.map(({ key, label, highlight }) => (
              <tr
                key={key}
                className={
                  highlight
                    ? "border-t bg-gray-50 font-semibold dark:border-gray-800 dark:bg-gray-900"
                    : "border-t dark:border-gray-800"
                }
              >
                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{label}</td>
                {tiers.map((t) => (
                  <td
                    key={t.board_qty}
                    className={`px-4 py-2 text-right font-mono ${highlight ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {formatCurrency(t[key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
