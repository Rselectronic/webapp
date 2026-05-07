/**
 * /api/payments/bulk — record one customer payment that covers N invoices.
 *
 * Body shape:
 *   {
 *     payment_date: "YYYY-MM-DD",
 *     method: "cheque" | "wire" | "eft" | "credit_card" | "cash" | "other",
 *     reference?: string,
 *     notes?: string,
 *     allocations: [{ invoice_id: string, amount: number }, ...]
 *   }
 *
 * Each allocation becomes its own row in `payments`, sharing the same
 * date/method/reference. The shared reference ties them back to the single
 * cheque/wire on the customer statement.
 *
 * Validation up front (before any inserts):
 *   - customer must be the same across all invoices in the allocation set
 *   - each allocation amount must be > 0
 *   - SUM(allocation.amount) for an invoice + already-paid must not exceed
 *     invoice.total + 1¢ tolerance
 *
 * On any failure, no rows are inserted (best-effort rollback: if a later
 * insert fails after earlier ones succeeded, the earlier rows are deleted).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getAuthUser } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { bumpInvoiceStatusFromPayments } from "@/lib/payments/totals";
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

const OVERPAY_TOLERANCE_CENTS = 0.01;

interface Allocation {
  invoice_id: string;
  amount: number;
}

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
    payment_date?: string;
    method?: string;
    reference?: string | null;
    notes?: string | null;
    allocations?: Array<{ invoice_id?: string; amount?: number | string }>;
  };

  const { payment_date, method, reference, notes, allocations } = body;

  if (!payment_date || !method) {
    return NextResponse.json(
      { error: "payment_date and method are required" },
      { status: 400 }
    );
  }
  if (!VALID_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json(
      { error: `method must be one of: ${VALID_METHODS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json(
      { error: "allocations must be a non-empty array" },
      { status: 400 }
    );
  }

  // Normalize + validate each allocation row.
  const cleaned: Allocation[] = [];
  for (const a of allocations) {
    if (!a?.invoice_id) {
      return NextResponse.json(
        { error: "every allocation needs an invoice_id" },
        { status: 400 }
      );
    }
    const amt = Number(a.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json(
        { error: `allocation for ${a.invoice_id} must have amount > 0` },
        { status: 400 }
      );
    }
    cleaned.push({ invoice_id: a.invoice_id, amount: Math.round(amt * 100) / 100 });
  }

  // Group amounts by invoice (in case the UI sent duplicates) so the
  // overpay check sees the full per-invoice ask.
  const totalByInvoice = new Map<string, number>();
  for (const c of cleaned) {
    totalByInvoice.set(
      c.invoice_id,
      (totalByInvoice.get(c.invoice_id) ?? 0) + c.amount
    );
  }
  const invoiceIds = Array.from(totalByInvoice.keys());

  // Pull invoice + existing payments in two queries.
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, customer_id, total, status, invoice_number, currency")
    .in("id", invoiceIds);
  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }
  if (!invoices || invoices.length !== invoiceIds.length) {
    return NextResponse.json(
      { error: "one or more invoices not found" },
      { status: 404 }
    );
  }

  // All invoices must belong to the same customer — bulk payment is a
  // single cheque from a single customer.
  const customerIds = new Set(invoices.map((i) => i.customer_id));
  if (customerIds.size > 1) {
    return NextResponse.json(
      { error: "all invoices must belong to the same customer" },
      { status: 400 }
    );
  }

  // Bulk payment must also share a single currency — you can't bundle a
  // USD invoice and a CAD invoice under one cheque (different bank flow,
  // different FX). If a customer has both, they need separate bulk
  // payments.
  const currencies = new Set(
    invoices.map((i) => (i.currency as string | null) ?? "CAD")
  );
  if (currencies.size > 1) {
    return NextResponse.json(
      {
        error:
          "all invoices must share the same currency (mix of CAD and USD detected). Record CAD and USD payments separately.",
      },
      { status: 400 }
    );
  }
  const paymentCurrency =
    (Array.from(currencies)[0] as "CAD" | "USD") === "USD" ? "USD" : "CAD";
  const fx = await resolveFxRate(paymentCurrency, null);

  // No paying against cancelled invoices in bulk.
  const cancelled = invoices.find((i) => i.status === "cancelled");
  if (cancelled) {
    return NextResponse.json(
      { error: `invoice ${cancelled.invoice_number} is cancelled` },
      { status: 400 }
    );
  }

  const { data: existingPays, error: payErr } = await supabase
    .from("payments")
    .select("invoice_id, amount")
    .in("invoice_id", invoiceIds);
  if (payErr) {
    return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  const paidByInvoice = new Map<string, number>();
  for (const p of existingPays ?? []) {
    const a = Number(p.amount ?? 0);
    if (!Number.isFinite(a)) continue;
    paidByInvoice.set(
      p.invoice_id as string,
      (paidByInvoice.get(p.invoice_id as string) ?? 0) + a
    );
  }

  // Overpay guard per invoice.
  for (const inv of invoices) {
    const total = Number(inv.total ?? 0);
    const alreadyPaid = paidByInvoice.get(inv.id) ?? 0;
    const adding = totalByInvoice.get(inv.id) ?? 0;
    const newTotal = Math.round((alreadyPaid + adding) * 100) / 100;
    if (newTotal > total + OVERPAY_TOLERANCE_CENTS) {
      const max = Math.max(0, total - alreadyPaid);
      return NextResponse.json(
        {
          error:
            `Allocation to ${inv.invoice_number} ($${adding.toFixed(2)}) would exceed invoice total. ` +
            `Already paid $${alreadyPaid.toFixed(2)} of $${total.toFixed(2)} — max acceptable $${max.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }
  }

  // Insert all rows. We don't have a transaction here, so on partial failure
  // we roll back by deleting the rows we inserted before the error.
  const inserted: string[] = [];
  for (const c of cleaned) {
    const { data: row, error: insErr } = await supabase
      .from("payments")
      .insert({
        invoice_id: c.invoice_id,
        amount: c.amount,
        payment_date,
        method,
        reference: reference ?? null,
        notes: notes ?? null,
        recorded_by: user.id,
        currency: paymentCurrency,
        fx_rate_to_cad: fx.rate,
      })
      .select("id")
      .single();

    if (insErr || !row) {
      // Roll back what we did insert.
      if (inserted.length > 0) {
        const admin = createAdminClient();
        await admin.from("payments").delete().in("id", inserted);
      }
      return NextResponse.json(
        { error: insErr?.message ?? "Failed to record payment" },
        { status: 500 }
      );
    }
    inserted.push(row.id as string);
  }

  // Bump invoice statuses for every affected invoice.
  const admin = createAdminClient();
  for (const id of invoiceIds) {
    await bumpInvoiceStatusFromPayments(
      admin,
      id,
      user.id,
      `Bulk payment ${reference ?? ""} recorded`
    );
  }

  return NextResponse.json(
    { payment_ids: inserted, invoice_ids: invoiceIds },
    { status: 201 }
  );
}
