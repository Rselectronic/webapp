import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db.js";

export function registerQuoteTools(server: McpServer) {
  // ── rs_list_quotes ──
  server.tool(
    "rs_list_quotes",
    "List quotes with optional filters by status, customer, or date range.",
    {
      status: z.string().optional().describe("Filter by status: draft, review, sent, accepted, rejected, expired"),
      customer_code: z.string().optional().describe("Filter by customer code"),
      date_from: z.string().optional().describe("ISO date string, e.g. '2026-01-01'"),
      limit: z.number().default(25).describe("Max results"),
    },
    async ({ status, customer_code, date_from, limit }) => {
      let query = supabase
        .from("quotes")
        .select("id, quote_number, status, quantities, created_at, issued_at, expires_at, customer_id, customers(code, company_name), gmps(gmp_number, board_name)")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) query = query.eq("status", status);
      if (date_from) query = query.gte("created_at", date_from);

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
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }

      const result = (data ?? []).map((q: any) => ({
        quote_number: q.quote_number,
        customer: q.customers?.code,
        customer_name: q.customers?.company_name,
        gmp: q.gmps?.gmp_number,
        status: q.status,
        quantities: q.quantities,
        issued_at: q.issued_at,
        expires_at: q.expires_at,
        created_at: q.created_at,
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── rs_get_quote ──
  server.tool(
    "rs_get_quote",
    "Get full quote detail with pricing breakdown per tier.",
    {
      quote_id: z.string().uuid().optional().describe("Quote UUID"),
      quote_number: z.string().optional().describe("Quote number, e.g. 'QT-2604-001'"),
    },
    async ({ quote_id, quote_number }) => {
      let query = supabase
        .from("quotes")
        .select("*, customers(code, company_name), gmps(gmp_number, board_name), boms(file_name, component_count)")

      if (quote_id) {
        query = query.eq("id", quote_id);
      } else if (quote_number) {
        query = query.eq("quote_number", quote_number);
      } else {
        return { content: [{ type: "text" as const, text: "Provide quote_id or quote_number." }], isError: true };
      }

      const { data: quote, error } = await query.single();
      if (error || !quote) {
        return { content: [{ type: "text" as const, text: `Quote not found: ${error?.message ?? "unknown"}` }], isError: true };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(quote, null, 2) }] };
    }
  );
}
