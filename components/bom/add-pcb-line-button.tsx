"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface AddPcbLineButtonProps {
  bomId: string;
  defaultMpn?: string | null;
  defaultCpc?: string | null;
  defaultDescription?: string | null;
}

/**
 * Manual "+ Add PCB line" control for BOMs that have no is_pcb row. Pre-fills
 * MPN/CPC/Description from boms.gerber_name when available. Quantity is
 * locked to 1 per the PCB-line contract.
 */
export function AddPcbLineButton({
  bomId,
  defaultMpn,
  defaultCpc,
  defaultDescription,
}: AddPcbLineButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mpn, setMpn] = useState(defaultMpn ?? "");
  const [cpc, setCpc] = useState(defaultCpc ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bom/${bomId}/add-pcb-line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mpn: mpn.trim() || undefined,
          cpc: cpc.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      toast.success("PCB line added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to add PCB line", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" />
        Add PCB line
      </Button>
    );
  }

  return (
    <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-3 space-y-3 dark:border-blue-900/50 dark:bg-blue-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
        Add PCB line
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="pcb-mpn" className="text-xs">MPN</Label>
          <Input
            id="pcb-mpn"
            value={mpn}
            onChange={(e) => setMpn(e.target.value)}
            placeholder="Gerber / board name"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pcb-cpc" className="text-xs">CPC</Label>
          <Input
            id="pcb-cpc"
            value={cpc}
            onChange={(e) => setCpc(e.target.value)}
            placeholder="Gerber / board name"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pcb-desc" className="text-xs">Description</Label>
          <Input
            id="pcb-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="(PCB)"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add PCB line
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <span className="text-xs text-gray-500">Quantity locked to 1.</span>
      </div>
    </div>
  );
}
