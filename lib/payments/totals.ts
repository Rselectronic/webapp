/**
 * Payment totals + customer ledger helpers.
 *
 * After migration 101, an invoice can receive 1..N partial payments. The
 * invoice's `status` is derived from SUM(payments.amount) vs invoices.total
 * — no longer a single mark-paid event.
 *
 * This module is the source of truth for:
 *   - per-invoice paid / balance
 *   - per-customer ledger (charges = invoices, payments = receipts) with a
 *     running balance
 *   - per-customer aging buckets (current / 30 / 60 / 90)
 *   - the "bumper" that flips invoice.status forward to 'paid' when fully
 *     covered, and reverts it back to 'sent' when payments shrink below the
 *     invoice total.
 *
 * Shape mirrors lib/invoices/totals.ts and lib/shipments/totals.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayMontreal } from "@/lib/utils/format";

// Tolerance for floating-point comparisons against invoice totals.
// Anything within 1¢ of the invoice total counts as "fully paid".
const PAID_TOLERANCE_CENTS = 0.01;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceBalance = {
  paid: number;
  balance: number;
  invoiceTotal: number;
};

export type LedgerInvoiceEntry = {
  kind: "invoice";
  date: string; // YYYY-MM-DD (issued_date or created_at fallback)
  charges: number;
  payments: 0;
  balance: number; // running balance after this entry
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    total: number;
    issued_date: string | null;
    due_date: string | null;
  };
};

export type LedgerPaymentEntry = {
  kind: "payment";
  date: string;
  charges: 0;
  payments: number;
  balance: number;
  payment: {
    id: string;
    invoice_id: string;
    invoice_number: string | null;
    amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
  };
};

export type LedgerEntry = LedgerInvoiceEntry | LedgerPaymentEntry;

export type CustomerLedger = {
  entries: LedgerEntry[];
  openingBalance: number;
  closingBalance: number;
};

export type CustomerAging = {
  current: number;
  over30: number;
  over60: number;
  over90: number;
  total: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-invoice balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SUM(payments.amount) for an invoice + the remaining balance.
 *
 * If the invoice has been cancelled or doesn't exist we still return shaped
 * zeros so callers don't have to special-case the missing case.
 */
