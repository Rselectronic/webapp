"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Zap } from "lucide-react";

interface RuleClassifyResult {
  total: number;
  classified: number;
  unclassified: number;
  manual_kept: number;
}

interface AIClassifyResult {
  total_unclassified: number;
  classified_count: number;
  still_needs_review: number;
  results: { mpn: string; m_code: string | null; confidence: number }[];
}

export function AIClassifyButton({
  bomId,
  unclassifiedCount: initialUnclassifiedCount,
  onClassified,
}: {
  bomId: string;
  unclassifiedCount: number;
  /** Called after classification completes so parent can refresh data */
  onClassified?: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "rules" | "ai">("idle");
  const [loading, setLoading] = useState(false);
  const [ruleResult, setRuleResult] = useState<RuleClassifyResult | null>(null);
  const [aiResult, setAiResult] = useState<AIClassifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // After rules run, this tracks how many still need classification
  const remainingCount = ruleResult
    ? ruleResult.unclassified
    : initialUnclassifiedCount;

  const handleRuleClassify = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRuleResult(null);
    setAiResult(null);
    setPhase("rules");

    try {
      const res = await fetch(`/api/bom/${bomId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // No mode param = rule-based classification
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }

      const data: RuleClassifyResult = await res.json();
      setRuleResult(data);
      router.refresh();
      onClassified?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  }, [bomId, router, onClassified]);

  const handleAIClassify = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiResult(null);
    setPhase("ai");

    try {
      const res = await fetch(`/api/bom/${bomId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai-batch" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }

      const data: AIClassifyResult = await res.json();
      setAiResult(data);
      router.refresh();
      onClassified?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI classification failed");
    } finally {
      setLoading(false);
    }
  }, [bomId, router, onClassified]);

  if (initialUnclassifiedCount === 0 && !ruleResult && !aiResult) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Step 1: Rule-based classification button */}
        <Button
          onClick={handleRuleClassify}
          disabled={loading}
          variant={ruleResult ? "outline" : "default"}
          size="sm"
        >
          {loading && phase === "rules" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Classifying with rules...
            </>
          ) : ruleResult ? (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Re-run Rules
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Classify ({initialUnclassifiedCount} unclassified)
            </>
          )}
        </Button>

        {/* Rule result summary */}
        {ruleResult && (
          <span className="text-sm text-gray-600">
            Classified{" "}
            <strong className="text-green-600">
              {ruleResult.classified}
            </strong>{" "}
            of {ruleResult.total} using rules.
            {ruleResult.unclassified > 0 && (
              <>
                {" "}
                <strong className="text-orange-600">
                  {ruleResult.unclassified}
                </strong>{" "}
                remaining.
              </>
            )}
          </span>
        )}
      </div>

      {/* Step 2: AI classify button — only shown after rules run AND there are leftovers */}
      {ruleResult && ruleResult.unclassified > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleAIClassify}
            disabled={loading}
            variant={aiResult ? "outline" : "default"}
            size="sm"
          >
            {loading && phase === "ai" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI classifying {remainingCount} components...
              </>
            ) : aiResult ? (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Re-run AI Classification
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI Classify remaining ({ruleResult.unclassified})
              </>
            )}
          </Button>

          {aiResult && (
            <span className="text-sm text-gray-600">
              AI classified{" "}
              <strong className="text-green-600">
                {aiResult.classified_count}
              </strong>{" "}
              of {aiResult.total_unclassified}
              {aiResult.still_needs_review > 0 && (
                <>
                  {" "}
                  —{" "}
                  <strong className="text-orange-600">
                    {aiResult.still_needs_review}
                  </strong>{" "}
                  still need manual review
                </>
              )}
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* AI classification details */}
      {aiResult && aiResult.results.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            Show AI classification details ({aiResult.results.length} results)
          </summary>
          <div className="mt-2 max-h-60 overflow-y-auto rounded border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                    MPN
                  </th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                    M-Code
                  </th>
                  <th className="px-3 py-1.5 text-right font-medium text-gray-500">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {aiResult.results.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b ${r.m_code ? "" : "bg-orange-50"}`}
                  >
                    <td className="px-3 py-1 font-mono">{r.mpn}</td>
                    <td className="px-3 py-1">
                      {r.m_code ? (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">
                          {r.m_code}
                        </span>
                      ) : (
                        <span className="text-orange-600">Unclassified</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right">
                      {r.confidence
                        ? `${Math.round(r.confidence * 100)}%`
                        : "---"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
