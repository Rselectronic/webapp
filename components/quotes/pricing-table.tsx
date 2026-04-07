import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { PricingTier } from "@/lib/pricing/types";

interface PricingTableProps {
  tiers: PricingTier[];
  warnings?: string[];
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

export function PricingTable({ tiers, warnings }: PricingTableProps) {
  return (
    <div className="space-y-3">
      {warnings && warnings.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-orange-700">
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
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
                    ? "border-t bg-gray-50 font-semibold"
                    : "border-t"
                }
              >
                <td className="px-4 py-2 text-gray-600">{label}</td>
                {tiers.map((t) => (
                  <td
                    key={t.board_qty}
                    className={`px-4 py-2 text-right font-mono ${highlight ? "text-gray-900" : "text-gray-700"}`}
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
