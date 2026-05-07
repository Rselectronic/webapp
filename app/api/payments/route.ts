/**
 * /api/payments — record + list payments against invoices.
 *
 * Migration 101 introduced a true ledger model: an invoice can receive 1..N
 * partial payments and `invoices.status` is derived from
 * SUM(payments.amount) >= invoices.total.
 *
 *   POST   create one payment, then re-evaluate the invoice's status
 *   GET    list payments for a given invoice (most recent first)
 *
 * Both endpoints are admin-only — payments are financial data.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getAuthUser } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  bumpInvoiceStatusFromPayments,
  getInvoiceBalance,
} from "@/lib/payments/totals";
import { resolveFxRate } from "@/lib/fx/boc";

const VALID_METHODS = [
  "cheque",
  "wire",
  "eft",
  "credit_card",
  "cash",
  "other",
] as const;

type PaymentMethod = (typeof VALID_METHODS)[number];

// ¢ tolerance for over-payment guard. Anything more than 1¢ over the invoice
// total is rejected so we don't silently drive the balance negative. True
// over-payment / credit balances are deferred to v2.
const OVERPAY_TOLERANCE_CENTS = 0.01;

// ===========================================================================
// GET /api/payments?invoice_id=…
// ===========================================================================
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can view payments." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const invoiceId = url.searchParams.get("invoice_id");
  if (!invoiceId) {
    return NextResponse.json(
      { error: "invoice_id query param is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payments: data ?? [] });
}

// ===========================================================================
// POST /api/payments
// ===========================================================================
export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can record payments." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    invoice_id?: string;
    amount?: number | string;
    payment_date?: string;
    method?: string;
    reference?: string | null;
    notes?: string | null;
  };

  const { invoice_id, amount, payment_date, method, reference, notes } = body;

  if (!invoice_id || amount === undefined || !payment_date || !method) {
    return NextResponse.json(
      { error: "invoice_id, amount, payment_date, and method are required" },
      { status: 400 }
    );
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }

  if (!VALID_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json(
      { error: `method must be one of: ${VALID_METHODS.join(", ")}` },
      { status: 400 }
    );
  }

  // Over-payment guard — sum of (existing payments) + this one must not
  // exceed invoice.total + 1¢.
  const balance = await getInvoiceBalance(supabase, invoice_id);
  if (balance.invoiceTotal === 0) {
    return NextResponse.json(
      { error: "Invoice not found or has no total" },
      { status: 404 }
    );
  }
  const newPaidTotal = Math.round((balance.paid + amt) * 100) / 100;
  if (newPaidTotal > balance.invoiceTotal + OVERPAY_TOLERANCE_CENTS) {
    const max = Math.max(0, balance.invoiceTotal - balance.paid);
    return NextResponse.json(
      {
        error:
          `Payment would exceed invoice total. Invoice ${balance.invoiceTotal.toFixed(
            2
          )}, already paid ${balance.paid.toFixed(2)}, max acceptable payment ${max.toFixed(2)}.`,
      },
      { status: 400 }
    );
  }

  // Payment currency = invoice currency. You can't partially pay a USD
  // invoice in CAD without booking the conversion separately. FX rate
  // captured AT PAYMENT DATE — the difference vs. invoice issue-date rate
  // is the realised FX gain/loss surfaced on the invoice detail.
  const { data: invForCurrency } = await supabase
    .from("invoices")
    .select("currency")
    .eq("id", invoice_id)
    .maybeSingle();
  const paymentCurrency =
    (invForCurrency?.currency as "CAD" | "USD" | undefined) === "USD"
      ? "USD"
      : "CAD";
  const fx = await resolveFxRate(paymentCurrency, null);

  // Insert via the user's session client so RLS still gates the write.
  const { data: payment, error: insErr } = await supabase
    .from("payments")
    .insert({
      invoice_id,
      amount: amt,
      payment_date,
      method,
      reference: reference ?? null,
      notes: notes ?? null,
      recorded_by: user.id,
      currency: paymentCurrency,
      fx_rate_to_cad: fx.rate,
    })
    .select("*")
    .single();

  if (insErr || !payment) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to record payment" },
      { status: 500 }
    );
  }

  // Cascade invoice status (sent → paid). Service role for write to bypass RLS.
  const admin = createAdminClient();
  await bumpInvoiceStatusFromPayments(
    admin,
    invoice_id,
    user.id,
    `Payment ${payment.id} recorded`
  );

  return NextResponse.json(payment, { status: 201 });
}
