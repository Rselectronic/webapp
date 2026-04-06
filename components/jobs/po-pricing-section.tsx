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
  quotePricing: { tiers?: { board_qty: number; subtotal: number }[] } | null;
  /** The full quantities object from quotes.quantities */
  quoteQuantities: Record<string, number> | null;
  /** Current metadata JSONB from the job */
  metadata: { po_price?: number; [key: string]: unknown } | null;
}

type PoStatus = "match" | "mismatch" | "pending";

function getPoStatus(quotePrice: number | null, poPrice: number | null): PoStatus {
  if (poPrice == null || poPrice === 0) return "pending";
  if (quotePrice == null) return "pending";
  const diff = Math.abs(poPrice - quotePrice) / quotePrice;
  return diff <= 0.01 ? "match" : "mismatch";
}

function getQuotePrice(
  pricing: PoPricingSectionProps["quotePricing"],
  jobQuantity: number
): number | null {
  if (!pricing?.tiers?.length) return null;
  const tier = pricing.tiers.find((t) => t.board_qty === jobQuantity);
  return tier ? tier.subtotal : pricing.tiers[0].subtotal;
}

export function PoPricingSection({
  jobId,
  jobQuantity,
  quoteId,
  quotePricing,
  metadata,
}: PoPricingSectionProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [poPrice, setPoPrice] = useState<string>(
    metadata?.po_price != null ? String(metadata.po_price) : ""
  );

  const quotePrice = getQuotePrice(quotePricing, jobQuantity);
  const poPriceNum = poPrice !== "" ? parseFloat(poPrice) : null;
  const status = getPoStatus(quotePrice, poPriceNum);

  // Keep local state in sync if metadata changes from server
  useEffect(() => {
    if (metadata?.po_price != null) {
      setPoPrice(String(metadata.po_price));
    }
  }, [metadata?.po_price]);

  async function handleSave() {
    const value = poPrice !== "" ? parseFloat(poPrice) : null;
    if (value !== null && isNaN(value)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { ...(metadata ?? {}), po_price: value },
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
          {/* Quote Price */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">
              Quote Price (Qty {jobQuantity})
            </p>
            <p className="font-mono text-lg font-semibold">
              {quotePrice != null ? formatCurrency(quotePrice) : "No quote"}
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
              PO Price (Customer)
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
            {quotePrice != null && poPriceNum != null ? (
              <div>
                <p
                  className={`font-mono text-lg font-semibold ${
                    status === "mismatch" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatCurrency(poPriceNum - quotePrice)}
                </p>
                <p className="text-xs text-gray-500">
                  {(
                    ((poPriceNum - quotePrice) / quotePrice) *
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