export async function getInvoiceBalance(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<InvoiceBalance> {
  const empty: InvoiceBalance = { paid: 0, balance: 0, invoiceTotal: 0 };
  if (!invoiceId) return empty;

  const [{ data: invoice, error: invErr }, { data: payments, error: payErr }] =
    await Promise.all([
      supabase.from("invoices").select("total, status").eq("id", invoiceId).maybeSingle(),
      supabase.from("payments").select("amount").eq("invoice_id", invoiceId),
    ]);

  if (invErr) {
    console.error("[payments/totals] invoice read failed", invErr.message);
  }
  if (payErr) {
    console.error("[payments/totals] payments read failed", payErr.message);
  }
  if (!invoice) return empty;

  const invoiceTotal = Number(invoice.total ?? 0);
  // Cancelled invoices contribute zero to AR. Payments still exist as data,
  // but the balance shouldn't read as "owed" — return paid as the recorded
  // sum and balance 0.
  const paid = (payments ?? []).reduce((acc: number, r: { amount: number | null }) => {
    const a = Number(r.amount ?? 0);
    return acc + (Number.isFinite(a) ? a : 0);
  }, 0);
  const paidRounded = Math.round(paid * 100) / 100;

  if (invoice.status === "cancelled") {
    return { paid: paidRounded, balance: 0, invoiceTotal };
  }

  const balance = Math.max(0, Math.round((invoiceTotal - paidRounded) * 100) / 100);
  return { paid: paidRounded, balance, invoiceTotal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a chronological ledger of charges (invoices) and credits (payments)
 * for a single customer. Optional `from` / `to` window the entries.
 *
 * Sort key: ISO date string ascending. Tiebreak: invoices sort before payments
 * on the same day — charges are recorded before receipts.
 *
 * Cancelled invoices are excluded from charges (they were voided). Payments
 * against a cancelled invoice are still surfaced — the money was actually
 * received and the customer needs to see it on their statement, even if the
 * matching charge has been voided.
 */
export async function getCustomerLedger(
  supabase: SupabaseClient,
  customerId: string,
  opts: { from?: string; to?: string } = {}
): Promise<CustomerLedger> {
  if (!customerId) {
    return { entries: [], openingBalance: 0, closingBalance: 0 };
  }
  const { from, to } = opts;

  // Pull all invoices for this customer (we filter cancelled below). We
  // also need paid_date / payment_method to synthesise offsetting payments
  // for invoices marked status='paid' that have no actual payment rows
  // (e.g. historic imports — see migration 108).
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total, issued_date, due_date, paid_date, payment_method, created_at"
    )
    .eq("customer_id", customerId)
    .order("issued_date", { ascending: true });

  if (invErr) {
    console.error("[payments/totals] ledger invoices read failed", invErr.message);
    return { entries: [], openingBalance: 0, closingBalance: 0 };
  }

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  let payments: Array<{
    id: string;
    invoice_id: string;
    amount: number;
    payment_date: string;
    method: string;
    reference: string | null;
    notes: string | null;
  }> = [];

  if (invoiceIds.length > 0) {
    const { data: pays, error: payErr } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, payment_date, method, reference, notes")
      .in("invoice_id", invoiceIds);

    if (payErr) {
      console.error("[payments/totals] ledger payments read failed", payErr.message);
    } else {
      payments = (pays ?? []) as typeof payments;
    }
  }

  // ── Synthesize offsetting payments for status='paid' invoices that
  // aren't fully covered by real payment rows. Without this, an imported
  // historic invoice (which has status='paid', payment_method='historic_
  // import', but zero rows in payments) would show as a charge on the
  // ledger with no offsetting credit, inflating the running balance and
  // the closing total. The synthetic credit balances the ledger to zero
  // for those records while still rendering them visibly so the customer
  // sees full history.
  const realPaidByInvoice = new Map<string, number>();
  for (const p of payments) {
    realPaidByInvoice.set(
      p.invoice_id,
      (realPaidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0)
    );
  }
  for (const inv of invoices ?? []) {
    if (inv.status !== "paid") continue;
    const realPaid = realPaidByInvoice.get(inv.id) ?? 0;
    const total = Number(inv.total ?? 0);
    const uncovered = Math.round((total - realPaid) * 100) / 100;
    if (uncovered <= PAID_TOLERANCE_CENTS) continue;
    const paymentDate =
      (inv.paid_date as string | null) ??
      (inv.issued_date as string | null) ??
      (inv.created_at ? String(inv.created_at).slice(0, 10) : todayMontreal());
    payments.push({
      id: `synthetic-${inv.id}`,
      invoice_id: inv.id,
      amount: uncovered,
      payment_date: paymentDate,
      method: (inv.payment_method as string | null) ?? "historic_import",
      reference: null,
      notes: "Reconciled from invoice paid status",
    });
  }

  const invoiceNumberById = new Map(
    (invoices ?? []).map((i) => [i.id, i.invoice_number as string | null])
  );

  // ---- Opening balance: everything strictly before `from` ----
  const openingBalance = (() => {
    if (!from) return 0;
    const fromDate = from;
    const chargesBefore = (invoices ?? [])
      .filter((i) => i.status !== "cancelled")
      .filter((i) => {
        const d = i.issued_date ?? null;
        return d != null && d < fromDate;
      })
      .reduce((s, i) => s + Number(i.total ?? 0), 0);
    const paymentsBefore = payments
      .filter((p) => p.payment_date < fromDate)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return Math.round((chargesBefore - paymentsBefore) * 100) / 100;
  })();

  // ---- Period entries ----
  const inWindow = (d: string | null): boolean => {
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  type Row =
    | {
        sortDate: string;
        kind: "invoice";
        idx: 0;
        invoice: NonNullable<typeof invoices>[number];
      }
    | { sortDate: string; kind: "payment"; idx: 1; payment: (typeof payments)[number] };

  const rows: Row[] = [];

  for (const inv of invoices ?? []) {
    if (inv.status === "cancelled") continue;
    const d = inv.issued_date ?? (inv.created_at ? String(inv.created_at).slice(0, 10) : null);
    if (!inWindow(d)) continue;
    rows.push({ sortDate: d as string, kind: "invoice", idx: 0, invoice: inv });
  }
  for (const pay of payments) {
    if (!inWindow(pay.payment_date)) continue;
    rows.push({ sortDate: pay.payment_date, kind: "payment", idx: 1, payment: pay });
  }

  rows.sort((a, b) => {
    if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? -1 : 1;
    return a.idx - b.idx; // invoices (0) before payments (1) on the same day
  });

  let running = openingBalance;
  const entries: LedgerEntry[] = [];
  for (const r of rows) {
    if (r.kind === "invoice") {
      const charges = Number(r.invoice.total ?? 0);
      running = Math.round((running + charges) * 100) / 100;
      entries.push({
        kind: "invoice",
        date: r.sortDate,
        charges,
        payments: 0,
        balance: running,
        invoice: {
          id: r.invoice.id,
          invoice_number: r.invoice.invoice_number,
          status: r.invoice.status,
          total: charges,
          issued_date: r.invoice.issued_date ?? null,
          due_date: r.invoice.due_date ?? null,
        },
      });
    } else {
      const amount = Number(r.payment.amount ?? 0);
      running = Math.round((running - amount) * 100) / 100;
      entries.push({
        kind: "payment",
        date: r.sortDate,
        charges: 0,
        payments: amount,
        balance: running,
        payment: {
          id: r.payment.id,
          invoice_id: r.payment.invoice_id,
          invoice_number: invoiceNumberById.get(r.payment.invoice_id) ?? null,
          amount,
          method: r.payment.method,
          reference: r.payment.reference,
          notes: r.payment.notes,
        },
      });
    }
  }

  return {
    entries,
    openingBalance,
    closingBalance: running,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AR aging buckets for one customer. Computed against today's date with the
 * remaining balance per non-cancelled invoice (not the invoice total — partial
 * payments correctly reduce the bucket).
 */
export async function getCustomerAging(
  supabase: SupabaseClient,
  customerId: string
): Promise<CustomerAging> {
  const empty: CustomerAging = { current: 0, over30: 0, over60: 0, over90: 0, total: 0 };
  if (!customerId) return empty;

  // Aging snapshots only outstanding receivables. status='paid' (including
  // historic imports — see migration 108) and 'cancelled' both contribute
  // zero to AR by definition; filter them at the source so we don't have
  // to special-case the missing-payment-rows case downstream.
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, total, issued_date, due_date, status")
    .eq("customer_id", customerId)
    .not("status", "in", '("paid","cancelled")');

  if (invErr || !invoices || invoices.length === 0) return empty;

  const ids = invoices.map((i) => i.id);
  const { data: payRows } = await supabase
    .from("payments")
    .select("invoice_id, amount")
    .in("invoice_id", ids);

  const paidByInvoice = new Map<string, number>();
  for (const r of (payRows ?? []) as Array<{ invoice_id: string; amount: number | null }>) {
    const a = Number(r.amount ?? 0);
    if (!Number.isFinite(a)) continue;
    paidByInvoice.set(r.invoice_id, (paidByInvoice.get(r.invoice_id) ?? 0) + a);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out: CustomerAging = { ...empty };

  for (const inv of invoices) {
    const total = Number(inv.total ?? 0);
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const balance = Math.round((total - paid) * 100) / 100;
    if (balance <= PAID_TOLERANCE_CENTS) continue; // fully (or over-)paid

    // Use due_date when available — that's what the customer agreed to.
    // Otherwise fall back to issued_date.
    const refDateStr = (inv.due_date ?? inv.issued_date) as string | null;
    if (!refDateStr) {
      out.current += balance;
      continue;
    }
    const refDate = new Date(refDateStr + "T00:00:00");
    const days = Math.floor((today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

    if (days <= 0) out.current += balance;
    else if (days <= 30) out.current += balance;
    else if (days <= 60) out.over30 += balance;
    else if (days <= 90) out.over60 += balance;
    else out.over90 += balance;
  }

  out.current = Math.round(out.current * 100) / 100;
  out.over30 = Math.round(out.over30 * 100) / 100;
  out.over60 = Math.round(out.over60 * 100) / 100;
  out.over90 = Math.round(out.over90 * 100) / 100;
  out.total = Math.round((out.current + out.over30 + out.over60 + out.over90) * 100) / 100;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status bumper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-evaluate an invoice's `status` based on its current SUM(payments.amount)
 * vs `invoices.total`. Reversible:
 *
 *   sent → paid   when paid_total >= invoice.total (within 1¢ tolerance)
 *                 paid_date is set to MAX(payments.payment_date)
 *   paid → sent   when paid_total < invoice.total - 1¢
 *                 paid_date is cleared
 *
 * Skips when:
 *   - invoice is in 'draft' or 'cancelled' (only triggers off 'sent'/'paid')
 *   - the change wouldn't move the status either way
 *
 * Writes through the supplied admin client so RLS doesn't get in the way of
 * server-internal cascades. Caller is responsible for passing a service-role
 * client when needed.
 */
export async function bumpInvoiceStatusFromPayments(
  admin: SupabaseClient,
  invoiceId: string,
  userId: string | null,
  reason: string
): Promise<{
  changed: boolean;
  oldStatus: string | null;
  newStatus: string | null;
  paidTotal: number;
  invoiceTotal: number;
}> {
  const noop = {
    changed: false,
    oldStatus: null as string | null,
    newStatus: null as string | null,
    paidTotal: 0,
    invoiceTotal: 0,
  };
  if (!invoiceId) return noop;

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, total, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !inv) return noop;

  const invoiceTotal = Number(inv.total ?? 0);
  const oldStatus = inv.status as string;

  // Only auto-cascade between 'sent' and 'paid'. 'draft' must be explicitly
  // sent first; 'cancelled' is terminal.
  if (oldStatus !== "sent" && oldStatus !== "paid") {
    return { ...noop, oldStatus, invoiceTotal };
  }

  const { data: pays } = await admin
    .from("payments")
    .select("amount, payment_date")
    .eq("invoice_id", invoiceId);

  const paidTotal = (pays ?? []).reduce(
    (s: number, r: { amount: number | null }) => s + Number(r.amount ?? 0),
    0
  );
  const paidRounded = Math.round(paidTotal * 100) / 100;

  // Forward: sent → paid
  if (oldStatus === "sent" && paidRounded + PAID_TOLERANCE_CENTS >= invoiceTotal && invoiceTotal > 0) {
    // paid_date = MAX(payment_date)
    const maxDate = (pays ?? [])
      .map((p) => p.payment_date as string)
      .filter(Boolean)
      .sort()
      .pop() ?? todayMontreal();

    const { error: updErr } = await admin
      .from("invoices")
      .update({
        status: "paid",
        paid_date: maxDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    if (updErr) {
      console.warn("[payments/totals] bump → paid failed", updErr.message);
      return { ...noop, oldStatus, paidTotal: paidRounded, invoiceTotal };
    }
    // Best-effort note for traceability. Triggered audit log writes are owned
    // by migration 102; we don't log here ourselves.
    void userId;
    void reason;
    return {
      changed: true,
      oldStatus,
      newStatus: "paid",
      paidTotal: paidRounded,
      invoiceTotal,
    };
  }

  // Reverse: paid → sent
  if (oldStatus === "paid" && paidRounded + PAID_TOLERANCE_CENTS < invoiceTotal) {
    const { error: updErr } = await admin
      .from("invoices")
      .update({
        status: "sent",
        paid_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    if (updErr) {
      console.warn("[payments/totals] revert → sent failed", updErr.message);
      return { ...noop, oldStatus, paidTotal: paidRounded, invoiceTotal };
    }
    return {
      changed: true,
      oldStatus,
      newStatus: "sent",
      paidTotal: paidRounded,
      invoiceTotal,
    };
  }

  return { ...noop, oldStatus, paidTotal: paidRounded, invoiceTotal };
}
