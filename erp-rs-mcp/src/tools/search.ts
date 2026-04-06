import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db.js";

export function registerSearchTools(server: McpServer) {
  // ── rs_search ──
  server.tool(
    "rs_search",
    "Universal search across customers, quotes, jobs, invoices, and components by keyword. Returns the top matches from each entity type.",
    {
      query: z.string().describe("Search keyword"),
      entity_types: z
        .array(z.enum(["customers", "quotes", "jobs", "invoices", "components"]))
        .optional()
        .describe("Limit search to specific entity types. Defaults to all."),
      limit: z.number().default(5).describe("Max results per entity type"),
    },
    async ({ query, entity_types, limit }) => {
      const types = entity_types ?? ["customers", "quotes", "jobs", "invoices", "components"];
      const results: Array<{ type: string; id: string; title: string; summary: string }> = [];

      const q = query.trim();

      if (types.includes("customers")) {
        const { data } = await supabase
          .from("customers")
          .select("id, code, company_name, contact_name")
          .or(`company_name.ilike.%${q}%,code.ilike.%${q}%,contact_name.ilike.%${q}%`)
          .limit(limit);

        for (const c of data ?? []) {
          results.push({
            type: "customer",
            id: c.id,
            title: `${c.code} - ${c.company_name}`,
            summary: c.contact_name ? `Contact: ${c.contact_name}` : "No contact on file",
          });
        }
      }

      if (types.includes("quotes")) {
        const { data } = await supabase
          .from("quotes")
          .select("id, quote_number, status, customers(code, company_name)")
          .or(`quote_number.ilike.%${q}%`)
          .limit(limit);

        for (const qt of data ?? []) {
          results.push({
            type: "quote",
            id: qt.id,
            title: qt.quote_number,
            summary: `Status: ${qt.status} | Customer: ${(qt as any).customers?.code ?? "N/A"}`,
          });
        }
      }

      if (types.includes("jobs")) {
        const { data } = await supabase
          .from("jobs")
          .select("id, job_number, status, po_number, customers(code)")
          .or(`job_number.ilike.%${q}%,po_number.ilike.%${q}%`)
          .limit(limit);

        for (const j of data ?? []) {
          results.push({
            type: "job",
            id: j.id,
            title: j.job_number,
            summary: `Status: ${j.status} | PO: ${j.po_number ?? "N/A"} | Customer: ${(j as any).customers?.code ?? "N/A"}`,
          });
        }
      }

      if (types.includes("invoices")) {
        const { data } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, total, customers(code)")
          .or(`invoice_number.ilike.%${q}%`)
          .limit(limit);

        for (const inv of data ?? []) {
          results.push({
            type: "invoice",
            id: inv.id,
            title: inv.invoice_number,
            summary: `Status: ${inv.status} | Total: $${inv.total} | Customer: ${(inv as any).customers?.code ?? "N/A"}`,
          });
        }
      }

      if (types.includes("components")) {
        const { data } = await supabase
          .from("components")
          .select("id, mpn, manufacturer, description, m_code")
          .or(`mpn.ilike.%${q}%,description.ilike.%${q}%,manufacturer.ilike.%${q}%`)
          .limit(limit);

        for (const c of data ?? []) {
          results.push({
            type: "component",
            id: c.id,
            title: c.mpn,
            summary: `${c.manufacturer ?? ""} | ${c.description ?? ""} | M-Code: ${c.m_code ?? "unclassified"}`,
          });
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
    }
  );
}
