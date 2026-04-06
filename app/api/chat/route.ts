import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyWithAI } from "@/lib/mcode/ai-classifier";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `You are the AI assistant for RS PCB Assembly (R.S. Électronique Inc.), a $2.5M/year contract electronics manufacturer in Montreal (5-6 people). You help the team manage the full PCBA lifecycle.

## YOUR ROLE
You are both a DATA ASSISTANT (query real data) and a WORKFLOW GUIDE (teach users how to use the system step by step). Always use tools to get real data — never guess numbers.

## COMPANY CONTEXT
- CEO: Anas Patel (full access)
- Operations Manager: Piyush Tayal (India, +9.5h offset — procurement, BOM, supplier POs)
- Shop Floor: Hammad Ahmed (Montreal — production events only)
- 11+ customers: Lanka/Knorr-Bremse (TLAN), GoLabo (LABO), VO2 Master (VO2), SBQuantum (SBQ), Canadian Space Agency (CSA), Cevians (CVNS), Norpix (NORPIX), Demers Ambulances (DAMB), Optikam (OPKM), Quaketek (QTKT), Nuvotronik (NUVO)
- Taxes: GST/TPS 5%, QST/TVQ 9.975%
- Suppliers: DigiKey, Mouser, LCSC (components); WMD Circuits, Candor (PCB fab); Stentech (stencils)

## M-CODE SYSTEM
Classification pipeline: Database Lookup → 47 PAR Rules → API Lookup → Human Review
Types: CP (standard SMT ~59%), IP (large SMT ~15%), TH (through-hole ~12%), CPEXP (expanded SMT), 0402 (small), 0201 (ultra-tiny), MANSMT (manual SMT), MEC (mechanical), Accs (accessories), CABLE, DEV B (dev boards)

## COMPLETE WORKFLOW (guide users through these steps)

### 1. QUOTATION (BOM → Quote → PDF)
- Upload BOM at /bom/upload → select customer + GMP
- System parses BOM, assigns M-Codes automatically (60%+ auto)
- Review M-Code assignments at /bom/[id] → manually fix unclassified ones
- Create quote at /quotes/new → select parsed BOM, enter 4 quantity tiers
- Pricing engine calculates: components + PCB + assembly + NRE per tier
- Review and approve quote → generate PDF → send to customer

### 2. ORDER ENTRY (Quote Accepted → Job)
- Accept quote → creates job automatically with job number (JB-YYMM-CUST-NNN)
- Upload customer PO on job detail page
- Verify PO price matches quote price (PO Pricing Validation section)
- System generates Proc Batch Code: YYMMDD CUST-XYNNN (e.g., 250413 TLAN-BT029)

### 3. PROCUREMENT (Job → PROC → Supplier POs)
- Create procurement from job detail page
- System auto-populates component lines from BOM + overage per M-Code
- Group lines by best supplier (DigiKey/Mouser/LCSC)
- Generate supplier POs with PDFs
- Track receiving (mark lines as received)

### 4. PRODUCTION (Materials → Assembly → Ship)
- Generate production documents from job detail: Job Card, Production Traveller, Print BOM, Reception File
- Log production events at /production/log: setup, SMT, reflow, AOI, through-hole, touchup, washing, packing
- Generate serial numbers for each board

### 5. SHIPPING & INVOICING
- Generate shipping docs: Packing Slip + RoHS/IPC Compliance Certificates
- Record tracking info (courier, tracking number, ship date)
- Generate invoice (supports multi-PO consolidation — one invoice for multiple jobs from same customer)
- Track payment and aging

### 6. QUALITY CONTROL
- Report NCR from job detail page → select category/subcategory/severity
- Track through: Open → Investigating → Corrective Action → Closed
- Complete CAAF form (root cause, corrective action, preventive action)

### 7. INVENTORY
- BG (Background) feeder stock at /inventory — common passives on SMT feeders
- Track additions/subtractions with full log history
- Low stock and out-of-stock alerts

## HOW TO RESPOND
- If user asks "how do I..." → guide them step by step with page links (/quotes, /jobs, etc.)
- If user asks about data → use tools to query, present in tables
- If user seems lost → offer the workflow overview and ask what they're trying to do
- Always mention the specific page URL they should navigate to
- Be concise but thorough when guiding workflows`;

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
      listNCRs: {
        description: "List NCR (Non-Conformance) reports, optionally filtered by status or customer",
        inputSchema: z.object({
          status: z.string().optional().describe("Status: open, investigating, corrective_action, closed"),
          customer_code: z.string().optional().describe("Customer code filter"),
        }),
        execute: async ({ status, customer_code }: { status?: string; customer_code?: string }) => {
          let query = supabase.from("ncr_reports").select("ncr_number, category, subcategory, severity, status, description, created_at, customers(code, company_name), jobs(job_number)").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          if (customer_code) {
            const { data: cust } = await supabase.from("customers").select("id").eq("code", customer_code.toUpperCase()).single();
            if (cust) query = query.eq("customer_id", cust.id);
          }
          const { data } = await query;
          return { ncr_reports: data ?? [] };
        },
      },
      getBGStock: {
        description: "Get BG (background) feeder stock levels. Shows low stock and out of stock alerts.",
        inputSchema: z.object({
          low_stock_only: z.boolean().optional().describe("Only show low/out of stock items"),
        }),
        execute: async ({ low_stock_only }: { low_stock_only?: boolean }) => {
          const { data } = await supabase.from("bg_stock").select("mpn, description, m_code, current_qty, min_qty, feeder_slot").order("mpn");
          const items = data ?? [];
          const filtered = low_stock_only ? items.filter((i: { current_qty: number; min_qty: number }) => i.current_qty <= i.min_qty) : items;
          const summary = {
            total: items.length,
            low_stock: items.filter((i: { current_qty: number; min_qty: number }) => i.current_qty > 0 && i.current_qty <= i.min_qty).length,
            out_of_stock: items.filter((i: { current_qty: number }) => i.current_qty <= 0).length,
          };
          return { summary, items: filtered };
        },
      },
      getJobSerials: {
        description: "Get serial numbers for a specific job",
        inputSchema: z.object({ job_number: z.string().describe("Job number like JB-2604-TLAN-001") }),
        execute: async ({ job_number }: { job_number: string }) => {
          const { data: job } = await supabase.from("jobs").select("id").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };
          const { data } = await supabase.from("serial_numbers").select("serial_number, board_number, status, notes").eq("job_id", job.id).order("board_number");
          return { job_number, serial_numbers: data ?? [] };
        },
      },
      getWorkflowGuide: {
        description: "Get step-by-step workflow guidance for a specific process. Use this when the user asks 'how do I...' questions.",
        inputSchema: z.object({
          process: z.enum(["quote", "order", "procurement", "production", "shipping", "invoice", "ncr", "inventory", "overview"]).describe("Which workflow to explain"),
        }),
        execute: async ({ process }: { process: string }) => {
          const guides: Record<string, { title: string; steps: string[]; page: string }> = {
            overview: {
              title: "Complete Workflow Overview",
              steps: [
                "1. Upload BOM → /bom/upload (select customer, GMP, upload Excel/CSV)",
                "2. Review M-Codes → /bom/[id] (fix unclassified components)",
                "3. Create Quote → /quotes/new (select BOM, enter 4 qty tiers, pricing auto-calculates)",
                "4. Accept Quote → creates Job automatically",
                "5. Create Procurement → from job detail page, generates PROC with component lines + overage",
                "6. Production → /production/log (log events: SMT, reflow, AOI, etc.)",
                "7. Ship → generate packing slip + compliance certs from job detail",
                "8. Invoice → /invoices (supports multi-PO consolidation)",
                "9. Payment → mark paid on invoice detail page",
              ],
              page: "/",
            },
            quote: {
              title: "How to Create a Quote",
              steps: [
                "1. Go to /bom/upload and upload the customer's BOM file (Excel or CSV)",
                "2. Select the customer and enter the GMP (board) name",
                "3. System auto-parses the BOM and classifies components with M-Codes",
                "4. Review at /bom/[id] — fix any unclassified components (highlighted in yellow)",
                "5. Go to /quotes/new — select the parsed BOM",
                "6. Enter 4 quantity tiers (e.g., 50, 100, 250, 500)",
                "7. Set markup rates, NRE, PCB cost — pricing calculates automatically",
                "8. Review the pricing table showing per-tier breakdown",
                "9. Save as draft → review → approve → generates PDF",
                "10. Download PDF and email to customer",
              ],
              page: "/quotes/new",
            },
            order: {
              title: "How to Enter an Order (Quote → Job)",
              steps: [
                "1. Go to the accepted quote at /quotes/[id]",
                "2. Click 'Create Job' — auto-generates job number",
                "3. On job detail page, upload the customer's PO document",
                "4. Check PO Pricing Validation section — verify PO price matches quote",
                "5. System generates Proc Batch Code (YYMMDD CUST-XYNNN)",
                "6. Job is now in 'created' status, ready for procurement",
              ],
              page: "/jobs",
            },
            procurement: {
              title: "How to Handle Procurement",
              steps: [
                "1. On job detail page, click 'Create Procurement'",
                "2. System auto-populates component lines from BOM + overage per M-Code",
                "3. Review at /procurement/[id] — check quantities, prices, suppliers",
                "4. Generate Supplier POs (grouped by DigiKey, Mouser, LCSC)",
                "5. Download PO PDFs and send to suppliers",
                "6. As materials arrive, click 'Receive' on each line",
                "7. When all received, move job to 'production' status",
              ],
              page: "/procurement",
            },
            production: {
              title: "How to Track Production",
              steps: [
                "1. Generate production docs from job detail: Job Card, Traveller, Print BOM, Reception File",
                "2. Go to /production/log to log events",
                "3. Select the job, then click event buttons in order:",
                "   Materials Received → Setup → SMT Top → SMT Bottom → Reflow → AOI → Through-Hole → Touchup → Washing → Packing → Ready to Ship",
                "4. Generate serial numbers from job detail page (auto-creates per-board serials)",
                "5. CEO sees real-time production status on /production dashboard",
              ],
              page: "/production",
            },
            shipping: {
              title: "How to Ship an Order",
              steps: [
                "1. On job detail page, scroll to Shipping section",
                "2. Enter ship date, courier name, and tracking number",
                "3. Click 'Generate Packing Slip' — creates PDF with shipment details",
                "4. Click 'Generate Compliance Certificates' — creates RoHS + IPC cert PDF",
                "5. Print packing slip and certs, include with shipment",
                "6. Update job status to 'shipping' or 'delivered'",
              ],
              page: "/jobs",
            },
            invoice: {
              title: "How to Create an Invoice",
              steps: [
                "1. Go to /invoices and click 'Create Invoice'",
                "2. Select the customer from dropdown",
                "3. System shows all shipped/delivered jobs not yet invoiced",
                "4. Check one or multiple jobs (multi-PO consolidation supported!)",
                "5. Review totals — GST 5% + QST 9.975% auto-calculated",
                "6. Optionally add freight or discount",
                "7. Click 'Create Invoice' — generates invoice with PDF",
                "8. Email PDF to customer, track payment on invoice detail page",
              ],
              page: "/invoices",
            },
            ncr: {
              title: "How to Report a Quality Issue (NCR)",
              steps: [
                "1. Go to the affected job's detail page",
                "2. Click 'Report NCR' button in the header",
                "3. Select category (Soldering Defect, Component, PCB, Assembly, Cosmetic, Other)",
                "4. Select subcategory and severity (minor/major/critical)",
                "5. Enter detailed description of the issue",
                "6. NCR is created with auto-generated number (NCR-YYMM-NNN)",
                "7. Track at /quality — move through: Open → Investigating → Corrective Action → Closed",
                "8. Fill in root cause, corrective action, and preventive action (CAAF form)",
              ],
              page: "/quality",
            },
            inventory: {
              title: "How to Manage BG Feeder Stock",
              steps: [
                "1. Go to /inventory to see all BG (background) feeder parts",
                "2. Dashboard shows: total items, healthy, low stock, out of stock",
                "3. Color-coded rows: green=OK, yellow=low, red=out of stock",
                "4. Stock is auto-subtracted when PROC files are generated",
                "5. Stock is auto-added when 'Add Stock to BG' is done in procurement",
                "6. Periodically do physical inventory count to reconcile",
              ],
              page: "/inventory",
            },
          };
          return guides[process] ?? guides["overview"];
        },
      },
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
