import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";
import { todayMontreal } from "@/lib/utils/format";

export function registerInvoiceTools(server: McpServer) {
  server.tool(
    "rs_list_invoices",
    "List invoices with optional filters. Shows invoice number, customer, total, status, due date, and days outstanding.",
    {
      status: z
        .string()
        .optional()
        .describe("Filter: draft, sent, paid, overdue, cancelled"),
      customer_code: z
        .string()
        .optional()
        .describe("Filter by customer code"),
      overdue_only: z
        .boolean()
        .default(false)
        .describe("Show only overdue invoices"),
      limit: z.number().default(25).describe("Max results"),
    },
    async ({ status, customer_code, overdue_only, limit }) => {
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, subtotal, total, tps_gst, tvq_qst, freight, issued_date, due_date, paid_date, customer_id, customers(code, company_name), jobs(job_number)"
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

      if (overdue_only) {
        const today = todayMontreal();
        query = query.lt("due_date", today).in("status", ["sent"]);
      }

      const { data, error } = await query;
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const now = new Date();
      const result = (data ?? []).map((inv: Record<string, unknown>) => {
        const dueDate = inv.due_date
          ? new Date(inv.due_date as string)
          : null;
        const daysOutstanding =
          dueDate && !inv.paid_date
            ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;
        const customers = inv.customers as
          | { code?: string; company_name?: string }
          | { code?: string; company_name?: string }[]
          | null;
        const c = Array.isArray(customers) ? customers[0] : customers;
        const jobs = inv.jobs as
          | { job_number?: string }
          | { job_number?: string }[]
          | null;
        const j = Array.isArray(jobs) ? jobs[0] : jobs;
        return {
          invoice_number: inv.invoice_number,
          customer: c?.code,
          customer_name: c?.company_name,
          job_number: j?.job_number,
          total: inv.total,
          status: inv.status,
          issued_date: inv.issued_date,
          due_date: inv.due_date,
          paid_date: inv.paid_date,
          days_outstanding: daysOutstanding,
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
    "rs_get_aging_report",
    "Accounts receivable aging summary: total outstanding, current, 30-day, 60-day, 90-day buckets, broken down by customer.",
    {},
    async () => {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(
          "invoice_number, total, due_date, status, customer_id, customers(code, company_name)"
        )
        .in("status", ["sent", "overdue"]);

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const now = new Date();
      let totalOutstanding = 0;
      let current = 0;
      let over30 = 0;
      let over60 = 0;
      let over90 = 0;
      const byCustomer: Record<
        string,
        { code: string; name: string; total: number; invoices: number }
      > = {};

      for (const inv of invoices ?? []) {
        const amount = Number(inv.total) || 0;
        totalOutstanding += amount;

        const dueDate = inv.due_date ? new Date(inv.due_date) : now;
        const daysOverdue = Math.floor(
          (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysOverdue <= 0) current += amount;
        else if (daysOverdue <= 30) over30 += amount;
        else if (daysOverdue <= 60) over60 += amount;
        else over90 += amount;

        const customers = (inv as Record<string, unknown>).customers as
          | { code?: string; company_name?: string }
          | { code?: string; company_name?: string }[]
          | null;
        const cust = Array.isArray(customers) ? customers[0] : customers;
        const custCode = cust?.code ?? "UNKNOWN";
        if (!byCustomer[custCode]) {
          byCustomer[custCode] = {
            code: custCode,
            name: cust?.company_name ?? "Unknown",
            total: 0,
            invoices: 0,
          };
        }
        byCustomer[custCode].total += amount;
        byCustomer[custCode].invoices += 1;
      }

      const result = {
        total_outstanding: Math.round(totalOutstanding * 100) / 100,
        current: Math.round(current * 100) / 100,
        over_30: Math.round(over30 * 100) / 100,
        over_60: Math.round(over60 * 100) / 100,
        over_90: Math.round(over90 * 100) / 100,
        by_customer: Object.values(byCustomer).sort(
          (a, b) => b.total - a.total
        ),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_get_profitability",
    "Compare quoted vs actual cost for completed/invoiced jobs. Shows margin per job and overall summary.",
    {
      job_id: z.string().uuid().optional().describe("Specific job UUID"),
      customer_code: z
        .string()
        .optional()
        .describe("Filter by customer"),
      date_from: z
        .string()
        .optional()
        .describe("ISO date, e.g. '2026-01-01'"),
    },
    async ({ job_id, customer_code, date_from }) => {
      let query = supabase
        .from("jobs")
        .select(
          "id, job_number, quantity, status, customers(code, company_name), quotes!jobs_quote_id_fkey(pricing, quantities)"
        )
        .in("status", ["delivered", "invoiced", "archived"]);

      if (job_id) query = query.eq("id", job_id);
      if (date_from) query = query.gte("created_at", date_from);

      if (customer_code) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id")
          .eq("code", customer_code.toUpperCase())
          .single();
        if (cust) query = query.eq("customer_id", cust.id);
      }

      const { data: jobs, error } = await query.limit(50);
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const results = [];
      let totalQuoted = 0;
      let totalActual = 0;

      for (const job of jobs ?? []) {
        const { data: proc } = await supabase
          .from("procurements")
          .select("id")
          .eq("job_id", job.id)
          .limit(1)
          .maybeSingle();

        const { data: procLines } = proc
          ? await supabase
              .from("procurement_lines")
              .select("extended_price")
              .eq("procurement_id", proc.id)
          : { data: [] };

        const actualCost = (procLines ?? []).reduce(
          (sum, l) => sum + (Number(l.extended_price) || 0),
          0
        );

        const quotes = (job as Record<string, unknown>).quotes as
          | { pricing?: { total?: number } }
          | { pricing?: { total?: number } }[]
          | null;
        const quote = Array.isArray(quotes) ? quotes[0] : quotes;
        const pricing = quote?.pricing ?? {};
        const quotedTotal = Number(pricing.total) || 0;

        const marginPct =
          quotedTotal > 0 ? ((quotedTotal - actualCost) / quotedTotal) * 100 : 0;

        totalQuoted += quotedTotal;
        totalActual += actualCost;

        const customers = (job as Record<string, unknown>).customers as
          | { code?: string }
          | { code?: string }[]
          | null;
        const c = Array.isArray(customers) ? customers[0] : customers;

        results.push({
          job_number: job.job_number,
          customer: c?.code,
          quantity: job.quantity,
          quoted_total: Math.round(quotedTotal * 100) / 100,
          actual_cost: Math.round(actualCost * 100) / 100,
          margin: Math.round((quotedTotal - actualCost) * 100) / 100,
          margin_pct: Math.round(marginPct * 10) / 10,
        });
      }

      const overallMargin =
        totalQuoted > 0 ? ((totalQuoted - totalActual) / totalQuoted) * 100 : 0;

      const result = {
        jobs: results,
        summary: {
          total_jobs: results.length,
          total_quoted: Math.round(totalQuoted * 100) / 100,
          total_actual: Math.round(totalActual * 100) / 100,
          total_margin: Math.round((totalQuoted - totalActual) * 100) / 100,
          overall_margin_pct: Math.round(overallMargin * 10) / 10,
        },
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );
}
