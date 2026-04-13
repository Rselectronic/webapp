/**
 * Page context detection + fetching for the AI chat.
 *
 * Given a pathname like `/quotes/abc-123`, detects the entity type and ID,
 * then loads a concise summary from Supabase to inject into the chat system prompt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EntityType =
  | "quote"
  | "quote_batch"
  | "job"
  | "bom"
  | "procurement"
  | "procurement_batch"
  | "invoice"
  | "customer"
  | "ncr"
  | "production"
  | "inventory"
  | "settings"
  | "dashboard"
  | "list";

export interface PageContext {
  type: EntityType;
  id: string | null;
  path: string;
  /** Human-friendly page label, e.g. "Quote QT-2604-001" */
  label?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a pathname into an entity type + id.
 * Only treats segments that look like UUIDs as IDs.
 */
export function detectPageContext(pathname: string | null | undefined): PageContext | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const segs = path.split("/").filter(Boolean);

  if (segs.length === 0) return { type: "dashboard", id: null, path };

  const [root, second, third] = segs;

  // /quotes/batches/[id]
  if (root === "quotes" && second === "batches" && third && UUID_RE.test(third)) {
    return { type: "quote_batch", id: third, path };
  }
  // /procurement/batches/[id]
  if (root === "procurement" && second === "batches" && third && UUID_RE.test(third)) {
    return { type: "procurement_batch", id: third, path };
  }
  // /quotes/[id]
  if (root === "quotes" && second && UUID_RE.test(second)) {
    return { type: "quote", id: second, path };
  }
  // /jobs/[id]
  if (root === "jobs" && second && UUID_RE.test(second)) {
    return { type: "job", id: second, path };
  }
  // /bom/[id]
  if (root === "bom" && second && UUID_RE.test(second)) {
    return { type: "bom", id: second, path };
  }
  // /procurement/[id]
  if (root === "procurement" && second && UUID_RE.test(second)) {
    return { type: "procurement", id: second, path };
  }
  // /invoices/[id]
  if (root === "invoices" && second && UUID_RE.test(second)) {
    return { type: "invoice", id: second, path };
  }
  // /customers/[id]
  if (root === "customers" && second && UUID_RE.test(second)) {
    return { type: "customer", id: second, path };
  }
  // /quality/[id]
  if (root === "quality" && second && UUID_RE.test(second)) {
    return { type: "ncr", id: second, path };
  }

  // Top-level list pages
  const topLevelMap: Record<string, EntityType> = {
    quotes: "list",
    jobs: "list",
    bom: "list",
    procurement: "list",
    invoices: "list",
    customers: "list",
    quality: "list",
    production: "production",
    inventory: "inventory",
    settings: "settings",
  };

  if (topLevelMap[root]) {
    return { type: topLevelMap[root], id: null, path };
  }

  return { type: "dashboard", id: null, path };
}

/**
 * Fetch a concise summary of the entity at the current page.
 * Designed to be < ~400 tokens so we don't bloat every chat request.
 * Returns null if no useful context can be loaded.
 */
