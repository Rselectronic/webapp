"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Save, X } from "lucide-react";
import { toast } from "sonner";

interface JobSchedulerProps {
  jobId: string;
  jobNumber: string;
  scheduledStart: string | null;
  scheduledCompletion: string | null;
}

export function JobScheduler({
  jobId,
  jobNumber,
  scheduledStart,
  scheduledCompletion,
}: JobSchedulerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState(scheduledStart ?? "");
  const [completion, setCompletion] = useState(scheduledCompletion ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      body.scheduled_start = start || null;
      body.scheduled_completion = completion || null;

      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update schedule");
      }

      toast.success(`Schedule updated for ${jobNumber}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to save schedule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setStart(scheduledStart ?? "");
    setCompletion(scheduledCompletion ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        className="gap-1.5"
      >
        <Calendar className="h-4 w-4" />
        {scheduledStart || scheduledCompletion ? "Edit Schedule" : "Set Schedule"}
      </Button>
    );
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4" />
          Production Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="scheduled-start" className="text-xs">
              Scheduled Start
            </Label>
            <Input
              id="scheduled-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="scheduled-completion" className="text-xs">
              Scheduled Completion
            </Label>
            <Input
              id="scheduled-completion"
              type="date"
              value={completion}
              onChange={(e) => setCompletion(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={saving} onClick={handleSave}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Schedule"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
