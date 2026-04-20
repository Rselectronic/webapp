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
 */
export function StartQuoteButton({ bomId }: { bomId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
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
    <Button size="sm" onClick={start} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Start Quote
    </Button>
  );
}
