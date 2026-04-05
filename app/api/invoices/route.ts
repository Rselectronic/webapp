import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/invoices — List invoices with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
// POST /api/invoices — Create an invoice from a job
// ---------------------------------------------------------------------------

interface CreateInvoiceBody {
  job_id: string;
  freight?: number;
  discount?: number;
  notes?: string;
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
  const { job_id, freight = 0, discount = 0, notes } = body;

  if (!job_id) {
    return NextResponse.json(
      { error: "Missing required field: job_id" },
      { status: 400 }
    );
  }

  // Fetch job with quote pricing
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*, quotes(pricing, quantities)")
    .eq("id", job_id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const quote = job.quotes as unknown as {
    pricing: { tiers?: { board_qty: number; subtotal: number }[] };
    quantities: { qty_1: number; qty_2: number; qty_3: number; qty_4: number };
  } | null;

  if (!quote?.pricing?.tiers?.length) {
    return NextResponse.json(
      { error: "Job has no associated quote pricing" },
      { status: 400 }
    );
  }

  // Find matching tier for the job quantity
  const jobQty = job.quantity as number;
  const matchedTier =
    quote.pricing.tiers.find((t) => t.board_qty === jobQty) ??
    quote.pricing.tiers[0];

  const subtotal = matchedTier.subtotal;
  const tpsGst = Math.round(subtotal * 0.05 * 100) / 100;
  const tvqQst = Math.round(subtotal * 0.09975 * 100) / 100;
  const total =
    Math.round((subtotal + tpsGst + tvqQst + freight - discount) * 100) / 100;

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
  dueDateObj.setDate(dueDateObj.getDate() + 30);
  const dueDate = dueDateObj.toISOString().split("T")[0];

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      job_id,
      customer_id: job.customer_id,
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

  return NextResponse.json(invoice, { status: 201 });
}
