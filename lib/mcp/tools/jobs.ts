import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";

export function registerJobTools(server: McpServer) {
  server.tool(
    "rs_list_jobs",
    "List jobs with optional filters by status or customer.",
    {
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status: created, procurement, parts_ordered, parts_received, production, inspection, shipping, delivered, invoiced, archived"
        ),
      customer_code: z
        .string()
        .optional()
        .describe("Filter by customer code"),
      limit: z.number().default(25).describe("Max results"),
    },
    async ({ status, customer_code, limit }) => {
      let query = supabase
        .from("jobs")
        .select(
          "id, job_number, status, quantity, assembly_type, po_number, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) query = query.eq("status", status);

      if (customer_code) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id")
          .eq("code", customer_code.toUpperCase())
          .single();
        if (cust) query = query.eq("customer_id", cust.id);
      }

      const { data, error } = await query;
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const result = (data ?? []).map((j: Record<string, unknown>) => {
        const customers = j.customers as
          | { code?: string; company_name?: string }
          | { code?: string; company_name?: string }[]
          | null;
        const c = Array.isArray(customers) ? customers[0] : customers;
        const gmps = j.gmps as
          | { gmp_number?: string }
          | { gmp_number?: string }[]
          | null;
        const g = Array.isArray(gmps) ? gmps[0] : gmps;
        return {
          job_number: j.job_number,
          customer: c?.code,
          customer_name: c?.company_name,
          gmp: g?.gmp_number,
          status: j.status,
          quantity: j.quantity,
          assembly_type: j.assembly_type,
          po_number: j.po_number,
          scheduled_start: j.scheduled_start,
          scheduled_completion: j.scheduled_completion,
          created_at: j.created_at,
        };
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_get_job",
    "Get full job detail with customer, GMP, quote reference, procurement status, production events, and documents.",
    {
      job_id: z.string().uuid().optional().describe("Job UUID"),
      job_number: z
        .string()
        .optional()
        .describe("Job number, e.g. 'JB-2604-TLAN-001'"),
    },
    async ({ job_id, job_number }) => {
      let query = supabase
        .from("jobs")
        .select(
          "*, customers(code, company_name), gmps(gmp_number, board_name), quotes(quote_number, pricing, quantities)"
        );

      if (job_id) {
        query = query.eq("id", job_id);
      } else if (job_number) {
        query = query.eq("job_number", job_number);
      } else {
        return {
          content: [
            { type: "text" as const, text: "Provide job_id or job_number." },
          ],
          isError: true,
        };
      }

      const { data: job, error } = await query.single();
      if (error || !job) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Job not found: ${error?.message ?? "unknown"}`,
            },
          ],
          isError: true,
        };
      }

      const { data: procurements } = await supabase
        .from("procurements")
        .select("proc_code, status, total_lines, lines_ordered, lines_received")
        .eq("job_id", job.id);

      const { data: events } = await supabase
        .from("production_events")
        .select("event_type, notes, created_at, operator_id")
        .eq("job_id", job.id)
        .order("created_at");

      const { data: statusLog } = await supabase
        .from("job_status_log")
        .select("old_status, new_status, notes, created_at")
        .eq("job_id", job.id)
        .order("created_at");

      const result = {
        ...job,
        procurements: procurements ?? [],
        production_events: events ?? [],
        status_history: statusLog ?? [],
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_update_job_status",
    "Move a job to a new status. Inserts a record into the job_status_log. Requires ceo or operations_manager role.",
    {
      job_id: z.string().uuid().optional().describe("Job UUID"),
      job_number: z.string().optional().describe("Job number"),
      new_status: z
        .enum([
          "created",
          "procurement",
          "parts_ordered",
          "parts_received",
          "production",
          "inspection",
          "shipping",
          "delivered",
          "invoiced",
          "archived",
        ])
        .describe("Target status"),
      notes: z
        .string()
        .optional()
        .describe("Reason or notes for the status change"),
    },
    async ({ job_id, job_number, new_status, notes }) => {
      let query = supabase.from("jobs").select("id, job_number, status");
      if (job_id) query = query.eq("id", job_id);
      else if (job_number) query = query.eq("job_number", job_number);
      else
        return {
          content: [
            { type: "text" as const, text: "Provide job_id or job_number." },
          ],
          isError: true,
        };

      const { data: job, error: jobErr } = await query.single();
      if (jobErr || !job) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Job not found: ${jobErr?.message ?? "unknown"}`,
            },
          ],
          isError: true,
        };
      }

      const oldStatus = job.status;

      const { error: updateErr } = await supabase
        .from("jobs")
        .update({ status: new_status, updated_at: new Date().toISOString() })
        .eq("id", job.id);

      if (updateErr) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Update failed: ${updateErr.message}`,
            },
          ],
          isError: true,
        };
      }

      await supabase.from("job_status_log").insert({
        job_id: job.id,
        old_status: oldStatus,
        new_status: new_status,
        notes: notes ?? null,
      });

      const result = {
        job_number: job.job_number,
        old_status: oldStatus,
        new_status: new_status,
        updated_at: new Date().toISOString(),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );
}
