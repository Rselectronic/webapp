import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { classifyWithAI } from "@/lib/mcode/ai-classifier";
import { detectPageContext, fetchPageContextSummary } from "@/lib/chat/page-context";
import { recordAiCall } from "@/lib/ai/telemetry";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const CHAT_MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are the AI assistant for RS PCB Assembly (R.S. Électronique Inc.), a $2.5M/year contract electronics manufacturer in Montreal (5-6 people). You help the team manage the full PCBA lifecycle.

## YOUR ROLE
You are both a DATA ASSISTANT and an ACTION AGENT. You can:
1. QUERY real data (customers, jobs, BOMs, quotes, invoices, NCRs, inventory, production schedule, labour costs, aging reports)
2. TAKE ACTIONS — create quotes, create jobs from quotes, schedule production, create invoices, mark invoices paid, create procurement, order/receive procurement lines, generate serial numbers, log production events, create NCRs, update customers, generate any PDF document
3. GUIDE users step-by-step through workflows

When the user says "create a quote" or "make an invoice" or "schedule this job" — DO IT directly with your action tools. Don't just explain how — actually do it.

Always use tools — never guess. When the user asks you to DO something, use the action tools directly. When they ask about data, query it. Provide clickable page links like /jobs/[id] so they can navigate.

IMPORTANT: When you have a job number or BOM, use getJobDetail or getBomLines to get the FULL data before answering. Don't tell the user to "go look" — YOU look it up and show them.

## COMPANY CONTEXT
- CEO: Anas Patel (full access)
- Operations Manager: Piyush Tayal (India, +9.5h offset — procurement, BOM, supplier POs)
- Shop Floor: Hammad Ahmed (Montreal — production events only)
- 11+ customers: Lanka/Knorr-Bremse (TLAN), GoLabo (LABO), VO2 Master (VO2), SBQuantum (SBQ), Canadian Space Agency (CSA), Cevians (CVNS), Norpix (NORPIX), Demers Ambulances (DAMB), Optikam (OPKM), Quaketek (QTKT), Nuvotronik (NUVO)
- Taxes: GST/TPS 5%, QST/TVQ 9.975%
- Suppliers: DigiKey, Mouser, LCSC (components); WMD Circuits, Candor (PCB fab); Stentech (stencils)

## M-CODE SYSTEM
Classification pipeline: Database Lookup (4,026 MPNs) → 230 Keyword Lookup → 47 PAR Rules → Claude AI → Human Review
The system has 4,026 pre-classified components from the master database. When a BOM is uploaded, most components are instantly classified.
Types: CP (standard SMT ~59%), IP (large SMT ~15%), TH (through-hole ~12%), CPEXP (expanded SMT), 0402 (small), 0201 (ultra-tiny), MANSMT (manual SMT), MEC (mechanical), Accs (accessories), CABLE, DEV B (dev boards)
Additional RS-specific codes: APCB (assembly PCB), EA (each/assembly), AEA, PCB, FUSE, LABEL, WIRE, PRESSFIT

## COMPONENT DATABASE
4,026 components in Settings → Component Database. When a user manually overrides an M-code, it saves to this database for future auto-classification (learning loop).
Pricing: DigiKey + Mouser + LCSC APIs queried in parallel. If MPN search fails, falls back to searching by description keywords. Results cached 7 days.

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
- BG parts are auto-deducted when procurement is created

### 8. PRICING
- Real-time pricing from DigiKey, Mouser, and LCSC (all 3 queried in parallel)
- 7-day cache with auto-refresh
- Best price selection across all suppliers
- You can look up any MPN price with the getPricing tool

### 9. PROFITABILITY
- Compare quoted price vs actual procurement cost per job
- Margin and margin % calculation
- Reports page shows profitability table at /reports

## HOW TO RESPOND
- If user asks "how do I..." → guide them step by step with page links (/quotes, /jobs, etc.)
- If user asks about data → use tools to query, present in tables
- If user seems lost → offer the workflow overview and ask what they're trying to do
- Always mention the specific page URL they should navigate to
- Be concise but thorough when guiding workflows

## PAGE-AWARE TAKE-OVER MODE
You are given CURRENT PAGE CONTEXT in every request. This tells you exactly which entity the user is looking at (quote, job, BOM, procurement, invoice, etc.) and its current state.

Rules:
1. ALWAYS read the CURRENT PAGE CONTEXT block before answering. Assume the user is asking about THAT entity unless they explicitly mention another.
2. When the user's message is short, vague, or anxious ("help", "what now?", "I'm stuck", "what should I do", "this isn't working") — TAKE OVER. Do not ask clarifying questions first. Instead:
   a. State what you see on the current page.
   b. Diagnose what's likely the issue (missing pricing? unclassified components? no PO? etc.).
   c. Offer 2-3 concrete next actions with the action tools that would complete them.
3. If the user says "do it" or "go ahead" or "fix it" — USE YOUR WRITE TOOLS immediately. You have 39 tools including createQuote, updateQuoteStatus, createJobFromQuote, createProcurementFromJob, updateProcurementLine, createInvoiceFromJob, markInvoicePaid, logProductionEvent, etc. Don't just describe the action — execute it.
4. Proactively surface relevant info from the page context without waiting to be asked. Example: if the user is on a quote with status 'draft' and no pricing, open your reply with "I see this quote is still a draft with no pricing calculated — want me to run pricing now?"
5. Never say "go look at the page" — the user IS on the page. YOU look at the context and tell them what's there.`;

