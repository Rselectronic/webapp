// ----------------------------------------------------------------------------
// Invoices page
//
// Two distinct blocks rendered top-to-bottom on the same page (mirrors the
// shipping page pattern):
//
//   1. **Pending Invoice** — JOBS where delivered_qty > invoiced_qty. The
//      operator selects one or more jobs from the SAME customer and clicks
//      "New Invoice" to open the multi-line dialog.
//
//   2. **Invoiced** — the existing invoices list, but each row now bundles
//      multiple jobs (via invoice_lines). The row collapses to one line that
//      shows N jobs / total; a chevron expands the line breakdown.
//
// KPI cards (Pending Outstanding, Aging, etc.) sit above both blocks.
// ----------------------------------------------------------------------------
import Link from "next/link";
import { DollarSign, Clock, AlertTriangle, AlertCircle, Download, CreditCard } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingInvoiceSection } from "@/components/invoices/pending-invoice-section";
import { InvoicedListSection } from "@/components/invoices/invoiced-list-section";
import { BulkPaymentButton } from "@/components/payments/bulk-payment-button";
import type { BulkOutstandingInvoice } from "@/components/payments/bulk-record-payment-dialog";
import { formatCurrency } from "@/lib/utils/format";

const STATUSES = ["all", "draft", "sent", "paid", "overdue"] as const;

interface SearchParams {
  status?: string;
}

// One row per job that has delivered-but-not-yet-invoiced quantity.
export interface PendingInvoiceJobRow {
  id: string;
  job_number: string;
  customer_id: string;
  customer_code: string;
  customer_company: string;
  gmp_number: string | null;
  board_name: string | null;
  quantity: number;
  delivered: number;
  invoiced: number;
  available: number;
  due_date: string | null;
  default_unit_price: number | null;
}

