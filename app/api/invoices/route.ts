import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";

// ---------------------------------------------------------------------------
// GET /api/invoices — List invoices with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("invoices")
    .select("*, customers(code, company_name, contact_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }
  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute days_outstanding for unpaid invoices
  const now = Date.now();
  const enriched = (data ?? []).map((inv) => {
    let days_outstanding: number | null = null;
    if (inv.issued_date && inv.status !== "paid" && inv.status !== "cancelled") {
      const issued = new Date(inv.issued_date).getTime();
      days_outstanding = Math.floor((now - issued) / (1000 * 60 * 60 * 24));
    }
    return { ...inv, days_outstanding };
  });

  return NextResponse.json(enriched);
}

// ---------------------------------------------------------------------------
// POST /api/invoices — Create an invoice from one or more jobs
// ---------------------------------------------------------------------------
// Accepts either:
//   { job_id: string }                — single-job invoice (legacy)
//   { job_ids: string[], customer_id: string } — multi-job consolidated invoice
// Common optional fields: freight, discount, notes

interface CreateInvoiceBody {
  job_id?: string;
  job_ids?: string[];
  customer_id?: string;
  freight?: number;
  discount?: number;
  notes?: string;
}

interface JobWithQuote {
  id: string;
  job_number: string;
  quantity: number;
  customer_id: string;
  gmp_id: string;
  gmps: { gmp_number: string; board_name: string | null } | null;
  quotes: {
    pricing: { tiers?: { board_qty: number; subtotal: number; per_unit?: number }[] };
    quantities: Record<string, number>;
  } | null;
}

function getJobSubtotal(job: JobWithQuote): number {
  const tiers = job.quotes?.pricing?.tiers;
  if (!tiers?.length) return 0;
  const matched = tiers.find((t) => t.board_qty === job.quantity) ?? tiers[0];
  return matched.subtotal;
}

function getJobPerUnit(job: JobWithQuote): number {
  const tiers = job.quotes?.pricing?.tiers;
  if (!tiers?.length) return 0;
  const matched = tiers.find((t) => t.board_qty === job.quantity) ?? tiers[0];
  if (matched.per_unit != null) return matched.per_unit;
  return job.quantity > 0 ? matched.subtotal / job.quantity : 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateInvoiceBody;
  const { freight = 0, discount = 0, notes } = body;

  // Normalize to an array of job IDs
  const jobIds: string[] = body.job_ids ?? (body.job_id ? [body.job_id] : []);

  if (jobIds.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: job_id or job_ids" },
      { status: 400 }
    );
  }

  // Fetch all jobs with quote pricing + GMP info
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, job_number, quantity, customer_id, gmp_id, gmps(gmp_number, board_name), quotes(pricing, quantities)")
    .in("id", jobIds);

  if (jobsError || !jobs || jobs.length === 0) {
    return NextResponse.json({ error: "No valid jobs found" }, { status: 404 });
  }

  const typedJobs = jobs as unknown as JobWithQuote[];

  // Verify all jobs belong to the same customer
  const customerIds = [...new Set(typedJobs.map((j) => j.customer_id))];
  if (customerIds.length > 1) {
    return NextResponse.json(
      { error: "All jobs must belong to the same customer" },
      { status: 400 }
    );
  }
  const customerId = body.customer_id ?? customerIds[0];

  // Fetch customer's payment terms for due_date calculation
  const { data: customer } = await supabase
    .from("customers")
    .select("payment_terms")
    .eq("id", customerId)
    .single();

  // Parse "Net 30", "Net 60", "Net 45", "Net 15", etc. → number of days
  const paymentTerms = customer?.payment_terms ?? "Net 30";
  const netDaysMatch = paymentTerms.match(/\d+/);
  const netDays = netDaysMatch ? parseInt(netDaysMatch[0], 10) : 30;

  // Verify all jobs have quote pricing
  const jobsWithoutPricing = typedJobs.filter(
    (j) => !j.quotes?.pricing?.tiers?.length
  );
  if (jobsWithoutPricing.length > 0) {
    return NextResponse.json(
      {
        error: `Jobs missing quote pricing: ${jobsWithoutPricing.map((j) => j.job_number).join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Calculate combined subtotal
  const subtotal = typedJobs.reduce((sum, j) => sum + getJobSubtotal(j), 0);
  const tpsGst = Math.round(subtotal * 0.05 * 100) / 100;
  const tvqQst = Math.round(subtotal * 0.09975 * 100) / 100;
  const total =
    Math.round((subtotal + tpsGst + tvqQst + freight - discount) * 100) / 100;

  // Build line_items metadata for multi-job invoices
  const lineItems = typedJobs.map((j) => ({
    job_id: j.id,
    job_number: j.job_number,
    gmp_number: j.gmps?.gmp_number ?? "Unknown",
    board_name: j.gmps?.board_name ?? null,
    quantity: j.quantity,
    per_unit: Math.round(getJobPerUnit(j) * 100) / 100,
    subtotal: Math.round(getJobSubtotal(j) * 100) / 100,
  }));

  // Generate invoice number: INV-YYMM-NNN
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${yy}${mm}`;

  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .like("invoice_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  const invoiceNumber = `${prefix}-${seq}`;

  const issuedDate = now.toISOString().split("T")[0];
  const dueDateObj = new Date(now);
  dueDateObj.setDate(dueDateObj.getDate() + netDays);
  const dueDate = dueDateObj.toISOString().split("T")[0];

  // Use the first job as the primary job_id (DB column is NOT NULL)
  const primaryJobId = typedJobs[0].id;

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      job_id: primaryJobId,
      customer_id: customerId,
      subtotal,
      discount,
      tps_gst: tpsGst,
      tvq_qst: tvqQst,
      freight,
      total,
      status: "draft",
      issued_date: issuedDate,
      due_date: dueDate,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (insertError || !invoice) {
    return NextResponse.json(
      { error: "Failed to create invoice", details: insertError?.message },
      { status: 500 }
    );
  }

  // Store line_items in a separate update (metadata pattern via notes or
  // we can store in the invoice record). We use JSONB notes approach —
  // but the invoices table doesn't have a metadata column. Store line_items
  // info as structured JSON in the notes field prefix, OR better: update
  // the invoice with a supplementary query to store line_items.
  // For now, we embed line_items into the invoice response and store a
  // reference comment in notes if multi-job.
  if (typedJobs.length > 1) {
    const jobList = lineItems.map((li) => `${li.job_number} (${li.gmp_number})`).join(", ");
    const consolidatedNotes = notes
      ? `${notes}\n\nConsolidated invoice for jobs: ${jobList}`
      : `Consolidated invoice for jobs: ${jobList}`;

    await supabase
      .from("invoices")
      .update({ notes: consolidatedNotes })
      .eq("id", invoice.id);

    invoice.notes = consolidatedNotes;
  }

  return NextResponse.json(
    { ...invoice, line_items: lineItems },
    { status: 201 }
  );
}
