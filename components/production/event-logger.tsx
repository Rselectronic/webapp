"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Job {
  id: string;
  job_number: string;
  customers: { code: string } | null;
}

interface ProductionEvent {
  id: string;
  job_id: string;
  event_type: string;
  notes: string | null;
  created_at: string;
  jobs: { job_number: string; customers: { code: string } | null } | null;
}

interface EventLoggerProps {
  jobs: Job[];
}

const EVENT_GROUPS = [
  {
    label: "Setup",
    events: [
      { type: "materials_received", label: "Materials Received" },
      { type: "setup_started", label: "Setup Started" },
    ],
  },
  {
    label: "SMT Top",
    events: [
      { type: "smt_top_start", label: "SMT Top Start" },
      { type: "smt_top_end", label: "SMT Top End" },
    ],
  },
  {
    label: "SMT Bottom",
    events: [
      { type: "smt_bottom_start", label: "SMT Bottom Start" },
      { type: "smt_bottom_end", label: "SMT Bottom End" },
    ],
  },
  {
    label: "Reflow",
    events: [
      { type: "reflow_start", label: "Reflow Start" },
      { type: "reflow_end", label: "Reflow End" },
    ],
  },
  {
    label: "AOI",
    events: [
      { type: "aoi_start", label: "AOI Start" },
      { type: "aoi_passed", label: "AOI Passed" },
      { type: "aoi_failed", label: "AOI Failed" },
    ],
  },
  {
    label: "Through Hole",
    events: [
      { type: "through_hole_start", label: "TH Start" },
      { type: "through_hole_end", label: "TH End" },
    ],
  },
  {
    label: "Final",
    events: [
      { type: "touchup", label: "Touchup" },
      { type: "washing", label: "Washing" },
      { type: "packing", label: "Packing" },
      { type: "ready_to_ship", label: "Ready to Ship" },
    ],
  },
] as const;

function formatEventType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function EventLogger({ jobs }: EventLoggerProps) {
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentEvents, setRecentEvents] = useState<ProductionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const url = selectedJobId
      ? `/api/production?job_id=${selectedJobId}`
      : "/api/production";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setRecentEvents(data.events ?? []);
    }
  }, [selectedJobId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  async function handleEventClick(eventType: string) {
    if (!selectedJobId) {
      setError("Please select a job first");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          event_type: eventType,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to log event");
        return;
      }

      const selectedJob = jobs.find((j) => j.id === selectedJobId);
      setSuccess(
        `Logged "${formatEventType(eventType)}" for ${selectedJob?.job_number ?? "job"}`
      );
      setNotes("");
      await fetchEvents();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Job selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={selectedJobId}
            onValueChange={(v) => {
              if (!v) return;
              setSelectedJobId(v);
              setSuccess(null);
              setError(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a job in production..." />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.job_number}
                  {job.customers ? ` (${job.customers.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div>
            <label
              htmlFor="event-notes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Notes (optional)
            </label>
            <Textarea
              id="event-notes"
              placeholder="Add any notes for this event..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Status messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Event type buttons grouped */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {EVENT_GROUPS.map((group) => (
          <Card key={group.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600">
                {group.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {group.events.map((evt) => (
                <Button
                  key={evt.type}
                  variant="outline"
                  size="sm"
                  disabled={!selectedJobId || submitting}
                  onClick={() => handleEventClick(evt.type)}
                  className="justify-start"
                >
                  {evt.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No events logged yet.</p>
          ) : (
            <div className="divide-y">
              {recentEvents.slice(0, 20).map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-start justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {formatEventType(evt.event_type)}
                    </span>
                    <span className="ml-2 text-sm text-gray-700">
                      {evt.jobs?.job_number ?? "—"}
                      {evt.jobs?.customers
                        ? ` (${evt.jobs.customers.code})`
                        : ""}
                    </span>
                    {evt.notes && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {evt.notes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {timeAgo(evt.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
