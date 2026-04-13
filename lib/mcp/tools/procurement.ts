import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";

export function registerProcurementTools(server: McpServer) {
  server.tool(
    "rs_get_procurement",
    "Get full procurement detail with all line items showing mpn, quantities needed/ordered/received, and supplier info.",
    {
      procurement_id: z
        .string()
        .uuid()
        .optional()
        .describe("Procurement UUID"),
      proc_code: z
        .string()
        .optional()
        .describe("Procurement code, e.g. '260403 TLAN-TB085'"),
    },
    async ({ procurement_id, proc_code }) => {
      let query = supabase
        .from("procurements")
        .select(
          "*, jobs(job_number, status, customers(code, company_name))"
        );

      if (procurement_id) {
        query = query.eq("id", procurement_id);
      } else if (proc_code) {
        query = query.eq("proc_code", proc_code);
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide procurement_id or proc_code.",
            },
          ],
          isError: true,
        };
      }

      const { data: proc, error } = await query.single();
      if (error || !proc) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Procurement not found: ${error?.message ?? "unknown"}`,
            },
          ],
          isError: true,
        };
      }

      const { data: lines } = await supabase
        .from("procurement_lines")
        .select(
          "mpn, description, m_code, qty_needed, qty_extra, qty_ordered, qty_received, supplier, supplier_pn, unit_price, extended_price, is_bg, order_status, notes"
        )
        .eq("procurement_id", proc.id)
        .order("created_at");

      const { data: pos } = await supabase
        .from("supplier_pos")
        .select(
          "po_number, supplier_name, total_amount, status, sent_at, expected_arrival, tracking_number"
        )
        .eq("procurement_id", proc.id)
        .order("created_at");

      const procRow = proc as Record<string, unknown>;
      const result = {
        proc_code: procRow.proc_code,
        status: procRow.status,
        total_lines: procRow.total_lines,
        lines_ordered: procRow.lines_ordered,
        lines_received: procRow.lines_received,
        job: procRow.jobs,
        lines: lines ?? [],
        supplier_pos: pos ?? [],
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_list_backorders",
    "List all procurement lines on backorder (qty_received < qty_ordered) across all active procurements.",
    {},
    async () => {
      const { data, error } = await supabase
        .from("procurement_lines")
        .select(
          "mpn, description, supplier, supplier_pn, qty_ordered, qty_received, order_status, notes, procurement_id, procurements(proc_code, jobs(job_number, customers(code)))"
        )
        .in("order_status", ["ordered", "backordered"])
        .order("created_at");

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const backorders = (data ?? [])
        .filter((l) => (l.qty_received ?? 0) < (l.qty_ordered ?? 0))
        .map((l: Record<string, unknown>) => {
          const procs = l.procurements as
            | {
                proc_code?: string;
                jobs?: {
                  job_number?: string;
                  customers?: { code?: string };
                };
              }
            | null;
          return {
            mpn: l.mpn,
            description: l.description,
            supplier: l.supplier,
            qty_ordered: l.qty_ordered,
            qty_received: l.qty_received,
            shortage:
              (Number(l.qty_ordered) || 0) - (Number(l.qty_received) || 0),
            order_status: l.order_status,
            proc_code: procs?.proc_code,
            job_number: procs?.jobs?.job_number,
            customer: procs?.jobs?.customers?.code,
          };
        });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(backorders, null, 2) },
        ],
      };
    }
  );
}