export async function POST(req: Request) {
  // --- AUTH + ROLE CHECK ---
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const { data: profile } = await userSupabase.from("users").select("role").eq("id", user.id).single();
  const userRole = profile?.role ?? "shop_floor";

  // Shop floor gets read-only access (no write tools)
  // Only CEO and operations_manager get full access
  const isPrivileged = userRole === "ceo" || userRole === "operations_manager";

  const body = await req.json();
  const supabase = createAdminClient();

  // Extract conversation_id, file context, and current page if provided
  const conversationId: string | null = body.conversationId ?? null;
  const fileContext: string | null = body.fileContext ?? null;
  const currentPage: string | null = body.currentPage ?? null;

  // Detect entity from pathname and fetch a concise summary to inject into the prompt
  const pageCtx = detectPageContext(currentPage);
  const pageContextSummary = pageCtx
    ? await fetchPageContextSummary(supabase, pageCtx)
    : null;

  // Media attachments (images/PDFs) attached to the most recent user message.
  // Shape: [{ kind: "image"|"pdf", media_type: string, data_base64: string, name?: string }]
  type PendingMedia = {
    kind: "image" | "pdf";
    media_type: string;
    data_base64: string;
    name?: string;
  };
  const pendingMedia: PendingMedia[] = Array.isArray(body.pendingMedia)
    ? (body.pendingMedia as PendingMedia[])
    : [];

  // Convert UIMessages (parts-based) to ModelMessages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = (body.messages ?? []).map(
    (m: { role: string; parts?: Array<{ type: string; text: string }>; content?: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.parts
        ? m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")
        : (m.content ?? ""),
    })
  );

  // Attach pending media to the LAST user message as multipart content so the
  // model can actually see images / read PDFs. Claude (via @ai-sdk/anthropic)
  // supports `image` and `file` content parts natively.
  if (pendingMedia.length > 0 && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const textContent =
          typeof messages[i].content === "string" ? (messages[i].content as string) : "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [];
        for (const m of pendingMedia) {
          try {
            const buf = Buffer.from(m.data_base64, "base64");
            if (m.kind === "image") {
              parts.push({ type: "image", image: buf, mediaType: m.media_type });
            } else if (m.kind === "pdf") {
              parts.push({
                type: "file",
                data: buf,
                mediaType: m.media_type || "application/pdf",
                filename: m.name,
              });
            }
          } catch (err) {
            console.warn("[chat] failed to decode pending media:", err);
          }
        }
        // End with the user's text so model sees media → then the question.
        parts.push({
          type: "text",
          text: textContent || "Please analyze the attached file(s).",
        });
        messages[i] = { role: "user", content: parts };
        break;
      }
    }
  }

  // Build the system prompt with optional file context + page context injections
  let systemPrompt = SYSTEM_PROMPT;
  if (pageContextSummary) {
    systemPrompt += `\n\n## CURRENT PAGE CONTEXT\nThe user is CURRENTLY looking at this page in the app. Use this as your primary context unless they explicitly ask about something else.\n\n${pageContextSummary}`;
  }
  if (fileContext) {
    systemPrompt += `\n\n## UPLOADED FILE CONTEXT\nThe user has uploaded a file in this conversation. Here is the parsed content:\n\n${fileContext}\n\nUse this data when answering questions about the file. If it looks like a BOM, help identify components and M-Codes.`;
  }

  const chatStartedAt = Date.now();
  const result = streamText({
    model: anthropic(CHAT_MODEL),
    system: systemPrompt,
    messages,
    onFinish: ({ usage }) => {
      void recordAiCall({
        purpose: "chat_assistant",
        model: CHAT_MODEL,
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - chatStartedAt,
        success: true,
        user_id: user.id,
        conversation_id: conversationId ?? null,
        metadata: {
          message_count: messages.length,
          has_page_context: Boolean(pageContextSummary),
          has_file_context: Boolean(fileContext),
        },
      });
    },
    onError: ({ error }) => {
      void recordAiCall({
        purpose: "chat_assistant",
        model: CHAT_MODEL,
        latency_ms: Date.now() - chatStartedAt,
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
        user_id: user.id,
        conversation_id: conversationId ?? null,
      });
    },
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
            supabase.from("customers").select("code, company_name").or(`code.ilike.%${query.replace(/[,.()"\\]/g, "")}%,company_name.ilike.%${query.replace(/[,.()"\\]/g, "")}%`).limit(5),
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

      // ==========================================
      // DEEP DATA ACCESS TOOLS
      // ==========================================

      getJobDetail: {
        description: "Get full job details including BOM components, procurement status, production events, and serial numbers",
        inputSchema: z.object({ job_number: z.string().describe("Job number like JB-2604-CVNS-001") }),
        execute: async ({ job_number }: { job_number: string }) => {
          const { data: job } = await supabase
            .from("jobs")
            .select("*, customers(code, company_name), gmps(gmp_number, board_name), quotes(quote_number, pricing), boms(id, file_name, component_count)")
            .eq("job_number", job_number)
            .single();
          if (!job) return { error: "Job not found" };

          // Get BOM lines
          const bomId = (job.boms as unknown as { id: string } | null)?.id;
          let bomLines: unknown[] = [];
          if (bomId) {
            const { data } = await supabase
              .from("bom_lines")
              .select("line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, m_code_confidence, m_code_source, is_pcb, is_dni")
              .eq("bom_id", bomId)
              .order("quantity", { ascending: false });
            bomLines = data ?? [];
          }

          // Get procurement status
          const { data: procs } = await supabase
            .from("procurements")
            .select("proc_code, status, total_lines, lines_ordered, lines_received")
            .eq("job_id", job.id);

          // Get production events
          const { data: events } = await supabase
            .from("production_events")
            .select("event_type, notes, created_at")
            .eq("job_id", job.id)
            .order("created_at", { ascending: true });

          // Get serial numbers
          const { data: serials } = await supabase
            .from("serial_numbers")
            .select("serial_number, status")
            .eq("job_id", job.id)
            .order("board_number");

          const unclassified = bomLines.filter((l: any) => !l.m_code && !l.is_pcb && !l.is_dni);

          return {
            job: { id: job.id, job_number: job.job_number, status: job.status, quantity: job.quantity, assembly_type: job.assembly_type, po_number: job.po_number },
            customer: job.customers,
            gmp: job.gmps,
            quote: job.quotes,
            bom: { component_count: bomLines.length, unclassified_count: unclassified.length, lines: bomLines.slice(0, 50) },
            procurement: procs ?? [],
            production_events: events ?? [],
            serial_numbers: { count: serials?.length ?? 0, generated: (serials?.length ?? 0) > 0 },
            links: {
              job_page: `/jobs/${job.id}`,
              bom_page: bomId ? `/bom/${bomId}` : null,
              quote_page: job.quote_id ? `/quotes/${job.quote_id}` : null,
            },
          };
        },
      },

      getBomLines: {
        description: "Get all BOM component lines for a specific BOM, with M-Code status. Use this to see what components need classification.",
        inputSchema: z.object({ bom_id: z.string().describe("BOM UUID") }),
        execute: async ({ bom_id }: { bom_id: string }) => {
          const { data: bom } = await supabase
            .from("boms")
            .select("id, file_name, status, component_count, customers(code), gmps(gmp_number)")
            .eq("id", bom_id)
            .single();
          if (!bom) return { error: "BOM not found" };

          const { data: lines } = await supabase
            .from("bom_lines")
            .select("id, line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, m_code_confidence, m_code_source, is_pcb, is_dni")
            .eq("bom_id", bom_id)
            .order("quantity", { ascending: false });

          const allLines = lines ?? [];
          const classified = allLines.filter((l: any) => l.m_code);
          const unclassified = allLines.filter((l: any) => !l.m_code && !l.is_pcb && !l.is_dni);

          return {
            bom,
            summary: { total: allLines.length, classified: classified.length, unclassified: unclassified.length },
            classified_lines: classified.slice(0, 30),
            unclassified_lines: unclassified.slice(0, 30),
            link: `/bom/${bom_id}`,
          };
        },
      },

      // ==========================================
      // ACTION TOOLS (write operations)
      // ==========================================

      updateJobStatus: {
        description: isPrivileged ? "Update a job's status. Valid transitions: created→procurement→parts_ordered→parts_received→production→inspection→shipping→delivered→invoiced" : "DISABLED: requires CEO or Operations Manager role",
        inputSchema: z.object({
          job_number: z.string().describe("Job number"),
          new_status: z.string().describe("New status value"),
          notes: z.string().optional().describe("Optional note about the status change"),
        }),
        execute: async ({ job_number, new_status, notes }: { job_number: string; new_status: string; notes?: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can update job status." };
          const { data: job } = await supabase.from("jobs").select("id, status").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };

          const { error } = await supabase.from("jobs").update({ status: new_status, updated_at: new Date().toISOString() }).eq("id", job.id);
          if (error) return { error: error.message };

          await supabase.from("job_status_log").insert({ job_id: job.id, old_status: job.status, new_status, notes: notes ?? `Status changed via AI assistant` });

          return { success: true, job_number, old_status: job.status, new_status, link: `/jobs/${job.id}` };
        },
      },

      classifyBomLine: {
        description: "Classify a single BOM line's M-Code and save it. Use this to fix unclassified components.",
        inputSchema: z.object({
          bom_line_id: z.string().describe("BOM line UUID"),
          m_code: z.string().describe("M-Code to assign: CP, IP, TH, CPEXP, 0402, 0201, MANSMT, MEC, Accs, CABLE, DEV"),
        }),
        execute: async ({ bom_line_id, m_code }: { bom_line_id: string; m_code: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can classify components." };
          const { error } = await supabase
            .from("bom_lines")
            .update({ m_code, m_code_source: "manual", m_code_confidence: 1.0, })
            .eq("id", bom_line_id);
          if (error) return { error: error.message };
          return { success: true, bom_line_id, m_code_assigned: m_code };
        },
      },

      classifyBomBatch: {
        description: "Auto-classify all unclassified BOM lines for a BOM using AI. Returns how many were classified.",
        inputSchema: z.object({ bom_id: z.string().describe("BOM UUID to classify") }),
        execute: async ({ bom_id }: { bom_id: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can batch-classify." };
          const { data: lines } = await supabase
            .from("bom_lines")
            .select("id, mpn, description, manufacturer, m_code, is_pcb, is_dni")
            .eq("bom_id", bom_id)
            .is("m_code", null);

          const unclassified = (lines ?? []).filter((l: any) => !l.is_pcb && !l.is_dni && l.mpn);
          let classified = 0;
          const results: { mpn: string; m_code: string | null; confidence: number }[] = [];

          for (const line of unclassified.slice(0, 50)) {
            const result = await classifyWithAI(line.mpn, line.description ?? "", line.manufacturer ?? "");
            if (result?.m_code && result.confidence >= 0.7) {
              await supabase.from("bom_lines").update({
                m_code: result.m_code,
                m_code_source: "ai",
                m_code_confidence: result.confidence,
              }).eq("id", line.id);
              classified++;
              results.push({ mpn: line.mpn, m_code: result.m_code, confidence: result.confidence });
            } else {
              results.push({ mpn: line.mpn, m_code: null, confidence: result?.confidence ?? 0 });
            }
          }

          return {
            total_unclassified: unclassified.length,
            classified_count: classified,
            still_needs_review: unclassified.length - classified,
            results: results.slice(0, 20),
            link: `/bom/${bom_id}`,
          };
        },
      },

      createProcurement: {
        description: "Create a procurement (PROC) for a job. Auto-populates component lines from BOM with overage.",
        inputSchema: z.object({ job_number: z.string().describe("Job number to create procurement for") }),
        execute: async ({ job_number }: { job_number: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can create procurement." };
          const { data: job } = await supabase.from("jobs").select("id, customer_id, bom_id, quantity, assembly_type, customers(code)").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };

          // Call the procurements API internally
          const customerCode = (job.customers as unknown as { code: string })?.code ?? "UNK";
          const res = await fetch(new URL("/api/procurements", req.url).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cookie": req.headers.get("cookie") ?? "" },
            body: JSON.stringify({ job_id: job.id, customer_code: customerCode }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { error: err.error ?? `Failed (${res.status})` };
          }

          const proc = await res.json();
          return { success: true, proc_code: proc.proc_code, job_number, link: `/procurement/${proc.id}` };
        },
      },

      generateSerials: {
        description: "Generate serial numbers for all boards in a job",
        inputSchema: z.object({ job_number: z.string().describe("Job number") }),
        execute: async ({ job_number }: { job_number: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can generate serial numbers." };
          const { data: job } = await supabase.from("jobs").select("id, quantity").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };

          // Check if serials already exist
          const { count } = await supabase.from("serial_numbers").select("id", { count: "exact", head: true }).eq("job_id", job.id);
          if ((count ?? 0) > 0) return { error: `Serial numbers already generated (${count} exist)` };

          const serials = Array.from({ length: job.quantity }, (_, i) => ({
            job_id: job.id,
            serial_number: `${job_number}-${String(i + 1).padStart(3, "0")}`,
            board_number: i + 1,
          }));

          const { error } = await supabase.from("serial_numbers").insert(serials);
          if (error) return { error: error.message };

          return { success: true, job_number, count: job.quantity, first: serials[0].serial_number, last: serials[serials.length - 1].serial_number };
        },
      },

      logProductionEvent: {
        description: "Log a production event for a job (setup, smt, reflow, aoi, etc.)",
        inputSchema: z.object({
          job_number: z.string().describe("Job number"),
          event_type: z.enum([
            "materials_received", "setup_started", "smt_top_start", "smt_top_end",
            "smt_bottom_start", "smt_bottom_end", "reflow_start", "reflow_end",
            "aoi_start", "aoi_passed", "aoi_failed", "through_hole_start", "through_hole_end",
            "touchup", "washing", "packing", "ready_to_ship"
          ]).describe("Event type"),
          notes: z.string().optional().describe("Optional notes"),
        }),
        execute: async ({ job_number, event_type, notes }: { job_number: string; event_type: string; notes?: string }) => {
          const { data: job } = await supabase.from("jobs").select("id").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };

          const { error } = await supabase.from("production_events").insert({
            job_id: job.id, event_type, notes,
          });
          if (error) return { error: error.message };

          return { success: true, job_number, event_type, timestamp: new Date().toISOString() };
        },
      },
      getJobProfitability: {
        description: "Get profitability analysis for a job — quoted total vs actual procurement cost, margin, margin %",
        inputSchema: z.object({ job_number: z.string().describe("Job number like JB-2604-CVNS-001") }),
        execute: async ({ job_number }: { job_number: string }) => {
          const { data: job } = await supabase.from("jobs").select("id").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };
          const res = await fetch(new URL(`/api/jobs/${job.id}/profitability`, req.url).toString(), {
            headers: { Cookie: req.headers.get("cookie") ?? "" },
          });
          if (!res.ok) return { error: `Failed (${res.status})` };
          return await res.json();
        },
      },

      getPricing: {
        description: "Get real-time pricing for a component MPN from DigiKey, Mouser, and LCSC. Returns best price and all supplier prices.",
        inputSchema: z.object({ mpn: z.string().describe("Manufacturer Part Number to price") }),
        execute: async ({ mpn }: { mpn: string }) => {
          const res = await fetch(new URL(`/api/pricing/${encodeURIComponent(mpn)}`, req.url).toString(), {
            headers: { Cookie: req.headers.get("cookie") ?? "" },
          });
          if (!res.ok) return { error: "Not found at any supplier" };
          return await res.json();
        },
      },

      correctMCode: {
        description: "Correct an M-Code classification based on user feedback. Updates both the BOM line AND the master components table so the system learns. Use when the user says something like 'C1 should be CP not IP' or 'that MPN is actually TH'.",
        inputSchema: z.object({
          mpn: z.string().describe("Manufacturer Part Number"),
          correct_m_code: z.string().describe("The correct M-Code: CP, IP, TH, CPEXP, 0402, 0201, MANSMT, MEC, Accs, CABLE, DEV"),
          reason: z.string().optional().describe("Why this correction is being made"),
        }),
        execute: async ({ mpn, correct_m_code, reason }: { mpn: string; correct_m_code: string; reason?: string }) => {
          if (!isPrivileged) return { error: "Permission denied. Only CEO or Operations Manager can correct M-Codes." };

          // 1. Update all BOM lines with this MPN
          const { data: updatedLines, error: lineErr } = await supabase
            .from("bom_lines")
            .update({
              m_code: correct_m_code,
              m_code_source: "manual",
              m_code_confidence: 1.0,
            })
            .eq("mpn", mpn)
            .select("id, bom_id");

          if (lineErr) return { error: lineErr.message };

          // 2. Upsert into components table (learning loop)
          const { error: compErr } = await supabase
            .from("components")
            .upsert(
              {
                mpn,
                m_code: correct_m_code,
                m_code_source: "manual",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "mpn,manufacturer", ignoreDuplicates: false }
            );

          // Also try without manufacturer constraint (update any matching MPN)
          await supabase
            .from("components")
            .update({
              m_code: correct_m_code,
              m_code_source: "manual",
              updated_at: new Date().toISOString(),
            })
            .eq("mpn", mpn);

          return {
            success: true,
            mpn,
            new_m_code: correct_m_code,
            bom_lines_updated: updatedLines?.length ?? 0,
            components_updated: !compErr,
            reason: reason ?? "User correction via chat",
            note: "This correction will be used for future auto-classification of this MPN.",
          };
        },
      },

      // ==========================================
      // NEW ACTION TOOLS (Session 7)
      // ==========================================

      createQuote: {
        description: isPrivileged ? "Create a new quote from a parsed BOM with quantity tiers" : "DISABLED: requires CEO or Operations Manager role",
        inputSchema: z.object({
          bom_id: z.string().describe("BOM UUID"),
          quantities: z.array(z.number()).describe("Quantity tiers, e.g. [50, 100, 250, 500]"),
          pcb_cost_per_unit: z.number().optional().describe("PCB cost per unit"),
          nre_charge: z.number().optional().describe("NRE charge (default $350)"),
          component_markup: z.number().optional().describe("Component markup % (default 20)"),
          notes: z.string().optional(),
        }),
        execute: async ({ bom_id, quantities, pcb_cost_per_unit, nre_charge, component_markup, notes }: { bom_id: string; quantities: number[]; pcb_cost_per_unit?: number; nre_charge?: number; component_markup?: number; notes?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: bom } = await supabase.from("boms").select("id, gmp_id, customer_id").eq("id", bom_id).single();
          if (!bom) return { error: "BOM not found" };
          const now = new Date();
          const prefix = `QT-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
          const { count } = await supabase.from("quotes").select("id", { count: "exact", head: true }).ilike("quote_number", `${prefix}%`);
          const quoteNumber = `${prefix}-${String((count ?? 0) + 1).padStart(3, "0")}`;
          const quantitiesObj: Record<string, number> = {};
          quantities.forEach((q, i) => { quantitiesObj[`qty_${i + 1}`] = q; });
          const { data: quote, error } = await supabase.from("quotes").insert({
            quote_number: quoteNumber, customer_id: bom.customer_id, gmp_id: bom.gmp_id, bom_id: bom.id,
            status: "draft", quantities: quantitiesObj, pricing: {},
            component_markup: component_markup ?? 20, pcb_cost_per_unit: pcb_cost_per_unit ?? 0,
            nre_charge: nre_charge ?? 350, notes, created_by: user.id,
          }).select("id, quote_number").single();
          if (error) return { error: error.message };
          return { success: true, quote_number: quote!.quote_number, link: `/quotes/${quote!.id}`, note: "Quote created as draft. Go to the quote page to run pricing and generate PDF." };
        },
      },

      updateQuoteStatus: {
        description: isPrivileged ? "Update quote status: draft→review→sent→accepted/rejected/expired" : "DISABLED",
        inputSchema: z.object({
          quote_number: z.string().describe("Quote number like QT-2604-001"),
          new_status: z.enum(["draft", "review", "sent", "accepted", "rejected", "expired"]).describe("New status"),
        }),
        execute: async ({ quote_number, new_status }: { quote_number: string; new_status: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: quote } = await supabase.from("quotes").select("id, status").eq("quote_number", quote_number).single();
          if (!quote) return { error: "Quote not found" };
          const updates: Record<string, unknown> = { status: new_status, updated_at: new Date().toISOString() };
          if (new_status === "sent") updates.issued_at = new Date().toISOString();
          if (new_status === "accepted") updates.accepted_at = new Date().toISOString();
          const { error } = await supabase.from("quotes").update(updates).eq("id", quote.id);
          if (error) return { error: error.message };
          return { success: true, quote_number, old_status: quote.status, new_status, link: `/quotes/${quote.id}` };
        },
      },

      createJobFromQuote: {
        description: isPrivileged ? "Create a job from a quote. Auto-generates job number." : "DISABLED",
        inputSchema: z.object({
          quote_number: z.string().describe("Quote number"),
          quantity: z.number().describe("Quantity tier to use"),
          po_number: z.string().optional().describe("Customer PO number"),
          assembly_type: z.enum(["TB", "TS", "CS", "CB", "AS"]).optional().describe("Assembly type (default TB)"),
        }),
        execute: async ({ quote_number, quantity, po_number, assembly_type }: { quote_number: string; quantity: number; po_number?: string; assembly_type?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: quote } = await supabase.from("quotes").select("id, customer_id, gmp_id, bom_id, customers(code)").eq("quote_number", quote_number).single();
          if (!quote) return { error: "Quote not found" };
          const now = new Date();
          const custCode = (quote.customers as unknown as { code: string })?.code ?? "UNK";
          const prefix = `JB-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${custCode}`;
          const { count } = await supabase.from("jobs").select("id", { count: "exact", head: true }).ilike("job_number", `${prefix}%`);
          const jobNumber = `${prefix}-${String((count ?? 0) + 1).padStart(3, "0")}`;
          const { data: job, error } = await supabase.from("jobs").insert({
            job_number: jobNumber, quote_id: quote.id, customer_id: quote.customer_id,
            gmp_id: quote.gmp_id, bom_id: quote.bom_id, po_number, quantity,
            assembly_type: assembly_type ?? "TB", status: "created", created_by: user.id,
          }).select("id, job_number").single();
          if (error) return { error: error.message };
          await supabase.from("job_status_log").insert({ job_id: job!.id, old_status: null, new_status: "created", notes: `Created from quote ${quote_number} via AI` });
          return { success: true, job_number: job!.job_number, quantity, link: `/jobs/${job!.id}` };
        },
      },

      scheduleJob: {
        description: isPrivileged ? "Set or update scheduled start and completion dates for a job" : "DISABLED",
        inputSchema: z.object({
          job_number: z.string().describe("Job number"),
          scheduled_start: z.string().describe("Start date YYYY-MM-DD"),
          scheduled_completion: z.string().describe("Completion date YYYY-MM-DD"),
        }),
        execute: async ({ job_number, scheduled_start, scheduled_completion }: { job_number: string; scheduled_start: string; scheduled_completion: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: job } = await supabase.from("jobs").select("id").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };
          const { error } = await supabase.from("jobs").update({ scheduled_start, scheduled_completion, updated_at: new Date().toISOString() }).eq("id", job.id);
          if (error) return { error: error.message };
          return { success: true, job_number, scheduled_start, scheduled_completion };
        },
      },

      createInvoice: {
        description: isPrivileged ? "Create an invoice for completed jobs from same customer. Supports multi-PO consolidation." : "DISABLED",
        inputSchema: z.object({
          job_numbers: z.array(z.string()).describe("One or more job numbers to invoice"),
          discount: z.number().optional().describe("Discount amount"),
          freight: z.number().optional().describe("Freight charge"),
          notes: z.string().optional(),
        }),
        execute: async ({ job_numbers, discount, freight, notes }: { job_numbers: string[]; discount?: number; freight?: number; notes?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: jobs } = await supabase.from("jobs").select("id, job_number, customer_id, quantity, quotes(pricing)").in("job_number", job_numbers);
          if (!jobs || jobs.length === 0) return { error: "No jobs found" };
          const customerIds = [...new Set(jobs.map((j: any) => j.customer_id))];
          if (customerIds.length > 1) return { error: "All jobs must be from the same customer" };
          let subtotal = 0;
          for (const job of jobs) {
            const pricing = (job.quotes as any)?.pricing;
            if (pricing?.tiers) {
              const tier = pricing.tiers.find((t: any) => t.qty === job.quantity) ?? pricing.tiers[0];
              subtotal += tier?.total ?? 0;
            }
          }
          const gst = subtotal * 0.05;
          const qst = subtotal * 0.09975;
          const total = subtotal - (discount ?? 0) + gst + qst + (freight ?? 0);
          const now = new Date();
          const prefix = `INV-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
          const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).ilike("invoice_number", `${prefix}%`);
          const invoiceNumber = `${prefix}-${String((count ?? 0) + 1).padStart(3, "0")}`;
          const { data: inv, error } = await supabase.from("invoices").insert({
            invoice_number: invoiceNumber, job_id: jobs[0].id, customer_id: customerIds[0],
            subtotal, discount: discount ?? 0, tps_gst: gst, tvq_qst: qst, freight: freight ?? 0,
            total, status: "draft", issued_date: now.toISOString().split("T")[0],
            due_date: new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0], notes,
          }).select("id, invoice_number").single();
          if (error) return { error: error.message };
          return { success: true, invoice_number: inv!.invoice_number, total: `$${total.toFixed(2)}`, link: `/invoices/${inv!.id}` };
        },
      },

      markInvoicePaid: {
        description: isPrivileged ? "Mark an invoice as paid and record payment details" : "DISABLED",
        inputSchema: z.object({
          invoice_number: z.string().describe("Invoice number like INV-2604-001"),
          payment_method: z.string().optional().describe("cheque, wire, credit card"),
          paid_date: z.string().optional().describe("YYYY-MM-DD (defaults to today)"),
        }),
        execute: async ({ invoice_number, payment_method, paid_date }: { invoice_number: string; payment_method?: string; paid_date?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: inv } = await supabase.from("invoices").select("id, status, total").eq("invoice_number", invoice_number).single();
          if (!inv) return { error: "Invoice not found" };
          const { error } = await supabase.from("invoices").update({
            status: "paid", paid_date: paid_date ?? new Date().toISOString().split("T")[0],
            payment_method: payment_method ?? "unspecified", updated_at: new Date().toISOString(),
          }).eq("id", inv.id);
          if (error) return { error: error.message };
          return { success: true, invoice_number, total: `$${Number(inv.total).toFixed(2)}`, status: "paid" };
        },
      },

      orderProcurementLines: {
        description: isPrivileged ? "Mark procurement lines as ordered — single line or all pending" : "DISABLED",
        inputSchema: z.object({
          procurement_id: z.string().describe("Procurement UUID"),
          line_id: z.string().optional().describe("Specific line ID (omit to order ALL pending)"),
        }),
        execute: async ({ procurement_id, line_id }: { procurement_id: string; line_id?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const action = line_id ? "order_line" : "order_all";
          const payload: Record<string, string> = { action };
          if (line_id) payload.line_id = line_id;
          const res = await fetch(new URL(`/api/procurements/${procurement_id}`, req.url).toString(), {
            method: "PATCH", headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); return { error: err.error ?? `Failed (${res.status})` }; }
          return await res.json();
        },
      },

      receiveProcurementLine: {
        description: isPrivileged ? "Mark a procurement line as received" : "DISABLED",
        inputSchema: z.object({
          procurement_id: z.string().describe("Procurement UUID"),
          line_id: z.string().describe("Procurement line UUID"),
          qty_received: z.number().describe("Quantity received"),
        }),
        execute: async ({ procurement_id, line_id, qty_received }: { procurement_id: string; line_id: string; qty_received: number }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const res = await fetch(new URL(`/api/procurements/${procurement_id}`, req.url).toString(), {
            method: "PATCH", headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
            body: JSON.stringify({ action: "receive_line", line_id, qty_received }),
          });
          if (!res.ok) { const err = await res.json().catch(() => ({})); return { error: err.error ?? `Failed (${res.status})` }; }
          return await res.json();
        },
      },

      createNCR: {
        description: isPrivileged ? "Create a Non-Conformance Report (NCR) for a job" : "DISABLED",
        inputSchema: z.object({
          job_number: z.string().describe("Job number"),
          category: z.enum(["soldering_defect", "component", "pcb", "assembly", "cosmetic", "other"]),
          subcategory: z.string().optional(),
          severity: z.enum(["minor", "major", "critical"]),
          description: z.string().describe("Description of the issue"),
        }),
        execute: async ({ job_number, category, subcategory, severity, description }: { job_number: string; category: string; subcategory?: string; severity: string; description: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const { data: job } = await supabase.from("jobs").select("id, customer_id").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };
          const now = new Date();
          const prefix = `NCR-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
          const { count } = await supabase.from("ncr_reports").select("id", { count: "exact", head: true }).ilike("ncr_number", `${prefix}%`);
          const ncrNumber = `${prefix}-${String((count ?? 0) + 1).padStart(3, "0")}`;
          const { data: ncr, error } = await supabase.from("ncr_reports").insert({
            ncr_number: ncrNumber, job_id: job.id, customer_id: job.customer_id,
            category, subcategory, severity, description, status: "open", reported_by: user.id,
          }).select("id, ncr_number").single();
          if (error) return { error: error.message };
          return { success: true, ncr_number: ncr!.ncr_number, severity, link: `/quality` };
        },
      },

      updateCustomer: {
        description: isPrivileged ? "Update customer details (contact info, payment terms, notes)" : "DISABLED",
        inputSchema: z.object({
          customer_code: z.string().describe("Customer code (TLAN, LABO, etc.)"),
          contact_name: z.string().optional(), contact_email: z.string().optional(),
          contact_phone: z.string().optional(), payment_terms: z.string().optional(), notes: z.string().optional(),
        }),
        execute: async ({ customer_code, ...updates }: { customer_code: string; contact_name?: string; contact_email?: string; contact_phone?: string; payment_terms?: string; notes?: string }) => {
          if (!isPrivileged) return { error: "Permission denied." };
          const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
          if (Object.keys(cleanUpdates).length === 0) return { error: "No fields to update" };
          const { data, error } = await supabase.from("customers").update({ ...cleanUpdates, updated_at: new Date().toISOString() }).eq("code", customer_code.toUpperCase()).select("code, company_name").single();
          if (error) return { error: error.message };
          if (!data) return { error: "Customer not found" };
          return { success: true, customer: data, updated_fields: Object.keys(cleanUpdates) };
        },
      },

      generateDocument: {
        description: "Generate a PDF document. Returns a download URL you can share with the user.",
        inputSchema: z.object({
          type: z.enum(["quote", "invoice", "packing_slip", "compliance_cert", "job_card", "traveller", "print_bom", "reception_file"]),
          id: z.string().describe("Record ID — quote ID for quotes, invoice ID for invoices, job ID for production/shipping docs"),
        }),
        execute: async ({ type, id }: { type: string; id: string }) => {
          const urlMap: Record<string, string> = {
            quote: `/api/quotes/${id}/pdf`, invoice: `/api/invoices/${id}/pdf`,
            packing_slip: `/api/jobs/${id}/shipping-docs?type=packing_slip`,
            compliance_cert: `/api/jobs/${id}/shipping-docs?type=compliance`,
            job_card: `/api/jobs/${id}/production-docs?type=job_card`,
            traveller: `/api/jobs/${id}/production-docs?type=traveller`,
            print_bom: `/api/jobs/${id}/production-docs?type=print_bom`,
            reception_file: `/api/jobs/${id}/production-docs?type=reception`,
          };
          const url = urlMap[type];
          if (!url) return { error: "Unknown document type" };
          return { success: true, download_url: url, note: `Open this URL to download the ${type.replace(/_/g, " ")} PDF` };
        },
      },

      // ==========================================
      // NEW READ TOOLS (Session 7)
      // ==========================================

      getProductionSchedule: {
        description: "Get production schedule — active jobs by status for Kanban/calendar view, overdue jobs, upcoming jobs",
        inputSchema: z.object({
          view: z.enum(["kanban", "overdue", "upcoming", "all"]).optional().describe("View type (default: all)"),
        }),
        execute: async ({ view }: { view?: string }) => {
          const { data: jobs } = await supabase.from("jobs")
            .select("job_number, status, quantity, assembly_type, scheduled_start, scheduled_completion, customers(code, company_name), gmps(gmp_number, board_name)")
            .not("status", "in", '("delivered","invoiced","archived","created")')
            .order("scheduled_completion", { ascending: true, nullsFirst: false });
          const allJobs = jobs ?? [];
          const now = new Date().toISOString().split("T")[0];
          if (view === "overdue") return { jobs: allJobs.filter((j: any) => j.scheduled_completion && j.scheduled_completion < now) };
          if (view === "upcoming") {
            const week = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
            return { jobs: allJobs.filter((j: any) => j.scheduled_start && j.scheduled_start <= week && j.scheduled_start >= now) };
          }
          if (view === "kanban") {
            const grouped: Record<string, unknown[]> = {};
            for (const j of allJobs) { (grouped[j.status] ??= []).push(j); }
            return { kanban: grouped };
          }
          return { total: allJobs.length, jobs: allJobs };
        },
      },

      getLabourCost: {
        description: "Get labour cost breakdown for a job — placements, setup, programming, NRE",
        inputSchema: z.object({ job_number: z.string().describe("Job number") }),
        execute: async ({ job_number }: { job_number: string }) => {
          const { data: job } = await supabase.from("jobs").select("id, bom_id, quantity").eq("job_number", job_number).single();
          if (!job) return { error: "Job not found" };
          const res = await fetch(new URL("/api/labour", req.url).toString(), {
            method: "POST", headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
            body: JSON.stringify({ bom_id: job.bom_id, board_qty: job.quantity }),
          });
          if (!res.ok) return { error: `Labour API failed (${res.status})` };
          return await res.json();
        },
      },

      getAgingReport: {
        description: "Get accounts receivable aging report — outstanding invoices by 30/60/90+ days",
        inputSchema: z.object({}),
        execute: async () => {
          const { data: invoices } = await supabase.from("invoices")
            .select("invoice_number, total, status, issued_date, due_date, customers(code, company_name)")
            .in("status", ["sent", "overdue"]);
          const now = new Date();
          let current = 0, over30 = 0, over60 = 0, over90 = 0;
          const items = (invoices ?? []).map((inv: any) => {
            const due = new Date(inv.due_date);
            const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
            const amount = Number(inv.total) || 0;
            if (days > 90) over90 += amount; else if (days > 60) over60 += amount; else if (days > 30) over30 += amount; else current += amount;
            return { ...inv, days_outstanding: Math.max(0, days) };
          });
          const total = current + over30 + over60 + over90;
          return { total_outstanding: `$${total.toFixed(2)}`, current: `$${current.toFixed(2)}`, over_30: `$${over30.toFixed(2)}`, over_60: `$${over60.toFixed(2)}`, over_90: `$${over90.toFixed(2)}`, invoices: items };
        },
      },

      listProcurements: {
        description: "List procurements with status, optionally filtered by status or job",
        inputSchema: z.object({
          status: z.string().optional().describe("Status: draft, ordering, partial_received, fully_received, completed"),
          job_number: z.string().optional().describe("Filter by job number"),
        }),
        execute: async ({ status, job_number }: { status?: string; job_number?: string }) => {
          let query = supabase.from("procurements").select("id, proc_code, status, total_lines, lines_ordered, lines_received, created_at, jobs(job_number, customers(code))").order("created_at", { ascending: false }).limit(20);
          if (status) query = query.eq("status", status);
          if (job_number) {
            const { data: job } = await supabase.from("jobs").select("id").eq("job_number", job_number).single();
            if (job) query = query.eq("job_id", job.id);
          }
          const { data } = await query;
          return { procurements: data ?? [] };
        },
      },
    },
    stopWhen: stepCountIs(12),
  });

  // --- PERSIST MESSAGES TO DB (fire-and-forget) ---
  if (conversationId) {
    // Save the last user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          role: "user",
          content: lastUserMsg.content,
          metadata: body.attachments ? { attachments: body.attachments } : {},
        })
        .then(() => {});
    }

    // Collect the streamed response and save it after completion
    const response = result.toUIMessageStreamResponse();

    // Save assistant response in the background after stream completes
    result.text.then((fullText) => {
      if (fullText) {
        supabase
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: fullText,
            metadata: {},
          })
          .then(() => {
            // Update conversation timestamp
            supabase
              .from("chat_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId)
              .then(() => {});
          });
      }
    });

    return response;
  }

  return result.toUIMessageStreamResponse();
}
