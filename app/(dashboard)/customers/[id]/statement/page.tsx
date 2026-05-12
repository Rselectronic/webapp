// ----------------------------------------------------------------------------
// Customer account statement
//
// Chronological ledger of invoices (charges) interleaved with payments
// (credits), plus aging buckets and a closing balance. Period selector
// scopes the view via ?from / ?to query params.
//
// Data is fetched directly from Supabase rather than going through the
// /api/customers/[id]/statement endpoint — server-component direct access
// is faster and avoids an extra HTTP hop.
// ----------------------------------------------------------------------------

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomerStatementTable,
  type LedgerEntry,
} from "@/components/payments/customer-statement-table";
import { StatementPeriodFY } from "@/components/customers/statement-period-fy";
import { formatCurrency, formatDate, todayMontreal } from "@/lib/utils/format";
import {
  fyBucketRanges,
  currentFYYear,
  type FYMode,
  type Period,
} from "@/lib/reports/revenue";

const METHOD_LABELS: Record<string, string> = {
  cheque: "Cheque",
  wire: "Wire",
  eft: "EFT",
  credit_card: "Credit Card",
};

interface AddressItem {
  label?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
}

function formatAddress(addr: AddressItem | null | undefined): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  if (addr.street) lines.push(addr.street);
  const cityLine = [addr.city, addr.province, addr.postal_code]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  if (addr.country && addr.country !== "Canada") lines.push(addr.country);
  return lines;
}

