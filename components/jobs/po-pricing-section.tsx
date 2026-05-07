"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";

interface PoPricingSectionProps {
  jobId: string;
  jobQuantity: number;
  quoteId: string | null;
  /** The full pricing object from quotes.pricing */
  quotePricing: {
    tiers?: { board_qty: number; subtotal: number; per_unit?: number }[];
  } | null;
  /** The full quantities object from quotes.quantities */
  quoteQuantities: Record<string, number> | null;
  /** Unit price the customer stated on the PO (jobs.po_unit_price). Authoritative. */
  jobPoUnitPrice?: number | null;
  /** NRE charge the customer included on the PO (jobs.nre_charge_cad). */
  jobNreChargeCad?: number | null;
  /** Whether the customer included NRE on the PO (jobs.nre_included_on_po). */
  jobNreIncludedOnPo?: boolean | null;
  /** Legacy metadata JSONB from the job — used only if po_unit_price is null. */
  metadata: { po_price?: number; [key: string]: unknown } | null;
}

type PoStatus = "match" | "mismatch" | "pending";

function getPoStatus(quotePrice: number | null, poPrice: number | null): PoStatus {
  if (poPrice == null || poPrice === 0) return "pending";
  if (quotePrice == null) return "pending";
  const diff = Math.abs(poPrice - quotePrice) / quotePrice;
  return diff <= 0.01 ? "match" : "mismatch";
}

function getQuoteUnitPrice(
  pricing: PoPricingSectionProps["quotePricing"],
  jobQuantity: number
): number | null {
  if (!pricing?.tiers?.length) return null;
  const tier =
    pricing.tiers.find((t) => t.board_qty === jobQuantity) ?? pricing.tiers[0];
  if (tier.per_unit != null) return tier.per_unit;
  // Legacy fallback — derive unit from subtotal / qty.
  if (tier.subtotal != null && tier.board_qty > 0) {
    return tier.subtotal / tier.board_qty;
  }
  return null;
}

export function PoPricingSection({
  jobId,
  jobQuantity,
  quoteId,
  quotePricing,
  jobPoUnitPrice,
  jobNreChargeCad,
  jobNreIncludedOnPo,
  metadata,
}: PoPricingSectionProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // Prefer the authoritative column (jobs.po_unit_price) over legacy metadata.
  const initialUnit =
    jobPoUnitPrice != null
      ? jobPoUnitPrice
      : metadata?.po_price != null
        ? metadata.po_price
        : null;
  const [poPrice, setPoPrice] = useState<string>(
    initialUnit != null ? String(initialUnit) : ""
  );

  const quoteUnitPrice = getQuoteUnitPrice(quotePricing, jobQuantity);
  const poPriceNum = poPrice !== "" ? parseFloat(poPrice) : null;
  const status = getPoStatus(quoteUnitPrice, poPriceNum);

  // Keep local state in sync if server value changes (prefer column, fall back).
  useEffect(() => {
    const next =
      jobPoUnitPrice != null
        ? jobPoUnitPrice
        : metadata?.po_price != null
          ? metadata.po_price
          : null;
    if (next != null) setPoPrice(String(next));
  }, [jobPoUnitPrice, metadata?.po_price]);

  async function handleSave() {
    const value = poPrice !== "" ? parseFloat(poPrice) : null;
    if (value !== null && isNaN(value)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_unit_price: value,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to save PO price"
        );
      }
      router.refresh();
    } catch (err) {
      console.error("PO price save failed:", err);
      alert(err instanceof Error ? err.message : "Failed to save PO price");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          PO Pricing Validation
          {status === "match" && (
            <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Match
            </Badge>
          )}
          {status === "mismatch" && (
            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Mismatch
            </Badge>
          )}
          {status === "pending" && (
            <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700">
              <Clock className="mr-1 h-3 w-3" />
              Pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Quote Unit Price */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">
              Quote Unit Price (Qty {jobQuantity})
            </p>
            <p className="font-mono text-lg font-semibold">
              {quoteUnitPrice != null ? formatCurrency(quoteUnitPrice) : "No quote"}
            </p>
            {quoteId && (
              <a
                href={`/quotes/${quoteId}`}
                className="text-xs text-blue-600 hover:underline"
              >
                View quote
              </a>
            )}
          </div>

          {/* PO Price Input */}
          <div>
            <label
              htmlFor="po-price"
              className="mb-1 block text-xs font-medium text-gray-500"
            >
              PO Unit Price (Customer)
            </label>
            <div className="flex gap-2">
              <Input
                id="po-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={poPrice}
                onChange={(e) => setPoPrice(e.target.value)}
                className="font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {/* Variance Display */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Variance</p>
            {quoteUnitPrice != null && poPriceNum != null ? (
              <div>
                <p
                  className={`font-mono text-lg font-semibold ${
                    status === "mismatch" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatCurrency(poPriceNum - quoteUnitPrice)}
                </p>
                <p className="text-xs text-gray-500">
                  {(
                    ((poPriceNum - quoteUnitPrice) / quoteUnitPrice) *
                    100
                  ).toFixed(2)}
                  %
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Enter PO price to compare</p>
            )}
          </div>
        </div>

        {/* NRE recap — what the operator captured at PO ingest. */}
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500">NRE on PO</p>
              <p className="mt-0.5 text-sm">
                {jobNreIncludedOnPo ? (
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    Included by customer
                  </span>
                ) : (
                  <span className="italic text-gray-500">
                    Not included on this PO
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500">NRE Charge</p>
              <p className="mt-0.5 font-mono text-lg font-semibold">
                {jobNreChargeCad != null
                  ? formatCurrency(jobNreChargeCad)
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {status === "mismatch" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              <AlertTriangle className="mr-1.5 inline h-4 w-4" />
              The PO price differs from the quoted price by more than 1%. Please
              verify with the customer before proceeding.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
