"use client";

// ----------------------------------------------------------------------------
// programming-status-actions.tsx
//
// Compact selector for jobs.programming_status. Shown in the job detail
// header next to JobActions. Three states only:
//
//   not_ready    — default; no program on hand for this BOM revision
//   ready        — program is on hand and validated
//   not_required — board has no programming step
//
// On creation the API auto-detects 'ready' when a prior job exists for the
// same bom_id; otherwise it lands at 'not_ready' and a human flips it
// here. PATCH route accepts programming_status from both admin and
// production callers.
// ----------------------------------------------------------------------------

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Cpu, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "not_ready", label: "Not Ready" },
  { value: "ready", label: "Ready" },
  { value: "not_required", label: "Not Required" },
] as const;

type ProgrammingStatus = (typeof STATUS_OPTIONS)[number]["value"];

const TONE: Record<ProgrammingStatus, string> = {
  not_ready: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ready: "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300",
  not_required: "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

interface Props {
  jobId: string;
  initialStatus: ProgrammingStatus;
}

export function ProgrammingStatusActions({ jobId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ProgrammingStatus>(initialStatus);
  const [pending, startTransition] = useTransition();

  function handleChange(next: ProgrammingStatus | null) {
    if (!next || next === status) return;
    if (!STATUS_OPTIONS.some((o) => o.value === next)) return;
    const previous = status;
    const newStatus = next;
    setStatus(newStatus); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programming_status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update programming status");
        }
        toast.success("Programming status updated", {
          description: STATUS_OPTIONS.find((o) => o.value === newStatus)?.label,
        });
        router.refresh();
      } catch (err) {
        setStatus(previous); // revert
        toast.error("Failed to update programming status", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  }

  const currentLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

  return (
    <Select value={status} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        className={`h-8 text-xs gap-1.5 ${TONE[status]} ${pending ? "opacity-60" : ""}`}
      >
        <Cpu className="h-3.5 w-3.5" />
        <SelectValue placeholder="Programming…">
          {(value: string) => {
            if (!value) return "Programming…";
            const opt = STATUS_OPTIONS.find((o) => o.value === value);
            return `Programming: ${opt?.label ?? currentLabel}`;
          }}
        </SelectValue>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
