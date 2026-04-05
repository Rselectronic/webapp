import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/invoices/[id] — Fetch a single invoice with joins
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Compute days_outstanding
  let days_outstanding: number | null = null;
  if (
    invoice.issued_date &&
    invoice.status !== "paid" &&
    invoice.status !== "cancelled"
  ) {
    const issued = new Date(invoice.issued_date).getTime();
    days_outstanding = Math.floor(
      (Date.now() - issued) / (1000 * 60 * 60 * 24)
    );
  }

  return NextResponse.json({ ...invoice, days_outstanding });
}

// ---------------------------------------------------------------------------
// PATCH /api/invoices/[id] — Update invoice status / payment info
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    status?: string;
    paid_date?: string;
    payment_method?: string;
    notes?: string;
  };

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    // Auto-set paid_date when marking as paid (if not explicitly provided)
    if (body.status === "paid" && !body.paid_date) {
      updates.paid_date = new Date().toISOString().split("T")[0];
    }
  }
  if (body.paid_date !== undefined) {
    updates.paid_date = body.paid_date;
  }
  if (body.payment_method !== undefined) {
    updates.payment_method = body.payment_method;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !invoice) {
    return NextResponse.json(
      { error: "Failed to update invoice", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(invoice);
}
