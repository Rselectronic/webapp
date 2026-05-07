"use client";

// ----------------------------------------------------------------------------
// QuoteCurrencyControl
//
// Compact CAD/USD badge + dropdown shown next to the quote number on the
// detail page. Two affordances:
//   1. "Refresh from billing address" — re-derive currency, FX rate, and
//      tax region from the customer's current default billing address.
//      Used to fix quotes whose currency was wrong at creation time
//      (e.g. the customer billing address was added after the quote
//      was started).
//   2. Manual switch — pick CAD or USD directly. The BoC live rate is
//      fetched server-side when switching to USD.
//
// Both go through PATCH /api/quotes/[id]. The page refreshes after a
// successful update so the rest of the page (PDF link, totals card, FX
// banner) reflects the new state.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface QuoteCurrencyControlProps {
  quoteId: string;
  currency: "CAD" | "USD";
  fxRate: number;
  /** Disable controls while the quote is locked (sent / accepted / etc.). */
  locked?: boolean;
}

export function QuoteCurrencyControl({
  quoteId,
  currency,
  fxRate,
  locked,
}: QuoteCurrencyControlProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, label: string) {
    if (locked) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `Failed (HTTP ${res.status})`
        );
      }
      toast.success(label);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update currency"
      );
    } finally {
      setBusy(false);
    }
  }

  const isOverride = currency === "USD" && fxRate !== 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={locked || busy}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-300 bg-background px-2 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-900"
        title={
          locked
            ? "Quote is locked — currency cannot be changed."
            : "Change quote currency"
        }
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Badge
            variant="secondary"
            className="h-5 rounded-sm px-1.5 text-[10px]"
          >
            {currency}
          </Badge>
        )}
        {isOverride ? (
          <span className="text-[10px] text-gray-500">
            FX {fxRate.toFixed(4)}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {/* base-ui requires GroupLabel components to live inside a Group —
            without the wrapper the MenuGroupRootContext is missing and the
            menu crashes the page on open. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">
            Quote currency
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              patch(
                { refresh_from_billing_address: true },
                "Currency re-derived from billing address"
              )
            }
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            <div className="flex flex-col">
              <span>Refresh from billing address</span>
              <span className="text-[10px] text-gray-500">
                Derive currency + tax region from customer&apos;s current
                default billing address
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Manual</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={currency === "CAD"}
            onClick={() => patch({ currency: "CAD" }, "Switched to CAD")}
          >
            <span className="font-mono mr-2">CAD</span>
            Canadian Dollar
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={currency === "USD"}
            onClick={() =>
              patch({ currency: "USD" }, "Switched to USD (BoC rate fetched)")
            }
          >
            <span className="font-mono mr-2">USD</span>
            US Dollar (live BoC rate)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
