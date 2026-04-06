import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyWithAI } from "@/lib/mcode/ai-classifier";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defineTool(def: { description: string; parameters?: unknown; execute: (...args: any[]) => Promise<unknown> }) {
  return def as any;
}

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createAdminClient();

  // Convert UI messages (parts-based) to model messages (content-based)
  // UI format: { role, parts: [{ type: "text", text: "..." }] }
  // Model format: { role, content: "..." }
  const messages = (body.messages ?? []).map((m: { role: string; parts?: { type: string; text: string }[]; content?: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.parts
      ? m.parts.filter((p: { type: string }) => p.type === "text").map((p: { text: string }) => p.text).join("\n")
      : (m.content ?? ""),
  }));

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are the AI assistant for RS PCB Assembly (R.S. Électronique Inc.), a contract electronics manufacturer in Montreal, Canada. You help the CEO (Anas Patel) and operations team manage quotes, jobs, BOMs, procurement, and invoices.

You have tools to query the database directly. Use them to answer questions about customers, quotes, jobs, invoices, components, and BOMs. Always query real data — never guess.

Company context:
- $2.5M/year revenue, 5-6 employees, 11+ active customers
- Assembles PCBs for customers like Lanka/Knorr-Bremse, GoLabo, VO2 Master, SBQuantum, Canadian Space Agency
- Uses M-Code classification system: CP (chip package), IP (IC package), TH (through-hole), CPEXP (expanded), 0402, 0201, MANSMT, MEC, Accs, CABLE, DEV B
- Taxes: TPS/GST 5%, TVQ/QST 9.975%
- Quote format: QT-YYMM-NNN, Job format: JB-YYMM-CODE-NNN, Invoice format: INV-YYMM-NNN