export async function fetchPageContextSummary(
  supabase: SupabaseClient,
  ctx: PageContext
): Promise<string | null> {
  try {
    switch (ctx.type) {
      case "quote":
        return await summarizeQuote(supabase, ctx.id!);
      case "quote_batch":
        return await summarizeQuoteBatch(supabase, ctx.id!);
      case "job":
        return await summarizeJob(supabase, ctx.id!);
      case "bom":
        return await summarizeBom(supabase, ctx.id!);
      case "procurement":
        return await summarizeProcurement(supabase, ctx.id!);
      case "procurement_batch":
        return await summarizeProcurementBatch(supabase, ctx.id!);
      case "invoice":
        return await summarizeInvoice(supabase, ctx.id!);
      case "customer":
        return await summarizeCustomer(supabase, ctx.id!);
      case "ncr":
        return await summarizeNcr(supabase, ctx.id!);
      case "list":
      case "production":
      case "inventory":
      case "settings":
      case "dashboard":
        return summarizeListPage(ctx.path);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---------- Entity summarizers ----------

async function summarizeQuote(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("quotes")
    .select(
      `quote_number, status, quantities, pricing, component_markup, nre_charge,
       notes, issued_at, expires_at,
       customers(code, company_name),
       gmps(gmp_number, board_name),
       boms(file_name, component_count, status)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  const gmp = Array.isArray(data.gmps) ? data.gmps[0] : data.gmps;
  const bom = Array.isArray(data.boms) ? data.boms[0] : data.boms;

  const qtys = data.quantities && typeof data.quantities === "object" ? data.quantities : {};
  const pricing = data.pricing && typeof data.pricing === "object" ? data.pricing : {};

  const tierLines: string[] = [];
  for (const [key, qty] of Object.entries(qtys as Record<string, unknown>)) {
    const p = (pricing as Record<string, { total?: number; per_unit?: number }>)[key];
    if (qty) {
      const total = p?.total != null ? `$${Number(p.total).toFixed(2)}` : "(no price)";
      const unit = p?.per_unit != null ? `$${Number(p.per_unit).toFixed(2)}/ea` : "";
      tierLines.push(`  - ${qty} pcs: ${total} ${unit}`.trim());
    }
  }

  return [
    `Page: /quotes/${id}`,
    `Quote ${data.quote_number} — status: ${data.status}`,
    `Customer: ${customer?.code ?? "?"} (${customer?.company_name ?? ""})`,
    `GMP: ${gmp?.gmp_number ?? "?"}${gmp?.board_name ? ` — ${gmp.board_name}` : ""}`,
    `BOM: ${bom?.file_name ?? "?"} (${bom?.component_count ?? 0} lines, ${bom?.status ?? "?"})`,
    tierLines.length ? `Pricing tiers:\n${tierLines.join("\n")}` : "Pricing: not yet calculated",
    data.nre_charge ? `NRE: $${Number(data.nre_charge).toFixed(2)}` : "",
    data.component_markup != null ? `Component markup: ${data.component_markup}%` : "",
    data.notes ? `Notes: ${String(data.notes).slice(0, 200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeQuoteBatch(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("quote_batches")
    .select(
      `*,
       customers(code, company_name),
       quote_batch_boms(boms(file_name, component_count), gmps(gmp_number, board_name))`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown> & {
    customers?: { code?: string; company_name?: string } | Array<{ code?: string; company_name?: string }>;
    quote_batch_boms?: Array<{
      boms?: { file_name?: string; component_count?: number } | null;
      gmps?: { gmp_number?: string; board_name?: string } | null;
    }>;
  };
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const boms = row.quote_batch_boms ?? [];
  const name = (row.batch_name as string | undefined) ?? (row.name as string | undefined) ?? "(unnamed)";
  const status = (row.status as string | undefined) ?? "?";

  return [
    `Page: /quotes/batches/${id}`,
    `Quote Batch: ${name} — status: ${status}`,
    `Customer: ${customer?.code ?? "?"} (${customer?.company_name ?? ""})`,
    `BOMs in batch: ${boms.length}`,
    ...boms
      .slice(0, 5)
      .map(
        (b, i) =>
          `  ${i + 1}. ${b.gmps?.gmp_number ?? "?"} — ${b.boms?.file_name ?? "?"} (${b.boms?.component_count ?? 0} lines)`
      ),
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeJob(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("jobs")
    .select(
      `job_number, status, quantity, assembly_type, po_number,
       scheduled_start, scheduled_completion,
       customers(code, company_name),
       gmps(gmp_number, board_name),
       boms(file_name, component_count),
       quotes(quote_number, pricing)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  const gmp = Array.isArray(data.gmps) ? data.gmps[0] : data.gmps;
  const bom = Array.isArray(data.boms) ? data.boms[0] : data.boms;
  const quote = Array.isArray(data.quotes) ? data.quotes[0] : data.quotes;

  return [
    `Page: /jobs/${id}`,
    `Job ${data.job_number} — status: ${data.status}`,
    `Customer: ${customer?.code ?? "?"} (${customer?.company_name ?? ""})`,
    `GMP: ${gmp?.gmp_number ?? "?"}${gmp?.board_name ? ` — ${gmp.board_name}` : ""}`,
    `Quantity: ${data.quantity}, Assembly type: ${data.assembly_type ?? "?"}`,
    data.po_number ? `Customer PO: ${data.po_number}` : "No PO uploaded yet",
    `BOM: ${bom?.file_name ?? "?"} (${bom?.component_count ?? 0} lines)`,
    quote?.quote_number ? `Linked quote: ${quote.quote_number}` : "",
    data.scheduled_completion ? `Scheduled completion: ${data.scheduled_completion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeBom(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("boms")
    .select(
      `file_name, status, component_count, revision,
       customers(code, company_name),
       gmps(gmp_number, board_name)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  // Count unclassified components
  const { count: unclassified } = await sb
    .from("bom_lines")
    .select("id", { count: "exact", head: true })
    .eq("bom_id", id)
    .is("m_code", null);

  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  const gmp = Array.isArray(data.gmps) ? data.gmps[0] : data.gmps;

  return [
    `Page: /bom/${id}`,
    `BOM: ${data.file_name} — status: ${data.status}`,
    `Customer: ${customer?.code ?? "?"} (${customer?.company_name ?? ""})`,
    `GMP: ${gmp?.gmp_number ?? "?"}${gmp?.board_name ? ` — ${gmp.board_name}` : ""}`,
    `Components: ${data.component_count ?? 0}, revision: ${data.revision ?? "1"}`,
    unclassified != null ? `Unclassified (no M-Code): ${unclassified}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeProcurement(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("procurements")
    .select(
      `proc_code, status, total_lines, lines_ordered, lines_received, notes,
       jobs(job_number, status, customers(code, company_name), gmps(gmp_number))`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  const customer = job?.customers
    ? Array.isArray(job.customers)
      ? job.customers[0]
      : job.customers
    : null;
  const gmp = job?.gmps ? (Array.isArray(job.gmps) ? job.gmps[0] : job.gmps) : null;

  return [
    `Page: /procurement/${id}`,
    `Procurement: ${data.proc_code} — status: ${data.status}`,
    job?.job_number ? `Job: ${job.job_number} (${job.status})` : "",
    customer ? `Customer: ${customer.code} (${customer.company_name})` : "",
    gmp?.gmp_number ? `GMP: ${gmp.gmp_number}` : "",
    `Lines: ${data.lines_ordered ?? 0}/${data.total_lines ?? 0} ordered, ${data.lines_received ?? 0} received`,
    data.notes ? `Notes: ${String(data.notes).slice(0, 200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeProcurementBatch(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("procurement_batches")
    .select("*, customers(code, company_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown> & {
    customers?: { code?: string; company_name?: string } | Array<{ code?: string; company_name?: string }>;
  };
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const code = (row.batch_code as string | undefined) ?? (row.batch_name as string | undefined) ?? "(unnamed)";
  return [
    `Page: /procurement/batches/${id}`,
    `Procurement Batch: ${code} — status: ${(row.status as string | undefined) ?? "?"}`,
    customer ? `Customer: ${customer.code ?? "?"} (${customer.company_name ?? ""})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeInvoice(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("invoices")
    .select(
      `invoice_number, status, subtotal, total, tps_gst, tvq_qst, issued_date, due_date, paid_date,
       customers(code, company_name), jobs(job_number)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;

  return [
    `Page: /invoices/${id}`,
    `Invoice ${data.invoice_number} — status: ${data.status}`,
    `Customer: ${customer?.code ?? "?"} (${customer?.company_name ?? ""})`,
    job?.job_number ? `Job: ${job.job_number}` : "",
    `Subtotal: $${Number(data.subtotal ?? 0).toFixed(2)}, GST: $${Number(data.tps_gst ?? 0).toFixed(2)}, QST: $${Number(data.tvq_qst ?? 0).toFixed(2)}, Total: $${Number(data.total ?? 0).toFixed(2)}`,
    data.issued_date ? `Issued: ${data.issued_date}` : "Not issued yet",
    data.due_date ? `Due: ${data.due_date}` : "",
    data.paid_date ? `Paid: ${data.paid_date}` : "Not paid",
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeCustomer(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("customers")
    .select("code, company_name, contact_name, contact_email, payment_terms, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const [q, j, inv] = await Promise.all([
    sb.from("quotes").select("id", { count: "exact", head: true }).eq("customer_id", id).in("status", ["draft", "review", "sent"]),
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", id).not("status", "in", '("delivered","invoiced","archived")'),
    sb.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id).in("status", ["sent", "overdue"]),
  ]);

  return [
    `Page: /customers/${id}`,
    `Customer: ${data.code} — ${data.company_name}`,
    data.contact_name ? `Contact: ${data.contact_name} (${data.contact_email ?? ""})` : "",
    `Payment terms: ${data.payment_terms ?? "?"}`,
    `Open quotes: ${q.count ?? 0}, active jobs: ${j.count ?? 0}, unpaid invoices: ${inv.count ?? 0}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function summarizeNcr(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await sb
    .from("ncr_reports")
    .select("ncr_number, status, severity, category, subcategory, description, jobs(job_number), customers(code)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const job = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  return [
    `Page: /quality/${id}`,
    `NCR ${data.ncr_number} — status: ${data.status}, severity: ${data.severity ?? "?"}`,
    `Category: ${data.category ?? "?"}/${data.subcategory ?? "?"}`,
    job?.job_number ? `Job: ${job.job_number}` : "",
    customer?.code ? `Customer: ${customer.code}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeListPage(path: string): string {
  const labels: Record<string, string> = {
    "/quotes": "Quote list. User can filter by status, create new quotes, open existing.",
    "/quotes/batches": "Quote batches list — multi-BOM batch quoting.",
    "/quotes/new": "Creating a new quote. User selects a parsed BOM and quantities.",
    "/jobs": "Job board / Kanban. Jobs grouped by status.",
    "/bom": "BOM list. User can upload or review parsed BOMs.",
    "/bom/upload": "Uploading a new BOM. User must select customer + GMP.",
    "/procurement": "Procurement list. Tracks component ordering.",
    "/procurement/new": "Creating a new procurement from a job.",
    "/procurement/batches": "Procurement batches list.",
    "/invoices": "Invoice list with aging info.",
    "/invoices/payments": "Payment tracking page.",
    "/customers": "Customer list.",
    "/quality": "Quality / NCR list.",
    "/production": "Production dashboard. Realtime shop-floor events.",
    "/production/log": "Shop floor event logger (Hammad uses this).",
    "/inventory": "BG feeder inventory.",
    "/settings": "Settings — pricing rules, M-Code rules, suppliers, etc.",
    "/reports": "Reports — profitability, capacity, overview.",
    "/": "Dashboard home — KPI snapshot.",
  };
  return `Page: ${path}\n${labels[path] ?? "Dashboard area."}`;
}

/**
 * Suggest quick-action chips the user could ask based on the current page.
 */
export function getPageSuggestions(ctx: PageContext | null): string[] {
  if (!ctx) return [];
  switch (ctx.type) {
    case "quote":
      return [
        "Explain this quote",
        "Run pricing on this quote",
        "Approve this quote",
        "Create a job from this quote",
      ];
    case "quote_batch":
      return [
        "Run pricing on all BOMs",
        "Show me unpriced lines",
        "Summarize this batch",
      ];
    case "job":
      return [
        "What's the status of this job?",
        "Create procurement for this job",
        "Generate the job card",
        "Log a production event",
      ];
    case "bom":
      return [
        "Show unclassified components",
        "Classify remaining components",
        "Create a quote from this BOM",
      ];
    case "procurement":
      return [
        "Show backordered lines",
        "Mark lines as received",
        "Generate supplier POs",
      ];
    case "invoice":
      return [
        "Mark this invoice paid",
        "Show payment history",
        "Generate invoice PDF",
      ];
    case "customer":
      return [
        "Show open quotes",
        "Show unpaid invoices",
        "Recent jobs for this customer",
      ];
    case "ncr":
      return [
        "Show the CAAF form",
        "Update NCR status",
      ];
    default:
      return [
        "Business overview",
        "What should I work on?",
      ];
  }
}
