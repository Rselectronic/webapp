"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";

interface Props {
  quoteId: string;
  qtyValues: number[];
  initialLeadTimes: Record<string, string>;
  canEdit: boolean;
}

export function LeadTimesEditor({ quoteId, qtyValues, initialLeadTimes, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initialLeadTimes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasAny = qtyValues.some((_, i) => (values[`tier_${i + 1}`] ?? "").trim());

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lead-times`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_times: values }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Save failed");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs">
          {hasAny
            ? qtyValues
                .map((qty, i) => {
                  const lt = (values[`tier_${i + 1}`] ?? "").trim();
                  return lt ? `${qty}→${lt}` : null;
                })
                .filter(Boolean)
                .join(" / ")
            : "—"}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-blue-600 hover:text-blue-700"
            title="Edit lead times"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {qtyValues.map((qty, i) => {
        const key = `tier_${i + 1}`;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-14 text-xs text-gray-500">qty {qty}</span>
            <Input
              value={values[key] ?? ""}
              onChange={(e) =>
                setValues((s) => ({ ...s, [key]: e.target.value }))
              }
              placeholder="e.g. 2 weeks"
              className="h-7 text-xs"
            />
          </div>
        );
      })}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={save} disabled={saving} className="h-7">
          <Check className="mr-1 h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setValues(initialLeadTimes);
            setEditing(false);
            setErr(null);
          }}
          disabled={saving}
          className="h-7"
        >
          <X className="mr-1 h-3 w-3" />
          Cancel
        </Button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
