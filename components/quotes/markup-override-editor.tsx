"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TierOverrideValue {
  component_markup_pct?: number | null;
  pcb_markup_pct?: number | null;
  assembly_markup_pct?: number | null;
}

interface Props {
  quoteId: string;
  /** Quantity tiers from quote.quantities.tiers (in order). */
  tiers: number[];
  globalComponentPct: number;
  globalPcbPct: number;
  globalAssemblyPct: number;
  /** Existing per-tier overrides (from quotes.quantities.tier_markup_overrides). */
  tierOverrides: Record<string, TierOverrideValue>;
  canEdit: boolean;
}

type MarkupKey = "component" | "pcb" | "assembly";

const MARKUP_LABEL: Record<MarkupKey, string> = {
  component: "Component %",
  pcb: "PCB %",
  assembly: "Assembly %",
};

const MARKUP_FIELD: Record<MarkupKey, keyof TierOverrideValue> = {
  component: "component_markup_pct",
  pcb: "pcb_markup_pct",
  assembly: "assembly_markup_pct",
};

export function MarkupOverrideEditor({
  quoteId,
  tiers,
  globalComponentPct,
  globalPcbPct,
  globalAssemblyPct,
  tierOverrides,
  canEdit,
}: Props) {
  const router = useRouter();

  // Per-tier string state — empty string = "no override, inherit global".
  // Shape: { [tier_qty]: { component: string, pcb: string, assembly: string } }
  const initial = useMemo(() => {
    const out: Record<string, Record<MarkupKey, string>> = {};
    for (const qty of tiers) {
      const row = tierOverrides[String(qty)] ?? {};
      out[String(qty)] = {
        component:
          row.component_markup_pct != null ? String(row.component_markup_pct) : "",
        pcb: row.pcb_markup_pct != null ? String(row.pcb_markup_pct) : "",
        assembly:
          row.assembly_markup_pct != null ? String(row.assembly_markup_pct) : "",
      };
    }
    return out;
  }, [tiers, tierOverrides]);

  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function setCell(qty: number, key: MarkupKey, raw: string) {
    setValues((prev) => ({
      ...prev,
      [String(qty)]: { ...prev[String(qty)], [key]: raw },
    }));
  }

  function applyToAll(sourceQty: number, key: MarkupKey) {
    const source = values[String(sourceQty)]?.[key] ?? "";
    setValues((prev) => {
      const next: typeof prev = {};
      for (const qty of tiers) {
        next[String(qty)] = {
          ...prev[String(qty)],
          [key]: source,
        };
      }
      return next;
    });
  }

  function effectiveFor(qty: number, key: MarkupKey): number {
    const raw = values[String(qty)]?.[key] ?? "";
    if (raw === "") {
      return key === "component"
        ? globalComponentPct
        : key === "pcb"
          ? globalPcbPct
          : globalAssemblyPct;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  async function save(recalc: boolean) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      // Build the payload — empty string => clear that markup for the tier.
      const payload: Record<string, TierOverrideValue> = {};
      for (const qty of tiers) {
        const row = values[String(qty)] ?? { component: "", pcb: "", assembly: "" };
        const entry: TierOverrideValue = {};
        (Object.keys(MARKUP_FIELD) as MarkupKey[]).forEach((k) => {
          const raw = row[k];
          if (raw === "") {
            entry[MARKUP_FIELD[k]] = null;
          } else {
            const n = Number(raw);
            if (Number.isFinite(n)) entry[MARKUP_FIELD[k]] = n;
          }
        });
        payload[String(qty)] = entry;
      }

      const res = await fetch(`/api/quotes/${quoteId}/markup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier_markup_overrides: payload }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Save failed");
      }
      setMsg(recalc ? "Saved — recalculating…" : "Saved.");
      if (recalc) {
        const r = await fetch(`/api/quotes/${quoteId}/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!r.ok) {
          const e = await r.json();
          throw new Error(e.error ?? "Recalc failed");
        }
        setMsg("Saved and recalculated.");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Markup Overrides (per tier)</CardTitle>
        <p className="text-xs text-gray-500">
          Each tier can have its own markup. Leave a cell blank to inherit the
          global setting (Component {globalComponentPct}%, PCB {globalPcbPct}%,
          Assembly {globalAssemblyPct}%). Use{" "}
          <span className="font-medium">Apply to all</span> to copy a value
          down every tier.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium py-2 pr-3 text-gray-600">
                  Qty tier
                </th>
                {(Object.keys(MARKUP_LABEL) as MarkupKey[]).map((k) => (
                  <th key={k} className="text-left font-medium py-2 pr-3 text-gray-600">
                    {MARKUP_LABEL[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((qty, rowIdx) => (
                <tr key={qty} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-mono font-medium whitespace-nowrap">
                    {qty.toLocaleString()}
                  </td>
                  {(Object.keys(MARKUP_LABEL) as MarkupKey[]).map((k) => {
                    const globalForKey =
                      k === "component"
                        ? globalComponentPct
                        : k === "pcb"
                          ? globalPcbPct
                          : globalAssemblyPct;
                    const raw = values[String(qty)]?.[k] ?? "";
                    const effective = effectiveFor(qty, k);
                    const inheriting = raw === "";
                    return (
                      <td key={k} className="py-2 pr-3 min-w-[180px]">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder={`${globalForKey}`}
                            value={raw}
                            onChange={(e) => setCell(qty, k, e.target.value)}
                            disabled={!canEdit}
                            className="h-8 w-24"
                          />
                          {canEdit && tiers.length > 1 && rowIdx === 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => applyToAll(qty, k)}
                              title="Copy this value to every tier"
                            >
                              Apply to all
                            </Button>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Effective:{" "}
                          <span className="font-semibold">{effective}%</span>
                          {inheriting && (
                            <span className="ml-1 text-gray-400">(global)</span>
                          )}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={() => save(true)} disabled={busy}>
              {busy ? "Working…" : "Save & Recalculate"}
            </Button>
            {msg && <span className="text-sm text-green-600">{msg}</span>}
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-gray-500">
            This quote is <span className="italic">not in draft/review</span> —
            markup is locked.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
