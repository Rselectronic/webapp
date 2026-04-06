import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db.js";

export function registerCustomerTools(server: McpServer) {
  // ── rs_list_customers ──
  server.tool(
    "rs_list_customers",
    "List all customers with summary stats. Filter by active status or search by name/code.",
    {
      status: z.enum(["active", "inactive", "all"]).default("active").describe("Filter by active status"),
      search: z.string().optional().describe("Search by company name or customer code"),
    },
    async ({ status, search }) => {
      let query = supabase
        .from("customers")
        .select("id, code, company_name, contact_name, contact_email, payment_terms, is_active");

      if (status === "active") query = query.eq("is_active", true);
      else if (status === "inactive") query = query.eq("is_active", false);

      if (search) {
        query = query.or(`company_name.ilike.%${search}%,code.ilike.%${search}%`);
      }

      const { data: customers, error } = await query.order("company_name");

      if (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }

      // Get active job counts per customer
      const { data: jobCounts } = await supabase
        .from("jobs")
        .select("customer_id, status")
        .not("status", "in", '("delivered","invoiced","archived")');

      const activeJobsByCustomer: Record<string, number> = {};
      for (const j of jobCounts ?? []) {
        activeJobsByCustomer[j.customer_id] = (activeJobsByCustomer[j.customer_id] ?? 0) + 1;
      }

      const result = (customers ?? []).map((c) => ({
        code: c.code,
        company_name: c.company_name,
        contact_name: c.contact_name,
        contact_email: c.contact_email,
        payment_terms: c.payment_terms,
        is_active: c.is_active,
        active_jobs: activeJobsByCustomer[c.id] ?? 0,
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── rs_get_customer ──
  server.tool(
    "rs_get_customer",
    "Get full customer detail including BOM config, recent quotes, active jobs, and recent invoices.",
    {
      customer_code: z.string().describe("Customer code, e.g. 'TLAN', 'LABO', 'CSA'"),
    },
    async ({ customer_code }) => {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("code", customer_code.toUpperCase())
        .single();

      if (error || !customer) {
        return {
          content: [{ type: "text" as const, text: `Customer '${customer_code}' not found.` }],
          isError: true,
        };
      }

      const [
        { data: quotes },
        { data: jobs },
        { data: invoices },
        { data: gmps },
      ] = await Promise.all([
        supabase
          .from("quotes")
          .select("quote_number, status, created_at, quantities, pricing")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("jobs")
          .select("job_number, status, quantity, scheduled_completion, created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("invoices")
          .select("invoice_number, status, total, due_date, paid_date")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("gmps")
          .select("gmp_number, board_name, revision, is_active")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false }),
      ]);

      const result = {
        ...customer,
        gmps: gmps ?? [],
        recent_quotes: quotes ?? [],
        active_jobs: jobs ?? [],
        recent_invoices: invoices ?? [],
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
