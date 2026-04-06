"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

interface ClassifyResult {
  total_unclassified: number;
  classified_count: number;
  still_needs_review: number;
  results: { mpn: string; m_code: string | null; confidence: number }[];
}

export function AIClassifyButton({
  bomId,
  unclassifiedCount,
}: {
  bomId: string;
  unclassifiedCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (unclassifiedCount === 0 && !result) return null;

  const handleClassify = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

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

      const data = await res.json();
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          onClick={handleClassify}
          disabled={loading || (unclassifiedCount === 0 && !result)}
          variant={result ? "outline" : "default"}
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Classifying {unclassifiedCount} components...
            </>
          ) : result ? (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Re-run AI Classification
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              AI Classify ({unclassifiedCount} unclassified)
            </>
          )}
        </Button>

        {result && (
          <span className="text-sm text-gray-600">
            Classified{" "}
            <strong className="text-green-600">
              {result.classified_count}
            </strong>{" "}
            of {result.total_unclassified}
            {result.still_needs_review > 0 && (
              <>
                {" "}
                —{" "}
                <strong className="text-orange-600">
                  {result.still_needs_review}
                </strong>{" "}
                still need manual review
              </>
            )}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && result.results.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            Show classification details ({result.results.length} results)
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
                {result.results.map((r, i) => (
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
                        : "—"}
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
