"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface NCREditFormProps {
  ncrId: string;
  currentRootCause: string | null;
  currentCorrectiveAction: string | null;
  currentPreventiveAction: string | null;
}

export function NCREditForm({
  ncrId,
  currentRootCause,
  currentCorrectiveAction,
  currentPreventiveAction,
}: NCREditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rootCause, setRootCause] = useState(currentRootCause ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(
    currentCorrectiveAction ?? ""
  );
  const [preventiveAction, setPreventiveAction] = useState(
    currentPreventiveAction ?? ""
  );

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ncr/${ncrId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_cause: rootCause || null,
          corrective_action: correctiveAction || null,
          preventive_action: preventiveAction || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      router.refresh();
    } catch (err) {
      console.error("NCR update failed:", err);
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          CAAF - Corrective Action and Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="root-cause">Root Cause</Label>
          <Textarea
            id="root-cause"
            placeholder="Describe the root cause of this non-conformance..."
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="corrective-action">Corrective Action</Label>
          <Textarea
            id="corrective-action"
            placeholder="What corrective action was taken..."
            value={correctiveAction}
            onChange={(e) => setCorrectiveAction(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preventive-action">Preventive Action</Label>
          <Textarea
            id="preventive-action"
            placeholder="What preventive measures will be implemented..."
            value={preventiveAction}
            onChange={(e) => setPreventiveAction(e.target.value)}
            rows={3}
          />
        </div>

        <Button size="sm" disabled={loading} onClick={handleSave}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