Be concise and direct. Format currency as CAD. Use tables for data when appropriate.`,
    messages,
    tools: {
      listCustomers: defineTool({
        description: "List all active customers with their codes and contact info",
        parameters: z.object({ filter: z.string().optional().describe("Optional filter keyword") }),
        execute: async (_args) => {
          const { data } = await supabase
            .from("customers")
            .select("code, company_name, contact_name, contact_email, payment_terms, is_active")
            .order("code");
          return { customers: data ?? [] };
        },
      }),
      getCustomer: defineTool({
        description: "Get detailed info about a specific customer by code (e.g. TLAN, LABO, CSA)",
        parameters: z.object({ code: z.string().describe("Customer code like TLAN, LABO, CSA") }),
        execute: async ({ code }) => {
          const { data: customer } = await supabase
            .from("customers")
            .select("*")
            .eq("code", code.toUpperCase())
            .single();
          if (!customer) return { error: "Customer not found" };

          const [quotes, jobs, invoices] = await Promise.all([
            supabase.from("quotes").select("id, quote_number, status, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
            supabase.from("jobs").select("id, job_number, status, quantity, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
            supabase.from("invoices").select("id, invoice_number, status, total, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
          ]);
          return { customer, recent_quotes: quotes.data ?? [], recent_jobs: jobs.data ?? [], recent_invoices: invoices.data ?? [] };
        },
      }),
      businessOverview: defineTool({
        description: "Get a high-level snapshot of the business: active customers, open quotes, active jobs, outstanding invoices",
        parameters: z.object({ detail: z.string().optional().describe("Level of detail") }),
        execute: async (_args) => {
          const [customers, quotes, jobs, invoices] = await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
            supabase.from("quotes").select("id, quote_number, status, created_at").in("status", ["draft", "review", "sent"]).order("created_at", { ascending: false }),
            supabase.from("jobs").select("id, job_number, status, quantity, created_at").not("status", "in", '("delivered","invoiced","archived")').order("created_at", { ascending: false }),
            supabase.from("invoices").select("id, invoice_number, status, total, issued_date, due_date").in("status", ["sent", "overdue"]),
          ]);
          const outstanding = (invoices.data ?? []).reduce((sum: number, inv: Record<string, unknown>) => sum + (Number(inv.total) || 0), 0);
          return {
            active_customers: customers.count ?? 0,
            open_quotes: (quotes.data ?? []).length,
            active_jobs: (jobs.data ?? []).length,
            outstanding_invoices: `$${outstanding.toFixed(2)} CAD`,
            quotes: quotes.data ?? [],
            jobs: jobs.data ?? [],
            unpaid_invoices: invoices.data ?? [],
          };
        },
      }),
      listQuotes: defineTool({
        description: "List quotes with optional status filter",
        parameters: z.object({ status: z.string().optional().describe("Filter by status: draft, review, sent, accepted, rejected, expired") }),
        execute: async ({ status }) => {
          let query = supabase.from("quotes").select("quote_number, status, created_at, customers(code, company_name), gmps(gmp_number)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { quotes: data ?? [] };
        },
      }),
      listJobs: defineTool({
        description: "List jobs with optional status filter",
        parameters: z.object({ status: z.string().optional().describe("Filter by status: created, procurement, production, shipping, delivered, invoiced") }),
        execute: async ({ status }) => {
          let query = supabase.from("jobs").select("job_number, status, quantity, assembly_type, created_at, customers(code, company_name), gmps(gmp_number)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { jobs: data ?? [] };
        },
      }),
      listInvoices: defineTool({
        description: "List invoices with aging info",
        parameters: z.object({ status: z.string().optional().describe("Filter: draft, sent, paid, overdue") }),
        execute: async ({ status }) => {
          let query = supabase.from("invoices").select("invoice_number, status, total, issued_date, due_date, paid_date, customers(code, company_name)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          const { data } = await query;
          return { invoices: data ?? [] };
        },
      }),
      searchComponents: defineTool({
        description: "Search the component library by MPN or description",
        parameters: z.object({ query: z.string().describe("MPN or description to search for") }),
        execute: async ({ query }) => {
          const { data } = await supabase
            .from("components")
            .select("mpn, manufacturer, description, m_code, m_code_source, package_case")
            .or(`mpn.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);
          return { components: data ?? [] };
        },
      }),
      classifyComponent: defineTool({
        description: "Classify a component into an M-Code using the 3-layer pipeline (DB, Rules, AI)",
        parameters: z.object({
          mpn: z.string().describe("Manufacturer Part Number"),
          description: z.string().describe("Component description"),
          manufacturer: z.string().optional().describe("Manufacturer name"),
        }),
        execute: async ({ mpn, description, manufacturer }) => {
          const result = await classifyWithAI(mpn, description, manufacturer ?? "");
          if (result) return result;
          return { m_code: null, confidence: 0, reasoning: "Could not classify" };
        },
      }),
      searchAll: defineTool({
        description: "Search across customers, quotes, jobs, invoices, and components",
        parameters: z.object({ query: z.string().describe("Search term") }),
        execute: async ({ query }) => {
          const [customers, quotes, jobs, invoices] = await Promise.all([
            supabase.from("customers").select("id, code, company_name").or(`code.ilike.%${query}%,company_name.ilike.%${query}%`).limit(5),
            supabase.from("quotes").select("id, quote_number, status").ilike("quote_number", `%${query}%`).limit(5),
            supabase.from("jobs").select("id, job_number, status").ilike("job_number", `%${query}%`).limit(5),
            supabase.from("invoices").select("id, invoice_number, status, total").ilike("invoice_number", `%${query}%`).limit(5),
          ]);
          return {
            customers: customers.data ?? [],
            quotes: quotes.data ?? [],
            jobs: jobs.data ?? [],
            invoices: invoices.data ?? [],
          };
        },
      }),
      getBomSummary: defineTool({
        description: "Get summary of a parsed BOM including component count and M-Code breakdown",
        parameters: z.object({ bom_id: z.string().describe("BOM ID") }),
        execute: async ({ bom_id }) => {
          const [bom, lines] = await Promise.all([
            supabase.from("boms").select("*, customers(code, company_name), gmps(gmp_number)").eq("id", bom_id).single(),
            supabase.from("bom_lines").select("m_code, m_code_source, is_pcb").eq("bom_id", bom_id),
          ]);
          const bomLines = lines.data ?? [];
          const mcodeBreakdown: Record<string, number> = {};
          let classified = 0;
          let unclassified = 0;
          for (const line of bomLines) {
            if (line.is_pcb) continue;
            if (line.m_code) {
              classified++;
              mcodeBreakdown[line.m_code] = (mcodeBreakdown[line.m_code] ?? 0) + 1;
            } else {
              unclassified++;
            }
          }
          return { bom: bom.data, total_lines: bomLines.length, classified, unclassified, mcode_breakdown: mcodeBreakdown };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