// One row per invoice — possibly multiple invoice_lines underneath.
export interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  effectiveStatus: string;
  total: number;
  subtotal: number;
  freight: number;
  discount: number;
  tps_gst: number;
  tvq_qst: number;
  issued_date: string | null;
  due_date: string | null;
  created_at: string;
  daysOutstanding: number | null;
  customer_code: string | null;
  customer_company: string | null;
  notes: string | null;
  lines: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    description: string | null;
    is_nre: boolean;
    job_id: string;
    job_number: string | null;
    gmp_number: string | null;
    board_name: string | null;
  }>;
  totalQty: number;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const supabase = await createClient();
  // Admin client for the cross-table reads — invoices are admin-gated and
  // the pending list reaches into shipment_lines + invoice_lines.
  const admin = createAdminClient();

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const toDate = (ts: number): string =>
    new Date(ts).toISOString().slice(0, 10);
  const nowDate = toDate(now);
  const d30Date = toDate(now - 30 * DAY_MS);
  const d60Date = toDate(now - 60 * DAY_MS);

  // -----------------------------------------------------------------
  // Block 1: Pending Invoice — jobs shipped but not fully invoiced
  // -----------------------------------------------------------------
  // A job is a candidate when SUM(shipment_lines.qty for shipped/in_transit
  // /delivered shipments) > SUM(invoice_lines.qty for non-cancelled
  // invoices). RS invoices once boards leave the floor — we don't wait
  // for proof of delivery — so 'shipping', 'delivered', and 'invoiced'
  // job statuses all qualify here. Earlier statuses (production etc.)
  // have nothing to invoice yet.
  const { data: deliveredJobs, error: deliveredJobsErr } = await admin
    .from("jobs")
    .select(
      "id, job_number, customer_id, quantity, due_date, status, nre_invoiced, customers(code, company_name), gmps(gmp_number, board_name), quotes!jobs_quote_id_fkey(pricing)"
    )
    .in("status", ["shipping", "delivered", "invoiced"])
    .order("due_date", { ascending: true, nullsFirst: false });
  if (deliveredJobsErr) {
    console.error("[invoices] deliveredJobs read failed", deliveredJobsErr.message);
  }

  type DeliveredJobRow = {
    id: string;
    job_number: string;
    customer_id: string;
    quantity: number;
    due_date: string | null;
    status: string;
    nre_invoiced: boolean | null;
    customers: { code: string; company_name: string } | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
    quotes: {
      pricing: {
        tiers?: {
          board_qty: number;
          subtotal: number;
          per_unit?: number;
          nre_charge?: number;
        }[];
      };
    } | null;
  };

  const deliveredTyped = (deliveredJobs ?? []) as unknown as DeliveredJobRow[];
  const deliveredJobIds = deliveredTyped.map((j) => j.id);

  const deliveredByJob = new Map<string, number>();
  const invoicedByJob = new Map<string, number>();

  if (deliveredJobIds.length > 0) {
    // Sum shipment_lines whose shipment has actually left — shipped,
    // in_transit, or delivered. 'pending' shipments (created but not
    // yet handed to the carrier) and 'cancelled' shipments don't count.
    const SHIPPED_STATUSES = new Set(["shipped", "in_transit", "delivered"]);
    const { data: shipLines, error: shipLinesErr } = await admin
      .from("shipment_lines")
      .select("job_id, quantity, shipments(status)")
      .in("job_id", deliveredJobIds);
    if (shipLinesErr) {
      console.error("[invoices] shipment_lines read failed", shipLinesErr.message);
    }
    for (const row of (shipLines ?? []) as Array<{
      job_id: string;
      quantity: number | null;
      shipments: { status: string } | { status: string }[] | null;
    }>) {
      const ship = Array.isArray(row.shipments) ? row.shipments[0] : row.shipments;
      if (!ship || !SHIPPED_STATUSES.has(ship.status)) continue;
      deliveredByJob.set(
        row.job_id,
        (deliveredByJob.get(row.job_id) ?? 0) + Number(row.quantity ?? 0)
      );
    }

    // Sum non-cancelled invoice_lines per job — boards only. NRE lines
    // (is_nre=true) carry qty=1 but are an engineering charge, not a
    // board: counting them would underreport "available to invoice".
    const { data: invLines, error: invLinesErr } = await admin
      .from("invoice_lines")
      .select("job_id, quantity, invoices(status)")
      .in("job_id", deliveredJobIds)
      .eq("is_nre", false);
    if (invLinesErr) {
      console.error("[invoices] invoice_lines read failed", invLinesErr.message);
    }
    for (const row of (invLines ?? []) as Array<{
      job_id: string;
      quantity: number | null;
      invoices: { status: string } | { status: string }[] | null;
    }>) {
      const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      if (inv?.status === "cancelled") continue;
      invoicedByJob.set(
        row.job_id,
        (invoicedByJob.get(row.job_id) ?? 0) + Number(row.quantity ?? 0)
      );
    }
  }

  const pendingRows: PendingInvoiceJobRow[] = deliveredTyped
    .map((j) => {
      const delivered = deliveredByJob.get(j.id) ?? 0;
      const invoiced = invoicedByJob.get(j.id) ?? 0;
      const available = Math.max(0, delivered - invoiced);

      // Default unit price — the tier's quoted per_unit AS-IS. This is the
      // customer-facing rate from the quote (e.g. $213.99 at the 50-tier on
      // TLAN0001R7); NRE is added on its own line on the first invoice, NOT
      // subtracted from this number. Tier resolution: exact match → highest
      // tier with board_qty ≤ job.quantity → smallest tier when the job is
      // below every break.
      const tiers = j.quotes?.pricing?.tiers;
      let defaultUnit: number | null = null;
      if (tiers?.length) {
        const exact = tiers.find((t) => t.board_qty === j.quantity);
        let matched = exact;
        if (!matched) {
          const sorted = [...tiers].sort((a, b) => a.board_qty - b.board_qty);
          for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i].board_qty <= j.quantity) {
              matched = sorted[i];
              break;
            }
          }
          if (!matched) matched = sorted[0];
        }
        if (matched.per_unit != null) {
          defaultUnit = Number(matched.per_unit);
        } else if (matched.board_qty > 0 && matched.subtotal != null) {
          defaultUnit = Number(matched.subtotal) / matched.board_qty;
        } else if (j.quantity > 0 && matched.subtotal != null) {
          defaultUnit = Number(matched.subtotal) / j.quantity;
        }
      }

      return {
        id: j.id,
        job_number: j.job_number,
        customer_id: j.customer_id,
        customer_code: j.customers?.code ?? "",
        customer_company: j.customers?.company_name ?? "",
        gmp_number: j.gmps?.gmp_number ?? null,
        board_name: j.gmps?.board_name ?? null,
        quantity: Number(j.quantity ?? 0),
        delivered,
        invoiced,
        available,
        due_date: j.due_date,
        default_unit_price:
          defaultUnit != null
            ? Math.round(defaultUnit * 10000) / 10000
            : null,
      };
    })
    .filter((r) => r.available > 0);

  // -----------------------------------------------------------------
  // Block 2: Existing invoices with their lines (multi-job aware)
  // -----------------------------------------------------------------
  // is_historic = false everywhere on this page. Historic invoices are
  // pre-web-app records imported for revenue continuity; they shouldn't
  // appear in the operational invoice list, the AR aging KPIs, or the
  // Outstanding total. The Reports → Revenue section deliberately
  // includes them (different concern: tax filing + FY totals).
  const [invoicesRes, currentAgingRes, over30AgingRes, over60AgingRes, totalUnpaidRes] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          `id, invoice_number, status, total, subtotal, freight, discount,
           tps_gst, tvq_qst, issued_date, due_date, created_at, notes,
           customers(code, company_name),
           invoice_lines(id, quantity, unit_price, line_total, description, is_nre, job_id,
             jobs(job_number, gmps(gmp_number, board_name)))`
        )
        .eq("is_historic", false)
        .order("created_at", { ascending: false })
        .limit(200),
      // Aging buckets are keyed off ISSUED_DATE (not due_date) so they
      // line up with the "Days Out" column in the table below — that
      // column is computed as `now − issued_date`. Earlier this page
      // bucketed by due_date, which produced confusing results when
      // payment terms varied (a 113-day-old Net 60 invoice shows "113d"
      // outstanding but is only 53 days past due, so it would miss the
      // 60+ tile). Same bucket = same column = no surprises.
      //
      // We also drop the `status='sent'` filter and use the same "not
      // paid, not cancelled" rule as Total Outstanding, so a draft
      // backdated invoice is counted in the aging tile that matches its
      // age. Otherwise the totals across tiles wouldn't reconcile to
      // Total Outstanding.
      supabase
        .from("invoices")
        .select("total")
        .eq("is_historic", false)
        .not("status", "in", '("paid","cancelled")')
        .gte("issued_date", d30Date),
      supabase
        .from("invoices")
        .select("total")
        .eq("is_historic", false)
        .not("status", "in", '("paid","cancelled")')
        .lt("issued_date", d30Date),
      supabase
        .from("invoices")
        .select("total")
        .eq("is_historic", false)
        .not("status", "in", '("paid","cancelled")')
        .lt("issued_date", d60Date),
      supabase
        .from("invoices")
        .select("total")
        .eq("is_historic", false)
        .not("status", "in", '("paid","cancelled")'),
    ]);
    void nowDate;

  const { data: rawInvoices, error: invoicesError } = invoicesRes;

  type RawInvoiceRow = {
    id: string;
    invoice_number: string;
    status: string;
    total: number | null;
    subtotal: number | null;
    freight: number | null;
    discount: number | null;
    tps_gst: number | null;
    tvq_qst: number | null;
    issued_date: string | null;
    due_date: string | null;
    created_at: string;
    notes: string | null;
    customers: { code: string; company_name: string } | null;
    invoice_lines: Array<{
      id: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      description: string | null;
      is_nre: boolean | null;
      job_id: string;
      jobs: {
        job_number: string;
        gmps:
          | { gmp_number: string; board_name: string | null }
          | { gmp_number: string; board_name: string | null }[]
          | null;
      } | null;
    }> | null;
  };

  const invoiceRows: InvoiceRow[] = ((rawInvoices ?? []) as unknown as RawInvoiceRow[]).map(
    (inv) => {
      const lines = (inv.invoice_lines ?? []).map((l) => {
        const gmp = Array.isArray(l.jobs?.gmps) ? l.jobs?.gmps?.[0] : l.jobs?.gmps;
        return {
          id: l.id,
          quantity: Number(l.quantity ?? 0),
          unit_price: Number(l.unit_price ?? 0),
          line_total: Number(l.line_total ?? 0),
          description: l.description ?? null,
          is_nre: Boolean(l.is_nre ?? false),
          job_id: l.job_id,
          job_number: l.jobs?.job_number ?? null,
          gmp_number: gmp?.gmp_number ?? null,
          board_name: gmp?.board_name ?? null,
        };
      });
      // Board count excludes NRE lines (qty=1 engineering charge, not a board).
      const totalQty = lines.reduce(
        (sum, l) => sum + (l.is_nre ? 0 : l.quantity),
        0
      );

      let daysOutstanding: number | null = null;
      let effectiveStatus = inv.status;
      if (
        inv.issued_date &&
        inv.status !== "paid" &&
        inv.status !== "cancelled"
      ) {
        daysOutstanding = Math.floor(
          (now - new Date(inv.issued_date).getTime()) / DAY_MS
        );
      }
      if (
        inv.status === "sent" &&
        inv.due_date &&
        new Date(inv.due_date).getTime() < now
      ) {
        effectiveStatus = "overdue";
      }

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        effectiveStatus,
        total: Number(inv.total ?? 0),
        subtotal: Number(inv.subtotal ?? 0),
        freight: Number(inv.freight ?? 0),
        discount: Number(inv.discount ?? 0),
        tps_gst: Number(inv.tps_gst ?? 0),
        tvq_qst: Number(inv.tvq_qst ?? 0),
        issued_date: inv.issued_date,
        due_date: inv.due_date,
        created_at: inv.created_at,
        daysOutstanding,
        customer_code: inv.customers?.code ?? null,
        customer_company: inv.customers?.company_name ?? null,
        notes: inv.notes,
        lines,
        totalQty,
      };
    }
  );

  const filteredInvoices =
    activeStatus === "all"
      ? invoiceRows
      : invoiceRows.filter((inv) => inv.effectiveStatus === activeStatus);

  // Outstanding invoices for the bulk-payment dialog. Anything not 'paid'
  // / 'cancelled' / 'draft', with a positive balance after subtracting any
  // existing payments. We need customer_id for customer scoping.
  const candidateInvoiceIds = invoiceRows
    .filter(
      (i) =>
        i.status !== "paid" &&
        i.status !== "cancelled" &&
        i.status !== "draft"
    )
    .map((i) => i.id);

  const paidByInvoice = new Map<string, number>();
  if (candidateInvoiceIds.length > 0) {
    const { data: payRows } = await admin
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", candidateInvoiceIds);
    for (const r of (payRows ?? []) as Array<{
      invoice_id: string;
      amount: number | null;
    }>) {
      const a = Number(r.amount ?? 0);
      if (!Number.isFinite(a)) continue;
      paidByInvoice.set(
        r.invoice_id,
        (paidByInvoice.get(r.invoice_id) ?? 0) + a
      );
    }
  }

  // Customer IDs aren't on InvoiceRow — pull them in one extra read keyed
  // by id. Cheap because we already have the list bounded.
  const customerIdByInvoice = new Map<string, string>();
  if (candidateInvoiceIds.length > 0) {
    const { data: invCustRows } = await admin
      .from("invoices")
      .select("id, customer_id")
      .in("id", candidateInvoiceIds);
    for (const r of (invCustRows ?? []) as Array<{
      id: string;
      customer_id: string;
    }>) {
      customerIdByInvoice.set(r.id, r.customer_id);
    }
  }

  const outstandingForBulk: BulkOutstandingInvoice[] = invoiceRows
    .filter((i) => candidateInvoiceIds.includes(i.id))
    .map((i) => {
      const paid = paidByInvoice.get(i.id) ?? 0;
      const balance = Math.max(0, Math.round((i.total - paid) * 100) / 100);
      return {
        id: i.id,
        invoice_number: i.invoice_number,
        customer_id: customerIdByInvoice.get(i.id) ?? "",
        customer_code: i.customer_code,
        customer_company: i.customer_company,
        total: i.total,
        paid: Math.round(paid * 100) / 100,
        balance,
        due_date: i.due_date,
        issued_date: i.issued_date,
      };
    })
    .filter((i) => i.balance > 0 && i.customer_id !== "");

  // KPIs
  const sumTotals = (rows: { total: number | null }[] | null | undefined) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.total ?? 0), 0);

  const currentAmount = sumTotals(currentAgingRes.data);
  const currentCount = currentAgingRes.data?.length ?? 0;
  const over30Amount = sumTotals(over30AgingRes.data);
  const over30Count = over30AgingRes.data?.length ?? 0;
  const over60Amount = sumTotals(over60AgingRes.data);
  const over60Count = over60AgingRes.data?.length ?? 0;
  const totalOutstandingAmount = sumTotals(totalUnpaidRes.data);
  const unpaidCount = totalUnpaidRes.data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500">
            {pendingRows.length} pending · {filteredInvoices.length} invoice
            {filteredInvoices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <BulkPaymentButton invoices={outstandingForBulk} />
          <Link href="/invoices/payments">
            <Button variant="outline" size="sm">
              <CreditCard className="mr-2 h-4 w-4" />
              Payment History
            </Button>
          </Link>
          <a href="/api/export?table=invoices" download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      {/* Aging KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Outstanding
            </CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalOutstandingAmount)}
            </p>
            <p className="text-xs text-gray-500">
              {unpaidCount} unpaid invoice{unpaidCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Current (&lt; 30d)
            </CardTitle>
            <Clock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {formatCurrency(currentAmount)}
            </p>
            <p className="text-xs text-gray-500">
              {currentCount} invoice{currentCount !== 1 ? "s" : ""} — outstanding under 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              30+ Days
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">
              {formatCurrency(over30Amount)}
            </p>
            <p className="text-xs text-gray-500">
              {over30Count} invoice{over30Count !== 1 ? "s" : ""} — outstanding 30+ days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              60+ Days
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">
              {formatCurrency(over60Amount)}
            </p>
            <p className="text-xs text-gray-500">
              {over60Count} invoice{over60Count !== 1 ? "s" : ""} — outstanding 60+ days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Invoice block — selectable jobs + multi-line dialog */}
      <PendingInvoiceSection rows={pendingRows} />

      {/* Status filter tabs apply only to the invoiced list below */}
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Link key={s} href={s === "all" ? "/invoices" : `/invoices?status=${s}`}>
            <Button
              variant={activeStatus === s ? "default" : "outline"}
              size="sm"
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          </Link>
        ))}
      </div>

      {/* Invoiced block — multi-job invoices with expandable lines */}
      <InvoicedListSection
        rows={filteredInvoices}
        hasError={Boolean(invoicesError)}
        activeStatus={activeStatus}
      />
    </div>
  );
}
