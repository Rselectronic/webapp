import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyWithAI } from "@/lib/mcode/ai-classifier";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `You are the AI assistant for RS PCB Assembly (R.S. Électronique Inc.), a contract electronics manufacturer in Montreal. You help the CEO (Anas Patel) manage quotes, jobs, BOMs, procurement, and invoices.

Use tools to query the database. Always use real data — never guess.

Context: $2.5M/year, 11+ customers (Lanka/Knorr-Bremse, GoLabo, VO2 Master, SBQuantum, Canadian Space Agency). M-Codes: CP, IP, TH, CPEXP, 0402, 0201, MANSMT, MEC, Accs, CABLE, DEV B. Taxes: GST 5%, QST 9.975%.

Be concise. Use tables when appropriate.`;

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createAdminClient();

  // Convert UIMessages (parts-based) to simple role+content
  const messages = (body.messages ?? []).map(
    (m: { role: string; parts?: Array<{ type: string; text: string }>; content?: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.parts
        ? m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")
        : (m.content ?? ""),
    })
  );

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      listCustomers: {
        description: "List all active customers",
        inputSchema: z.object({ search: z.string().optional().describe("Optional search filter") }),
        execute: async () => {
          const { data } = await supabase
            .from("customers")
            .select("code, company_name, contact_name, contact_email, payment_terms")
            .eq("is_active", true)
            .order("code");
          return { customers: data ?? [] };
        },
      },
      getCustomer: {
        description: "Get detailed customer info by code (TLAN, LABO, CSA, etc)",
        inputSchema: z.object({ code: z.string().describe("Customer code") }),
        execute: async ({ code }: { code: string }) => {
          const { data: customer } = await supabase
            .from("customers").select("*").eq("code", code.toUpperCase()).single();
          if (!customer) return { error: "Not found" };
          const [q, j, i] = await Promise.all([
            supabase.from("quotes").select("quote_number, status, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
            supabase.from("jobs").select("job_number, status, quantity, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
            supabase.from("invoices").select("invoice_number, status, total, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
          ]);
          return { customer, quotes: q.data ?? [], jobs: j.data ?? [], invoices: i.data ?? [] };
        },
      },
      businessOverview: {
        description: "Get business snapshot: customers, quotes, jobs, invoices",
        inputSchema: z.object({ detail: z.string().optional().describe("Detail level") }),
        execute: async () => {
          const [c, q, j, inv] = await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
            supabase.from("quotes").select("quote_number, status").in("status", ["draft", "review", "sent"]),
            supabase.from("jobs").select("job_number, status, quantity").not("status", "in", '("delivered","invoiced","archived")'),
            supabase.from("invoices").select("invoice_number, status, total").in("status", ["sent", "overdue"]),
          ]);
          const outstanding = (inv.data ?? []).reduce((s, i) => s + (Number(i.total) || 0), 0);
          return { active_customers: c.count ?? 0, open_quotes: q.data?.length ?? 0, active_jobs: j.data?.length ?? 0, outstanding: `$${outstanding.toFixed(2)}`, quotes: q.data, jobs: j.data, invoices: inv.data };
        },
      },
      listQuotes: {
        description: "List quotes, optionally filtered by status",
        inputSchema: z.object({ status: z.string().optional().describe("Status filter") }),
        execute: async ({ status }: { status?: string }) => {
          let query = supabase.from("quotes").select("quote_number, status, created_at, customers(code, company_name)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { quotes: data ?? [] };
        },
      },
      listJobs: {
        description: "List jobs, optionally filtered by status",
        inputSchema: z.object({ status: z.string().optional().describe("Status filter") }),
        execute: async ({ status }: { status?: string }) => {
          let query = supabase.from("jobs").select("job_number, status, quantity, created_at, customers(code)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { jobs: data ?? [] };
        },
      },
      listInvoices: {
        description: "List invoices with aging",
        inputSchema: z.object({ status: z.string().optional().describe("Status filter") }),
        execute: async ({ status }: { status?: string }) => {
          let query = supabase.from("invoices").select("invoice_number, status, total, issued_date, due_date, customers(code)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { invoices: data ?? [] };
        },
      },
      classifyComponent: {
        description: "Classify a component M-Code using AI (DB → Rules → Claude)",
        inputSchema: z.object({
          mpn: z.string().describe("Manufacturer Part Number"),
          description: z.string().describe("Component description"),
          manufacturer: z.string().describe("Manufacturer name"),
        }),
        execute: async ({ mpn, description, manufacturer }: { mpn: string; description: string; manufacturer: string }) => {
          const result = await classifyWithAI(mpn, description, manufacturer);
          return result ?? { m_code: null, confidence: 0, reasoning: "Could not classify" };
        },
      },
      searchAll: {
        description: "Search across customers, quotes, jobs, invoices",
        inputSchema: z.object({ query: z.string().describe("Search term") }),
        execute: async ({ query }: { query: string }) => {
          const [c, q, j, i] = await Promise.all([
            supabase.from("customers").select("code, company_name").or(`code.ilike.%${query}%,company_name.ilike.%${query}%`).limit(5),
            supabase.from("quotes").select("quote_number, status").ilike("quote_number", `%${query}%`).limit(5),
            supabase.from("jobs").select("job_number, status").ilike("job_number", `%${query}%`).limit(5),
            supabase.from("invoices").select("invoice_number, status, total").ilike("invoice_number", `%${query}%`).limit(5),
          ]);
          return { customers: c.data, quotes: q.data, jobs: j.data, invoices: i.data };
        },
      },
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
