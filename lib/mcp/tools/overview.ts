import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabase } from "../db";

export function registerOverviewTools(server: McpServer) {
  server.tool(
    "rs_business_overview",
    "High-level snapshot of RS PCB Assembly business: active customers, open quotes, active jobs by status, outstanding invoices, and recent activity. Call this first to orient yourself.",
    {},
    async () => {
      const [
        { count: customerCount },
        { data: quotes },
        { data: jobs },
        { data: invoices },
        { data: recentJobs },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("quotes").select("status"),
        supabase.from("jobs").select("status"),
        supabase.from("invoices").select("status, total, due_date"),
        supabase
          .from("jobs")
          .select(
            "job_number, status, updated_at, customer_id, customers(company_name)"
          )
          .order("updated_at", { ascending: false })
          .limit(10),
      ]);

      const quotesByStatus: Record<string, number> = {};
      for (const q of quotes ?? []) {
        quotesByStatus[q.status] = (quotesByStatus[q.status] ?? 0) + 1;
      }

      const jobsByStatus: Record<string, number> = {};
      for (const j of jobs ?? []) {
        jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
      }

      const now = new Date();
      let totalOutstanding = 0;
      let overdueCount = 0;
      for (const inv of invoices ?? []) {
        if (inv.status === "sent" || inv.status === "overdue") {
          totalOutstanding += Number(inv.total) || 0;
          if (inv.due_date && new Date(inv.due_date) < now) {
            overdueCount++;
          }
        }
      }

      const activeJobCount = (jobs ?? []).filter(
        (j) => !["delivered", "invoiced", "archived"].includes(j.status)
      ).length;

      const result = {
        company:
          "RS PCB Assembly (R.S. Électronique Inc.), Montreal, ~$2.5M/yr, 5-6 people",
        active_customers: customerCount ?? 0,
        open_quotes:
          (quotesByStatus["draft"] ?? 0) +
          (quotesByStatus["review"] ?? 0) +
          (quotesByStatus["sent"] ?? 0),
        quotes_by_status: quotesByStatus,
        active_jobs: activeJobCount,
        jobs_by_status: jobsByStatus,
        outstanding_invoices: totalOutstanding,
        overdue_invoices: overdueCount,
        recent_activity: (recentJobs ?? []).map((j: Record<string, unknown>) => {
          const customers = j.customers as
            | { company_name?: string }
            | { company_name?: string }[]
            | null;
          const name = Array.isArray(customers)
            ? customers[0]?.company_name
            : customers?.company_name;
          return {
            job_number: j.job_number,
            status: j.status,
            customer: name ?? "Unknown",
            updated_at: j.updated_at,
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
}
