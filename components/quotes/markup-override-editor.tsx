"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  quoteId: string;
  globalComponentPct: number;
  globalPcbPct: number;
  globalAssemblyPct: number;
  componentOverride: number | null;
  pcbOverride: number | null;
  assemblyOverride: number | null;
  canEdit: boolean;
}

export function MarkupOverrideEditor({
  quoteId,
  globalComponentPct,
  globalPcbPct,
  globalAssemblyPct,
  componentOverride,
  pcbOverride,
  assemblyOverride,
  canEdit,
}: Props) {
  const router = useRouter();
  const [comp, setComp] = useState<string>(
    componentOverride !== null ? String(componentOverride) : ""
  );
  const [pcb, setPcb] = useState<string>(
    pcbOverride !== null ? String(pcbOverride) : ""
  );
  const [assembly, setAssembly] = useState<string>(
    assemblyOverride !== null ? String(assemblyOverride) : ""
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(recalc: boolean) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const payload: Record<string, number | null> = {
        component_markup_pct: comp === "" ? null : Number(comp),
        pcb_markup_pct: pcb === "" ? null : Number(pcb),
        assembly_markup_pct: assembly === "" ? null : Number(assembly),
      };
      const res = await fetch(`/api/quotes/${quoteId}/markup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Save failed");
      }
      setMsg(recalc ? "Saved — recalculating…" : "Saved. Click 'Save & Recalculate' to apply to pricing.");
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

  const effectiveComp =
    comp === "" ? globalComponentPct : Number(comp);
  const effectivePcb = pcb === "" ? globalPcbPct : Number(pcb);
  const effectiveAssembly =
    assembly === "" ? globalAssemblyPct : Number(assembly);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Markup Overrides</CardTitle>
        <p className="text-xs text-gray-500">
          Per-quote override. Leave blank to use global settings. Requires
          &quot;Save &amp; Recalculate&quot; to apply to pricing numbers above.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="comp-markup" className="text-xs">
              Component markup % <span className="text-gray-400">(global: {globalComponentPct}%)</span>
            </Label>
            <Input
              id="comp-markup"
              type="number"
              step="0.1"
              placeholder={`blank = ${globalComponentPct}%`}
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-[11px] text-gray-500">
              Effective: <span className="font-semibold">{effectiveComp}%</span>
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pcb-markup" className="text-xs">
              PCB markup % <span className="text-gray-400">(global: {globalPcbPct}%)</span>
            </Label>
            <Input
              id="pcb-markup"
              type="number"
              step="0.1"
              placeholder={`blank = ${globalPcbPct}%`}
              value={pcb}
              onChange={(e) => setPcb(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-[11px] text-gray-500">
              Effective: <span className="font-semibold">{effectivePcb}%</span>
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="assembly-markup" className="text-xs">
              Assembly markup % <span className="text-gray-400">(global: {globalAssemblyPct}%)</span>
            </Label>
            <Input
              id="assembly-markup"
              type="number"
              step="0.1"
              placeholder={`blank = ${globalAssemblyPct}%`}
              value={assembly}
              onChange={(e) => setAssembly(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-[11px] text-gray-500">
              Effective: <span className="font-semibold">{effectiveAssembly}%</span>
            </p>
          </div>
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
            This quote is {""}
            <span className="italic">not in draft/review</span> — markup is locked.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
