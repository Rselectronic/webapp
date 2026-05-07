// ----------------------------------------------------------------------------
// Customer account statement PDF
//
// Same data shape as /customers/[id]/statement: a chronological ledger of
// invoices interleaved with payments, plus aging buckets and closing balance.
// Rendered to A4 using the shared lib/pdf/helpers letterhead.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  A4_WIDTH,
  A4_HEIGHT,
  CONTENT_WIDTH,
  MARGIN,
  COLOR_DARK,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_BORDER,
  COLOR_BG_STRIP,
  COLOR_LIGHT,
  createPdfDoc,
  drawHeader,
  drawFooter,
  drawTableHeaderRow,
  fmtDate,
  truncate,
} from "@/lib/pdf/helpers";
import type { PDFPage } from "pdf-lib";
import { todayMontreal } from "@/lib/utils/format";

const METHOD_LABELS: Record<string, string> = {
  cheque: "Cheque",
  wire: "Wire",
  eft: "EFT",
  credit_card: "Credit Card",
};

interface AddressItem {
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(n);
}

export async function GET(
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

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, code, company_name, payment_terms, billing_addresses, billing_address, contact_name, contact_email"
    )
    .eq("id", id)
    .single();

  if (error || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Invoices in period. We pull status / paid_date / payment_method so we
  // can synthesise an offsetting payment for status='paid' invoices that
  // have no real payment rows (historic imports — see migration 108).
  // Without that, those invoices render as charges with no offsetting
  // credit, inflating both the running ledger balance and the closing
  // total. Same fix that was applied on the page-side and in
  // lib/payments/totals.ts.
  let invQ = supabase
    .from("invoices")
    .select(
      "id, invoice_number, total, issued_date, due_date, status, paid_date, payment_method, notes"
    )
    .eq("customer_id", id)
    .neq("status", "cancelled");
  if (from) invQ = invQ.gte("issued_date", from);
  if (to) invQ = invQ.lte("issued_date", to);

  // Migration 101 column names: method / reference (not payment_method /
  // reference_number). The PDF uses old names internally — alias on read.
  let payQ = supabase
    .from("payments")
    .select(
      "id, amount, payment_date, method, reference, notes, invoice_id, invoices!inner(invoice_number, customer_id)"
    )
    .eq("invoices.customer_id", id);
  if (from) payQ = payQ.gte("payment_date", from);
  if (to) payQ = payQ.lte("payment_date", to);

  const [invRes, payRes] = await Promise.all([invQ, payQ]);

  type Inv = {
    id: string;
    invoice_number: string;
    total: number | string | null;
    issued_date: string | null;
    due_date: string | null;
    status: string | null;
    paid_date: string | null;
    payment_method: string | null;
    notes: string | null;
  };
  type Pay = {
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

  const invoices = (invRes.data ?? []) as Inv[];
  const realPayments = (payRes.data ?? []) as Pay[];

  // ── Synthesize offsetting payments for in-window status='paid' invoices
  // not fully covered by real payments. The "is it covered?" check must
  // look at ALL-TIME real payments, not just the windowed ones — viewing
  // Q1 of a year where the real payment landed in Q2 would otherwise see
  // realPaid=0 and synth a fake row even though a real payment exists.
  const inWindowInvoiceIds = invoices.map((i) => i.id);
  const realPaidAllTimeByInvoice = new Map<string, number>();
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
  }

  // Synthetic rows are also window-filtered before reaching the ledger so
  // a synth dated outside [from, to] doesn't pollute the in-period view.
  const syntheticPayments: Pay[] = [];
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
  const payments: Pay[] = [...realPayments, ...syntheticPayments];

  // Opening balance — pull pre-period invoices with the fields we need
  // to do the same synthesis, so the carried balance doesn't include the
  // total of historic-paid invoices that have no payment rows.
  let openingBalance = 0;
  if (from) {
    const [oi, op] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, total, status, issued_date, paid_date")
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
    const openInvList = (oi.data ?? []) as OpenInv[];
    const openPayList = (op.data ?? []) as Array<{
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
    const oiSum = openInvList.reduce(
      (s, r) => s + Number(r.total ?? 0),
      0
    );
    let opSum = openPayList.reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0
    );
    for (const inv of openInvList) {
      if (inv.status !== "paid") continue;
      const realPaid = realPaidPre.get(inv.id) ?? 0;
      const uncovered = Number(inv.total ?? 0) - realPaid;
      if (uncovered <= 0.01) continue;
      const synthDate = inv.paid_date ?? inv.issued_date ?? "";
      if (synthDate && synthDate < from) {
        opSum += uncovered;
      }
    }
    openingBalance = oiSum - opSum;
  }

  // Build entries.
  type Entry = {
    kind: "invoice" | "payment";
    date: string;
    reference: string;
    description: string;
    charges: number;
    pays: number;
  };
  const entries: Entry[] = [];
  for (const inv of invoices) {
    entries.push({
      kind: "invoice",
      date: inv.issued_date ?? "",
      reference: inv.invoice_number,
      description: (inv.notes ?? "Invoice").slice(0, 60),
      charges: Number(inv.total ?? 0),
      pays: 0,
    });
  }
  for (const p of payments) {
    const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
    const methodLabel = METHOD_LABELS[p.method] ?? p.method;
    const ref = p.reference
      ? `${methodLabel} #${p.reference}`
      : methodLabel;
    entries.push({
      kind: "payment",
      date: p.payment_date,
      reference: ref,
      description: inv?.invoice_number
        ? `Payment for ${inv.invoice_number}`
        : "Payment",
      charges: 0,
      pays: Number(p.amount ?? 0),
    });
  }
  entries.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === "invoice" ? -1 : 1;
    return 0;
  });

  const totalCharges = entries.reduce((s, e) => s + e.charges, 0);
  const totalPays = entries.reduce((s, e) => s + e.pays, 0);
  const closingBalance = openingBalance + totalCharges - totalPays;

  // Aging — outstanding receivables only. status='paid' (historic
  // imports included) and 'cancelled' both contribute zero to AR by
  // definition; filter them at the source.
  let outQ = supabase
    .from("invoices")
    .select("id, total, issued_date, due_date")
    .eq("customer_id", id)
    .not("status", "in", '("paid","cancelled")');
  if (to) outQ = outQ.lte("issued_date", to);
  const [{ data: outInv }, { data: outPay }] = await Promise.all([
    outQ,
    supabase
      .from("payments")
      .select("amount, invoice_id, invoices!inner(customer_id)")
      .eq("invoices.customer_id", id),
  ]);

  const paidByInv = new Map<string, number>();
  for (const p of (outPay ?? []) as Array<{
    amount: number | string;
    invoice_id: string;
  }>) {
    paidByInv.set(
      p.invoice_id,
      (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0)
    );
  }

  const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
  const today = new Date();
  for (const inv of (outInv ?? []) as Array<{
    id: string;
    total: number | string | null;
    issued_date: string | null;
    due_date: string | null;
  }>) {
    const total = Number(inv.total ?? 0);
    const paid = paidByInv.get(inv.id) ?? 0;
    const remaining = total - paid;
    if (remaining <= 0.01) continue;
    const ref = inv.due_date ?? inv.issued_date;
    const days = ref
      ? Math.floor(
          (today.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;
    if (days > 90) aging.d90 += remaining;
    else if (days > 60) aging.d60 += remaining;
    else if (days > 30) aging.d30 += remaining;
    else aging.current += remaining;
  }

  // Address.
  const billing = (customer.billing_addresses as AddressItem[] | null) ?? [];
  const primary =
    billing.find((a) => a.is_default) ??
    billing[0] ??
    (customer.billing_address as AddressItem | null) ??
    null;
  const addrLines: string[] = [];
  if (primary?.street) addrLines.push(primary.street);
  const cityLine = [primary?.city, primary?.province, primary?.postal_code]
    .filter(Boolean)
    .join(", ");
  if (cityLine) addrLines.push(cityLine);
  if (primary?.country && primary.country !== "Canada") {
    addrLines.push(primary.country);
  }

  // ---------------------------------------------------------------------------
  // Build PDF
  // ---------------------------------------------------------------------------
  const { doc, fonts, logo } = await createPdfDoc();
  const { regular, bold } = fonts;

  const periodStr = `${from ? fmtDate(from) : "Beginning"} - ${to ? fmtDate(to) : fmtDate(new Date().toISOString())}`;
  const subtitle = [
    `Statement Date: ${fmtDate(new Date().toISOString())}`,
    `Period: ${periodStr}`,
  ];

  // Page layout — anchored to the right edge of the table walking
  // leftward so the Balance column always sits inside CONTENT_WIDTH.
  // The previous static offsets had Balance ending at MARGIN+549,
  // overflowing CONTENT_WIDTH (515) by ~34pt — the header label drew
  // off-page and the table looked broken.
  //
  // Right-anchored numeric columns (right edge = sum of widths to the
  // right):
  //   bal      66 → ends at CONTENT_WIDTH (515)
  //   pays     58 → ends at 449
  //   charges  58 → ends at 391
  // Left-anchored text columns walk forward from MARGIN:
  //   date 50, type 45, ref 80, desc fills the gap to charges.
  const W_DATE = 50;
  const W_TYPE = 45;
  const W_REF = 80;
  const W_CHARGES = 58;
  const W_PAYS = 58;
  const W_BAL = 66;
  const right = CONTENT_WIDTH;
  const balX = right - W_BAL;
  const paysX = balX - W_PAYS;
  const chargesX = paysX - W_CHARGES;
  const descX = 4 + W_DATE + W_TYPE + W_REF;
  const W_DESC = chargesX - descX - 4; // 4pt right gutter before Charges
  const COLS = {
    date: { x: MARGIN + 4, w: W_DATE },
    type: { x: MARGIN + 4 + W_DATE, w: W_TYPE },
    ref: { x: MARGIN + 4 + W_DATE + W_TYPE, w: W_REF },
    desc: { x: MARGIN + descX, w: W_DESC },
    charges: { x: MARGIN + chargesX, w: W_CHARGES },
    pays: { x: MARGIN + paysX, w: W_PAYS },
    bal: { x: MARGIN + balX, w: W_BAL },
  };
  const COL_DEFS = [
    { label: "Date", x: COLS.date.x, width: COLS.date.w },
    { label: "Type", x: COLS.type.x, width: COLS.type.w },
    { label: "Reference", x: COLS.ref.x, width: COLS.ref.w },
    { label: "Description", x: COLS.desc.x, width: COLS.desc.w },
    {
      label: "Charges",
      x: COLS.charges.x,
      width: COLS.charges.w,
      align: "right" as const,
    },
    {
      label: "Payments",
      x: COLS.pays.x,
      width: COLS.pays.w,
      align: "right" as const,
    },
    {
      label: "Balance",
      x: COLS.bal.x,
      width: COLS.bal.w,
      align: "right" as const,
    },
  ];

  const customerName = customer.company_name as string;
  const customerCode = customer.code as string;

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = drawHeader(page, fonts, "ACCOUNT STATEMENT", subtitle, logo);

  // Customer block
  y -= 6;
  page.drawText("Bill To:", {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: COLOR_MUTED,
  });
  y -= 12;
  page.drawText(truncate(customerName, 280, bold, 11), {
    x: MARGIN,
    y,
    size: 11,
    font: bold,
    color: COLOR_DARK,
  });
  // Customer code intentionally omitted from the Bill To block — it's
  // an internal identifier, not something the customer needs to see on
  // their statement. The code stays in the filename.
  y -= 12;
  for (const line of addrLines) {
    page.drawText(truncate(line, 280, regular, 9), {
      x: MARGIN,
      y,
      size: 9,
      font: regular,
      color: COLOR_TEXT,
    });
    y -= 11;
  }
  if (customer.payment_terms) {
    y -= 4;
    page.drawText(`Payment Terms: ${customer.payment_terms}`, {
      x: MARGIN,
      y,
      size: 9,
      font: regular,
      color: COLOR_MUTED,
    });
    y -= 11;
  }

  y -= 14;

  // Ledger header
  y = drawTableHeaderRow(page, fonts, y, COL_DEFS);

  let runningBalance = openingBalance;
  const ROW_H = 16;

  function ensurePage(neededY: number) {
    if (neededY < 80) {
      drawFooter(
        page,
        fonts,
        `Statement for ${customerName}`,
        "Generated by RS PCB Assembly"
      );
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = drawHeader(page, fonts, "ACCOUNT STATEMENT", subtitle, logo);
      y -= 6;
      y = drawTableHeaderRow(page, fonts, y, COL_DEFS);
    }
  }

  // Opening balance row, if any.
  if (openingBalance !== 0) {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_H,
      width: CONTENT_WIDTH,
      height: ROW_H,
      color: COLOR_BG_STRIP,
    });
    page.drawText("Opening balance", {
      x: COLS.desc.x,
      y: y - 11,
      size: 8,
      font: regular,
      color: COLOR_TEXT,
    });
    const balText = fmt(openingBalance);
    const w = bold.widthOfTextAtSize(balText, 8);
    page.drawText(balText, {
      x: COLS.bal.x + COLS.bal.w - w,
      y: y - 11,
      size: 8,
      font: bold,
      color: COLOR_DARK,
    });
    y -= ROW_H;
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    runningBalance += e.charges - e.pays;
    ensurePage(y - ROW_H);

    // Zebra stripe
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - ROW_H,
        width: CONTENT_WIDTH,
        height: ROW_H,
        color: COLOR_BG_STRIP,
      });
    }

    const ty = y - 11;
    page.drawText(e.date ? fmtDate(e.date) : "", {
      x: COLS.date.x,
      y: ty,
      size: 8,
      font: regular,
      color: COLOR_TEXT,
    });
    page.drawText(e.kind === "invoice" ? "Invoice" : "Payment", {
      x: COLS.type.x,
      y: ty,
      size: 8,
      font: regular,
      color: e.kind === "invoice" ? COLOR_DARK : COLOR_MUTED,
    });
    page.drawText(truncate(e.reference, COLS.ref.w - 4, regular, 8), {
      x: COLS.ref.x,
      y: ty,
      size: 8,
      font: regular,
      color: COLOR_TEXT,
    });
    page.drawText(truncate(e.description, COLS.desc.w - 4, regular, 8), {
      x: COLS.desc.x,
      y: ty,
      size: 8,
      font: regular,
      color: COLOR_TEXT,
    });

    if (e.charges > 0) {
      const t = fmt(e.charges);
      const w = regular.widthOfTextAtSize(t, 8);
      page.drawText(t, {
        x: COLS.charges.x + COLS.charges.w - w,
        y: ty,
        size: 8,
        font: regular,
        color: COLOR_TEXT,
      });
    }
    if (e.pays > 0) {
      const t = fmt(e.pays);
      const w = regular.widthOfTextAtSize(t, 8);
      page.drawText(t, {
        x: COLS.pays.x + COLS.pays.w - w,
        y: ty,
        size: 8,
        font: regular,
        color: COLOR_DARK,
      });
    }
    {
      const t = fmt(runningBalance);
      const w = bold.widthOfTextAtSize(t, 8);
      page.drawText(t, {
        x: COLS.bal.x + COLS.bal.w - w,
        y: ty,
        size: 8,
        font: bold,
        color: COLOR_DARK,
      });
    }

    y -= ROW_H;
  }

  if (entries.length === 0 && openingBalance === 0) {
    page.drawText("No activity in this period.", {
      x: MARGIN + 6,
      y: y - 12,
      size: 9,
      font: regular,
      color: COLOR_LIGHT,
    });
    y -= 24;
  }

  // Bottom border line under ledger.
  page.drawLine({
    start: { x: MARGIN, y: y + 0 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y + 0 },
    thickness: 0.6,
    color: COLOR_BORDER,
  });
  y -= 18;

  // Closing balance + aging side-by-side.
  ensurePage(y - 110);

  const summaryTop = y;
  // Aging box (right)
  const agingX = A4_WIDTH - MARGIN - 220;
  const agingW = 220;
  drawAgingBox(page, agingX, summaryTop, agingW, aging, regular, bold);

  // Closing balance (left of aging)
  page.drawText("Closing Balance", {
    x: MARGIN,
    y: summaryTop - 14,
    size: 11,
    font: bold,
    color: COLOR_DARK,
  });
  const closingTxt = fmt(closingBalance);
  page.drawText(closingTxt, {
    x: MARGIN,
    y: summaryTop - 36,
    size: 22,
    font: bold,
    color: closingBalance > 0.01 ? COLOR_DARK : COLOR_TEXT,
  });
  page.drawText(
    `${entries.filter((e) => e.kind === "invoice").length} invoice(s), ${
      entries.filter((e) => e.kind === "payment").length
    } payment(s)`,
    {
      x: MARGIN,
      y: summaryTop - 50,
      size: 8,
      font: regular,
      color: COLOR_MUTED,
    }
  );

  y = summaryTop - 110;

  // Footer note
  page.drawText(
    `Please remit payment via ${customer.payment_terms ?? "Net 30"}. Contact accounting@rspcbassembly.com for questions.`,
    {
      x: MARGIN,
      y: 60,
      size: 8,
      font: regular,
      color: COLOR_MUTED,
    }
  );

  // Final footer on every page (just the last for now).
  drawFooter(
    page,
    fonts,
    `Statement for ${customerName}`,
    "Generated by RS PCB Assembly"
  );

  const pdfBytes = await doc.save();

  const todayIso = todayMontreal();
  const filename = `${customerCode}-statement-${todayIso}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function drawAgingBox(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  buckets: { current: number; d30: number; d60: number; d90: number },
  regular: import("pdf-lib").PDFFont,
  bold: import("pdf-lib").PDFFont
) {
  const h = 90;
  page.drawRectangle({
    x,
    y: y - h,
    width: w,
    height: h,
    borderColor: COLOR_BORDER,
    borderWidth: 0.6,
    color: COLOR_BG_STRIP,
  });
  page.drawText("Aging Summary", {
    x: x + 8,
    y: y - 14,
    size: 9,
    font: bold,
    color: COLOR_DARK,
  });

  const rows: [string, number][] = [
    ["Current", buckets.current],
    ["31-60 days", buckets.d30],
    ["61-90 days", buckets.d60],
    ["90+ days", buckets.d90],
  ];
  let ry = y - 30;
  for (const [label, val] of rows) {
    page.drawText(label, {
      x: x + 10,
      y: ry,
      size: 8,
      font: regular,
      color: COLOR_TEXT,
    });
    const t = fmt(val);
    const tw = bold.widthOfTextAtSize(t, 8);
    page.drawText(t, {
      x: x + w - 10 - tw,
      y: ry,
      size: 8,
      font: bold,
      color: val > 0.01 ? COLOR_DARK : COLOR_MUTED,
    });
    ry -= 12;
  }
}