export default async function CustomerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Default the period to the CURRENT MONTH within the current Tax FY when
  // no URL params are present. Same FY model the reports page uses, so
  // the statement aligns with revenue reporting; the bucket dropdown in
  // the period selector picks up the matching bucket on first render.
  //
  // We also derive (period, mode, year) for the FY component's initial
  // state by finding which bucket of the current month/Tax FY contains
  // the URL `from` date. If the URL params don't fall in any current-FY
  // month bucket we leave the component to fall back to its own
  // defaults (Period=Month, FY=Tax, Year=current Tax FY).
  const defaultMode: FYMode = "tax";
  const defaultPeriod: Period = "month";
  const defaultYear = currentFYYear(defaultMode);
  const defaultBuckets = fyBucketRanges(defaultMode, defaultYear, defaultPeriod);
  const todayMtl = todayMontreal(); // "YYYY-MM-DD"
  const todayBucket = defaultBuckets.find(
    (b) => todayMtl >= b.start && todayMtl < b.end
  );
  const defaultFrom = todayBucket?.start ?? `${todayMtl.slice(0, 7)}-01`;
  // Bucket end is exclusive — convert to inclusive for the URL/page.
  const defaultTo = todayBucket
    ? (() => {
        const [y, m, d] = todayBucket.end.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        return dt.toISOString().slice(0, 10);
      })()
    : todayMtl;

  const from = sp.from ?? defaultFrom;
  const to = sp.to ?? defaultTo;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, code, company_name, payment_terms, billing_addresses, billing_address, contact_name, contact_email"
    )
    .eq("id", id)
    .single();

  if (error || !customer) notFound();

  // Pull invoices (excluding cancelled) and payments in parallel. We
  // include paid_date / payment_method so we can synthesise an offsetting
  // payment for invoices that are status='paid' but have no real payment
  // rows (historic imports — see migration 108). Without that synthesis
  // those invoices show as charges with no offsetting credit, inflating
  // both the running ledger balance and the closing total.
  let invoiceQuery = supabase
    .from("invoices")
    .select(
      "id, invoice_number, total, issued_date, due_date, status, paid_date, payment_method, notes"
    )
    .eq("customer_id", id)
    .neq("status", "cancelled");

  if (from) invoiceQuery = invoiceQuery.gte("issued_date", from);
  if (to) invoiceQuery = invoiceQuery.lte("issued_date", to);

  const [invoicesRes, paymentsRes] = await Promise.all([
    invoiceQuery,
    (async () => {
      // Pull payments via the customer's invoices. Use an inner join filter.
      // Migration 101 renamed payment_method → method and
      // reference_number → reference; the page uses the old names
      // internally so we alias on read.
      let q = supabase
        .from("payments")
        .select(
          "id, amount, payment_date, method, reference, notes, invoice_id, invoices!inner(invoice_number, customer_id)"
        )
        .eq("invoices.customer_id", id);
      if (from) q = q.gte("payment_date", from);
      if (to) q = q.lte("payment_date", to);
      return q;
    })(),
  ]);

  type InvoiceRow = {
    id: string;
    invoice_number: string;
    total: number | string | null;
    issued_date: string | null;
    due_date: string | null;
    status: string;
    paid_date: string | null;
    payment_method: string | null;
    notes: string | null;
  };
  type PaymentRow = {
    id: string;
    amount: number | string;
    payment_date: string;
    method: string;
    reference: string | null;
    notes: string | null;
    invoice_id: string;
    invoices:
      | { invoice_number: string; customer_id: string }
      | { invoice_number: string; customer_id: string }[]
      | null;
  };

  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const realPayments = (paymentsRes.data ?? []) as PaymentRow[];

  // Older invoices have notes like "[BACKDATED ... by user <uuid>]" because
  // an earlier API revision stamped the actor's UUID instead of their name.
  // Resolve those UUIDs to full names at render time so the ledger
  // description stays legible without rewriting history.
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const noteUserIds = new Set<string>();
  for (const inv of invoices) {
    if (!inv.notes) continue;
    for (const m of inv.notes.matchAll(UUID_RE)) noteUserIds.add(m[0]);
  }
  const userNameById = new Map<string, string>();
  if (noteUserIds.size > 0) {
    const { data: userRows } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", Array.from(noteUserIds));
    for (const u of (userRows ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      if (u.full_name) userNameById.set(u.id, u.full_name);
    }
  }
  function humanizeNote(notes: string | null): string {
    if (!notes) return "";
    let out = notes;
    for (const [id, name] of userNameById) {
      // collapse "user <uuid>" → "<name>" first, then any stray bare uuid.
      out = out.replace(new RegExp(`user\\s+${id}`, "gi"), name);
      out = out.replaceAll(id, name);
    }
    return out;
  }

  // ── Synthesize offsetting payments for status='paid' invoices that
  // aren't fully covered by real payment rows. Without this, an imported
  // historic invoice (status='paid' + zero payment rows) renders as a
  // charge with no offsetting credit and the running balance grows by
  // its full total. The synthetic credit balances the ledger to zero.
  //
  // The "is this invoice covered?" decision must look at ALL-TIME real
  // payments, not just the ones in the current window — otherwise
  // viewing Q1 of a year where the real payment landed in Q2 would see
  // realPaid=0 and synth a fake "historic_import" row even though a
  // real payment exists. We pull the all-time totals separately.
  const inWindowInvoiceIds = invoices.map((i) => i.id);
  let realPaidAllTimeByInvoice = new Map<string, number>();
  if (inWindowInvoiceIds.length > 0) {
    const { data: allTimePayRows } = await supabase
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", inWindowInvoiceIds);
    for (const r of (allTimePayRows ?? []) as Array<{
      invoice_id: string;
      amount: number | string | null;
    }>) {
      realPaidAllTimeByInvoice.set(
        r.invoice_id,
        (realPaidAllTimeByInvoice.get(r.invoice_id) ?? 0) +
          Number(r.amount ?? 0)
      );
    }
  } else {
    realPaidAllTimeByInvoice = new Map();
  }

  // Build synthetic payments only when the all-time real coverage is
  // genuinely incomplete. Then window-filter them so a synthetic row
  // dated outside [from, to] doesn't pollute the in-period ledger.
  const syntheticPayments: PaymentRow[] = [];
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const realPaid = realPaidAllTimeByInvoice.get(inv.id) ?? 0;
    const total = Number(inv.total ?? 0);
    const uncovered = Math.round((total - realPaid) * 100) / 100;
    if (uncovered <= 0.01) continue;
    const synthDate =
      inv.paid_date ?? inv.issued_date ?? todayMontreal();
    if (from && synthDate < from) continue;
    if (to && synthDate > to) continue;
    syntheticPayments.push({
      id: `synthetic-${inv.id}`,
      amount: uncovered,
      payment_date: synthDate,
      method: inv.payment_method ?? "historic_import",
      reference: null,
      notes: "Reconciled from invoice paid status",
      invoice_id: inv.id,
      invoices: { invoice_number: inv.invoice_number, customer_id: id },
    });
  }
  const payments: PaymentRow[] = [...realPayments, ...syntheticPayments];

  // Compute opening balance — sum of invoices/payments BEFORE the period
  // start. Pre-period paid invoices that lack real payment rows would
  // otherwise inflate the opening; we re-run the synthesis for that
  // window so the opening is consistent with the in-window logic.
  let openingBalance = 0;
  if (from) {
    const [openInvRes, openPayRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, total, status, issued_date, paid_date"
        )
        .eq("customer_id", id)
        .neq("status", "cancelled")
        .lt("issued_date", from),
      supabase
        .from("payments")
        .select("invoice_id, amount, invoices!inner(customer_id)")
        .eq("invoices.customer_id", id)
        .lt("payment_date", from),
    ]);

    type OpenInv = {
      id: string;
      total: number | string | null;
      status: string | null;
      issued_date: string | null;
      paid_date: string | null;
    };
    const openInvList = (openInvRes.data ?? []) as OpenInv[];
    const openPayList = (openPayRes.data ?? []) as Array<{
      invoice_id: string;
      amount: number | string | null;
    }>;

    const realPaidPre = new Map<string, number>();
    for (const r of openPayList) {
      realPaidPre.set(
        r.invoice_id,
        (realPaidPre.get(r.invoice_id) ?? 0) + Number(r.amount ?? 0)
      );
    }
    const openInvSum = openInvList.reduce(
      (s, r) => s + Number(r.total ?? 0),
      0
    );
    let openPaySum = openPayList.reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0
    );
    // Add synthetic offsets for paid pre-period invoices uncovered by
    // real payments — but only if their synthetic payment_date also
    // falls before `from`. paid_date < from is the boundary.
    for (const inv of openInvList) {
      if (inv.status !== "paid") continue;
      const realPaid = realPaidPre.get(inv.id) ?? 0;
      const uncovered = Number(inv.total ?? 0) - realPaid;
      if (uncovered <= 0.01) continue;
      const synthDate = inv.paid_date ?? inv.issued_date ?? "";
      if (synthDate && synthDate < from) {
        openPaySum += uncovered;
      }
    }
    openingBalance = openInvSum - openPaySum;
  }

  // Build ledger entries.
  const entries: LedgerEntry[] = [];
  for (const inv of invoices) {
    const date =
      inv.issued_date ??
      // fall back to whatever is least bad if no issued date
      todayMontreal();
    const humanized = humanizeNote(inv.notes);
    entries.push({
      kind: "invoice",
      id: inv.id,
      date,
      reference: inv.invoice_number,
      description: humanized ? humanized.slice(0, 80) : "Invoice",
      amount: Number(inv.total ?? 0),
    });
  }
  for (const p of payments) {
    const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
    const methodLabel = METHOD_LABELS[p.method] ?? p.method;
    const ref = p.reference
      ? `${methodLabel} · ${p.reference}`
      : methodLabel;
    entries.push({
      kind: "payment",
      id: p.id,
      date: p.payment_date,
      reference: ref,
      description: inv?.invoice_number
        ? `Payment for ${inv.invoice_number}${p.notes ? " — " + p.notes : ""}`
        : p.notes ?? "Payment",
      amount: Number(p.amount ?? 0),
    });
  }

  // Sort by date asc, then invoices before payments on same date so the
  // running balance reads naturally.
  entries.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === "invoice" ? -1 : 1;
    return 0;
  });

  // Closing balance.
  const totalCharges = entries
    .filter((e) => e.kind === "invoice")
    .reduce((s, e) => s + e.amount, 0);
  const totalPayments = entries
    .filter((e) => e.kind === "payment")
    .reduce((s, e) => s + e.amount, 0);
  const closingBalance = openingBalance + totalCharges - totalPayments;

  // ---------------------------------------------------------------------------
  // Aging — based on TODAY for outstanding (un-paid or partially paid) invoices
  // up to and including the period. Payments are applied oldest-invoice-first
  // to compute remaining balance per invoice.
  // ---------------------------------------------------------------------------
  // Pull every OUTSTANDING invoice up to `to`. Aging only ever measures
  // unpaid receivables, so paid + cancelled are dropped at the source.
  // (Without this, status='paid' historic imports — which have no actual
  // payment rows — would land in the 90+ bucket.)
  let outstandingInvQuery = supabase
    .from("invoices")
    .select("id, invoice_number, total, issued_date, due_date")
    .eq("customer_id", id)
    .not("status", "in", '("paid","cancelled")')
    .order("issued_date", { ascending: true });
  if (to) outstandingInvQuery = outstandingInvQuery.lte("issued_date", to);
  const { data: allInvoices } = await outstandingInvQuery;

  // All payments (regardless of period) so we can correctly net outstanding.
  const { data: allPayments } = await supabase
    .from("payments")
    .select("amount, invoice_id, invoices!inner(customer_id)")
    .eq("invoices.customer_id", id);

  const paidByInvoice = new Map<string, number>();
  for (const p of (allPayments ?? []) as Array<{
    amount: number | string;
    invoice_id: string;
  }>) {
    paidByInvoice.set(
      p.invoice_id,
      (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0)
    );
  }

  const today = new Date();
  const buckets = { current: 0, over30: 0, over60: 0, over90: 0 };
  const counts = { current: 0, over30: 0, over60: 0, over90: 0 };

  for (const inv of (allInvoices ?? []) as Array<{
    id: string;
    total: number | string | null;
    due_date: string | null;
    issued_date: string | null;
  }>) {
    const total = Number(inv.total ?? 0);
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const outstanding = total - paid;
    if (outstanding <= 0.01) continue;

    const ref = inv.due_date ?? inv.issued_date;
    const daysOverdue = ref
      ? Math.floor(
          (today.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    if (daysOverdue > 90) {
      buckets.over90 += outstanding;
      counts.over90 += 1;
    } else if (daysOverdue > 60) {
      buckets.over60 += outstanding;
      counts.over60 += 1;
    } else if (daysOverdue > 30) {
      buckets.over30 += outstanding;
      counts.over30 += 1;
    } else {
      buckets.current += outstanding;
      counts.current += 1;
    }
  }

  // Default billing address for header.
  const billingAddrs = (customer.billing_addresses as AddressItem[] | null) ?? [];
  const primaryBilling =
    billingAddrs.find((a) => a.is_default) ??
    billingAddrs[0] ??
    (customer.billing_address as AddressItem | null) ??
    null;
  const addrLines = formatAddress(primaryBilling);

  const pdfUrl = `/api/customers/${id}/statement/pdf${
    from || to
      ? `?${new URLSearchParams({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }).toString()}`
      : ""
  }`;

  return (
    <div className="space-y-6">
      <Link href={`/customers/${id}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Customer
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Account Statement
          </h2>
          <p className="mt-1 text-gray-700 dark:text-gray-300">
            <span className="font-medium">{customer.company_name}</span>{" "}
            <span className="font-mono text-gray-500">
              ({customer.code})
            </span>
          </p>
          {addrLines.map((l, i) => (
            <p key={i} className="text-sm text-gray-500">
              {l}
            </p>
          ))}
          <p className="mt-1 text-sm text-gray-500">
            Payment Terms: {customer.payment_terms ?? "Net 30"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <Link href={pdfUrl} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </Link>

          {/* Period selector — FY-aware (mirrors Reports → Revenue).
              Period (Month/Quarter/Semi/Annual) × FY (Calendar/Tax/Financial)
              × Year × bucket. Each control change navigates immediately. */}
          <StatementPeriodFY
            customerId={id}
            from={from ?? null}
            to={to ?? null}
            initialPeriod={defaultPeriod}
            initialMode={defaultMode}
            initialYear={defaultYear}
          />
        </div>
      </div>

      {/* Aging cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AgingCard
          label="Current"
          amount={buckets.current}
          count={counts.current}
          tone="green"
        />
        <AgingCard
          label="30+ days"
          amount={buckets.over30}
          count={counts.over30}
          tone="yellow"
        />
        <AgingCard
          label="60+ days"
          amount={buckets.over60}
          count={counts.over60}
          tone="orange"
        />
        <AgingCard
          label="90+ days"
          amount={buckets.over90}
          count={counts.over90}
          tone="red"
        />
      </div>

      {/* Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ledger
            {from || to ? (
              <span className="ml-2 text-sm font-normal text-gray-500">
                {from ? formatDate(from) : "Beginning"} →{" "}
                {to ? formatDate(to) : "Today"}
              </span>
            ) : (
              <span className="ml-2 text-sm font-normal text-gray-500">
                All-time
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerStatementTable
            entries={entries}
            openingBalance={openingBalance}
          />
        </CardContent>
      </Card>

      {/* Closing balance */}
      <div className="flex justify-end">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-gray-500">Closing balance</p>
          <p
            className={`mt-1 font-mono text-3xl font-bold ${
              closingBalance <= 0.01
                ? "text-green-600"
                : closingBalance > 0
                  ? "text-red-600"
                  : ""
            }`}
          >
            {formatCurrency(closingBalance)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {entries.filter((e) => e.kind === "invoice").length} invoice(s),{" "}
            {entries.filter((e) => e.kind === "payment").length} payment(s) in
            period
          </p>
        </div>
      </div>
    </div>
  );
}

function AgingCard({
  label,
  amount,
  count,
  tone,
}: {
  label: string;
  amount: number;
  count: number;
  tone: "green" | "yellow" | "orange" | "red";
}) {
  const toneClass = {
    green: "text-green-700 dark:text-green-400",
    yellow: "text-yellow-700 dark:text-yellow-400",
    orange: "text-orange-700 dark:text-orange-400",
    red: "text-red-700 dark:text-red-400",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${toneClass}`}>
        {formatCurrency(amount)}
      </p>
      <p className="text-xs text-gray-500">
        {count} invoice{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}
