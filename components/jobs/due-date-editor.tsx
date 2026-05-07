"use client";

// ----------------------------------------------------------------------------
// due-date-editor.tsx
//
// Inline editor for jobs.due_date — the customer-facing delivery deadline.
// Admin-only; production users don't see this control.
//
// Behaviour: click the date to enter edit mode, change it (or clear it),
// hit save → PATCH /api/jobs/:id. Optimistic update + revert on failure.
// Distinct from JobScheduler (which edits scheduled_start /
// scheduled_completion, the production-internal target).
// ----------------------------------------------------------------------------

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Save, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/format";

interface Props {
  jobId: string;
  initialDueDate: string | null;
}

function formatYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DueDateEditor({ jobId, initialDueDate }: Props) {
  const router = useRouter();
  const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(initialDueDate ?? "");
  const [pending, startTransition] = useTransition();

  // Days from today — drives the "due in N days" / "N days overdue" hint.
  const today = formatYMD(new Date());
  const daysFromToday = dueDate
    ? Math.round(
        (new Date(`${dueDate}T00:00:00`).getTime() -
          new Date(`${today}T00:00:00`).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  function startEdit() {
    setDraft(dueDate ?? "");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(dueDate ?? "");
  }

  function save() {
    const next = draft || null;
    if (next === dueDate) {
      setEditing(false);
      return;
    }
    if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      toast.error("Invalid date");
      return;
    }
    const previous = dueDate;
    setDueDate(next); // optimistic
    setEditing(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ due_date: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update due date");
        }
        toast.success("Due date updated", {
          description: next ?? "Cleared",
        });
        router.refresh();
      } catch (err) {
        setDueDate(previous);
        toast.error("Failed to update due date", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-auto text-xs"
          autoFocus
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={pending}
          onClick={save}
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={pending}
          onClick={cancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        {dueDate && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] text-gray-500"
            disabled={pending}
            onClick={() => {
              setDraft("");
            }}
          >
            Clear
          </Button>
        )}
      </div>
    );
  }

  // Read view.
  let hint: { text: string; tone: string } | null = null;
  if (daysFromToday !== null) {
    if (daysFromToday < 0) {
      hint = {
        text: `${Math.abs(daysFromToday)}d overdue`,
        tone: "text-red-700 bg-red-50 border-red-200",
      };
    } else if (daysFromToday === 0) {
      hint = {
        text: "Due today",
        tone: "text-orange-700 bg-orange-50 border-orange-200",
      };
    } else if (daysFromToday <= 7) {
      hint = {
        text: `Due in ${daysFromToday}d`,
        tone: "text-amber-700 bg-amber-50 border-amber-200",
      };
    } else {
      hint = {
        text: `${daysFromToday}d remaining`,
        tone: "text-gray-600 bg-gray-50 border-gray-200",
      };
    }
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm">
        {dueDate ? formatDate(dueDate) : <span className="text-gray-400">Not set</span>}
      </p>
      {hint && (
        <span
          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${hint.tone}`}
        >
          {hint.text}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-[11px] text-gray-500 hover:text-gray-900"
        onClick={startEdit}
        disabled={pending}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}
