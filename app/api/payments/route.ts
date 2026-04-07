import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/payments — List payments with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const invoiceId = url.searchParams.get("invoice_id");

  let query = supabase
    .from("payments")
    .select("*, invoices(invoice_number, total, customer_id, customers(code, company_name))")
    .order("payment_date", { ascending: false })
    .limit(200);

  if (invoiceId) query = query.eq("invoice_id", invoiceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/payments — Record a payment
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { invoice_id, amount, payment_date, payment_method, reference_number, notes } = body;

  if (!invoice_id || !amount || !payment_date || !payment_method) {
    return NextResponse.json(
      { error: "invoice_id, amount, payment_date, and payment_method are required" },
      { status: 400 }
    );
  }

  const validMethods = ["cheque", "wire", "eft", "credit_card"];
  if (!validMethods.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of: ${validMethods.join(", ")}` },
      { status: 400 }
    );
  }

  if (parseFloat(amount) <= 0) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  // Insert the payment
  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      invoice_id,
      amount: parseFloat(amount),
      payment_date,
      payment_method,
      reference_number: reference_number || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Calculate total paid for this invoice
  const { data: allPayments } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoice_id);

  const totalPaid = (allPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  // Get invoice total to check if fully paid
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total, status")
    .eq("id", invoice_id)
    .single();

  if (invoice && totalPaid >= Number(invoice.total)) {
    // Mark invoice as paid
    await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: payment_date,
        payment_method,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);
  }

  return NextResponse.json(
    { ...payment, total_paid: totalPaid, invoice_total: Number(invoice?.total ?? 0) },
    { status: 201 }
  );
}
