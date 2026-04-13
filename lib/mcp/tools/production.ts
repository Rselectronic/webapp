import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";

export function registerProductionTools(server: McpServer) {
  server.tool(
    "rs_get_production_status",
    "Get the current production status for a job: all production events in chronological order.",
    {
      job_id: z.string().uuid().optional().describe("Job UUID"),
      job_number: z.string().optional().describe("Job number"),
    },
    async ({ job_id, job_number }) => {
      let jid = job_id;

      if (!jid && job_number) {
        const { data: job } = await supabase
          .from("jobs")
          .select("id")
          .eq("job_number", job_number)
          .single();
        if (!job) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Job '${job_number}' not found.`,
              },
            ],
            isError: true,
          };
        }
        jid = job.id;
      }

      if (!jid) {
        return {
          content: [
            { type: "text" as const, text: "Provide job_id or job_number." },
          ],
          isError: true,
        };
      }

      const [{ data: job }, { data: events }] = await Promise.all([
        supabase
          .from("jobs")
          .select(
            "job_number, status, quantity, actual_start, actual_completion, customers(code, company_name), gmps(gmp_number)"
          )
          .eq("id", jid)
          .single(),
        supabase
          .from("production_events")
          .select(
            "event_type, notes, created_at, operator_id, users(full_name)"
          )
          .eq("job_id", jid)
          .order("created_at"),
      ]);

      const lastEvent =
        events && events.length > 0 ? events[events.length - 1] : null;

      const result = {
        job: job ?? {},
        current_step: lastEvent?.event_type ?? "none",
        total_events: events?.length ?? 0,
        events: (events ?? []).map((e: Record<string, unknown>) => {
          const u = e.users as
            | { full_name?: string }
            | { full_name?: string }[]
            | null;
          const user = Array.isArray(u) ? u[0] : u;
          return {
            event_type: e.event_type,
            operator: user?.full_name ?? "Unknown",
            notes: e.notes,
            timestamp: e.created_at,
          };
        }),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_log_production_event",
    "Log a production event for a job (e.g. smt_top_start, reflow_end, aoi_passed). Used by shop floor operators.",
    {
      job_id: z.string().uuid().optional().describe("Job UUID"),
      job_number: z.string().optional().describe("Job number"),
      event_type: z
        .enum([
          "materials_received",
          "setup_started",
          "smt_top_start",
          "smt_top_end",
          "smt_bottom_start",
          "smt_bottom_end",
          "reflow_start",
          "reflow_end",
          "aoi_start",
          "aoi_passed",
          "aoi_failed",
          "through_hole_start",
          "through_hole_end",
          "touchup",
          "washing",
          "packing",
          "ready_to_ship",
        ])
        .describe("Production event type"),
      notes: z.string().optional().describe("Optional notes"),
    },
    async ({ job_id, job_number, event_type, notes }) => {
      let jid = job_id;

      if (!jid && job_number) {
        const { data: job } = await supabase
          .from("jobs")
          .select("id")
          .eq("job_number", job_number)
          .single();
        if (!job) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Job '${job_number}' not found.`,
              },
            ],
            isError: true,
          };
        }
        jid = job.id;
      }

      if (!jid) {
        return {
          content: [
            { type: "text" as const, text: "Provide job_id or job_number." },
          ],
          isError: true,
        };
      }

      const { data: event, error } = await supabase
        .from("production_events")
        .insert({
          job_id: jid,
          event_type,
          notes: notes ?? null,
        })
        .select("id, event_type, created_at")
        .single();

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const { data: jobInfo } = await supabase
        .from("jobs")
        .select("job_number")
        .eq("id", jid)
        .single();

      const result = {
        event_id: event?.id,
        job_number: jobInfo?.job_number ?? job_number,
        event_type: event?.event_type,
        timestamp: event?.created_at,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );
}
