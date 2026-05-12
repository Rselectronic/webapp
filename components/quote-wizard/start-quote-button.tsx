"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Kicks off the new quote wizard: POSTs to /api/quotes/wizard/start for this
 * BOM, gets back a freshly-minted quote_id + quote_number (e.g. TLAN0003 or
 * TLAN0001R1), then navigates to /quotes/wizard/<id>.
 *
 * `pendingAiCount` gates the action — when the AI tagged rows that haven't
 * been approved yet, the button is disabled. Operators must approve every
 * AI classification before moving to quoting so the cache writes happen
 * AND so the quote isn't built on guesses no one signed off on.
 */
export function StartQuoteButton({
  bomId,
  pendingAiCount = 0,
}: {
  bomId: string;
  pendingAiCount?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const blocked = pendingAiCount > 0;

  async function start() {
    if (blocked) {
      toast.error("Approve AI classifications first", {
        description: `${pendingAiCount} line${pendingAiCount === 1 ? " is" : "s are"} still tagged "ai". Approve them on the BOM table before starting a quote.`,
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/quotes/wizard/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bom_id: bomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Started ${data.quote_number}`);
      router.push(`/quotes/wizard/${data.quote_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to start quote", { description: msg });
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      onClick={start}
      disabled={loading || blocked}
      className="gap-1.5"
      title={
        blocked
          ? `${pendingAiCount} AI classification${pendingAiCount === 1 ? "" : "s"} need approval first`
          : undefined
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {blocked
        ? `Approve ${pendingAiCount} AI line${pendingAiCount === 1 ? "" : "s"} first`
        : "Start Quote"}
    </Button>
  );
}
