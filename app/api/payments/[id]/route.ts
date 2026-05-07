/**
 * /api/payments/[id] — edit + delete a single payment.
 *
 *   PATCH   amount / payment_date / method / reference / notes
 *           Re-runs the invoice-status bumper after the update so that
 *           shrinking a payment correctly reverts a 'paid' invoice to 'sent'
 *           when it's no longer fully covered.
 *
 *   DELETE  removes the payment row + re-runs the bumper.
 *
 * Both endpoints are admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getAuthUser } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  bumpInvoiceStatusFromPayments,
  getInvoiceBalance,
} from "@/lib/payments/totals";

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

// ===========================================================================
// PATCH /api/payments/[id]
// ===========================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can modify payments." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    amount?: number | string;
    payment_date?: string;
    method?: string;
    reference?: string | null;
    notes?: string | null;
  };

  // Fetch the current payment so we know which invoice to re-evaluate.
  const { data: existing, error: existErr } = await supabase
    .from("payments")
    .select("id, invoice_id, amount")
    .eq("id", id)
    .maybeSingle();
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (!Number.isFinite(a) || a <= 0) {
      return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
    }
    updates.amount = a;
  }

  if (body.payment_date !== undefined) {
    if (!body.payment_date) {
      return NextResponse.json(
        { error: "payment_date cannot be empty" },
        { status: 400 }
      );
    }
    updates.payment_date = body.payment_date;
  }

  if (body.method !== undefined) {
    if (!VALID_METHODS.includes(body.method as PaymentMethod)) {
      return NextResponse.json(
        { error: `method must be one of: ${VALID_METHODS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.method = body.method;
  }

  if (body.reference !== undefined) updates.reference = body.reference;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update. Allowed: amount, payment_date, method, reference, notes" },
      { status: 400 }
    );
  }

  // Over-payment guard — only relevant when amount changes upward.
  if (updates.amount !== undefined) {
    const balance = await getInvoiceBalance(supabase, existing.invoice_id);
    const otherPayments = balance.paid - Number(existing.amount ?? 0);
    const newPaidTotal =
      Math.round((otherPayments + Number(updates.amount)) * 100) / 100;
    if (newPaidTotal > balance.invoiceTotal + OVERPAY_TOLERANCE_CENTS) {
      const max = Math.max(0, balance.invoiceTotal - otherPayments);
      return NextResponse.json(
        {
          error:
            `Edit would exceed invoice total. Invoice ${balance.invoiceTotal.toFixed(
              2
            )}, other payments ${otherPayments.toFixed(2)}, max acceptable payment ${max.toFixed(
              2
            )}.`,
        },
        { status: 400 }
      );
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "Failed to update payment" },
      { status: 500 }
    );
  }

  // Cascade invoice status — forward AND reverse, since a downward edit
  // could un-pay a previously paid invoice.
  const admin = createAdminClient();
  await bumpInvoiceStatusFromPayments(
    admin,
    existing.invoice_id,
    user.id,
    `Payment ${id} updated`
  );

  return NextResponse.json(updated);
}

// ===========================================================================
// DELETE /api/payments/[id]
// ===========================================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can delete payments." },
      { status: 403 }
    );
  }

  const { data: existing, error: existErr } = await supabase
    .from("payments")
    .select("id, invoice_id")
    .eq("id", id)
    .maybeSingle();
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const { error: delErr } = await supabase.from("payments").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const admin = createAdminClient();
  await bumpInvoiceStatusFromPayments(
    admin,
    existing.invoice_id,
    user.id,
    `Payment ${id} deleted`
  );

  return NextResponse.json({ ok: true });
}
