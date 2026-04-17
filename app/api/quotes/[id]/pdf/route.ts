import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rgb } from "pdf-lib";
import {
  createPdfDoc,
  drawHeader,
  drawFooter,
  sanitizeForPdf,
  fmtDate,
  A4_WIDTH,
  A4_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  COLOR_DARK,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_WHITE,
  COLOR_BG_STRIP,
  COLOR_BORDER,
  PdfFonts,
} from "@/lib/pdf/helpers";
import type { PDFPage, PDFFont } from "pdf-lib";
import type { PricingTier } from "@/lib/pricing/types";

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function fmt(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

function fmtPct(n: number | null | undefined): string {
  return (n ?? 0).toFixed(1) + "%";
}

function fmtInt(n: number | null | undefined): string {
  return String(Math.round(n ?? 0));
}

/* ------------------------------------------------------------------ */
/*  Address formatter                                                  */
/* ------------------------------------------------------------------ */

interface AddressJson {
  line1?: string;
  line2?: string;
  street?: string;
  city?: string;
  province?: string;
  state?: string;
  postal_code?: string;
  zip?: string;
  country?: string;
  is_default?: boolean;
  label?: string;
  [key: string]: unknown;
}

function extractDefaultAddress(addresses: unknown): AddressJson | null {
  if (!addresses) return null;
  if (Array.isArray(addresses)) {
    const def = addresses.find((a: AddressJson) => a.is_default);
    return def ?? addresses[0] ?? null;
  }
  if (typeof addresses === "object") return addresses as AddressJson;
  return null;
}

function formatAddress(addr: AddressJson | null | undefined): string[] {
  if (!addr || typeof addr !== "object") return [];
  const lines: string[] = [];
  const streetLine = addr.line1 || addr.street;
  if (streetLine) lines.push(String(streetLine));
  if (addr.line2) lines.push(String(addr.line2));
  const cityParts: string[] = [];
  if (addr.city) cityParts.push(String(addr.city));
  if (addr.province || addr.state)
    cityParts.push(String(addr.province ?? addr.state));
  if (addr.postal_code || addr.zip)
    cityParts.push(String(addr.postal_code ?? addr.zip));
  if (cityParts.length > 0) lines.push(cityParts.join(", "));
  if (addr.country) lines.push(String(addr.country));
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Shared page-level drawing helpers                                  */
/* ------------------------------------------------------------------ */

const RIGHT_EDGE = A4_WIDTH - MARGIN;
const FOOTER_SAFE_Y = 50; // don't draw below this

function drawSectionTitle(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  title: string
): number {
  page.drawText(title, {
    x: MARGIN,
    y,
    size: 10,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: RIGHT_EDGE, y },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  return y - 14;
}

/** Draw a key-value row.  Returns new y. */
function drawKVRow(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  label: string,
  value: string,
  options?: { bold?: boolean; indent?: number; labelWidth?: number }
): number {
  const indent = options?.indent ?? 0;
  const lw = options?.labelWidth ?? 220;
  const font = options?.bold ? fonts.bold : fonts.regular;
  const color = options?.bold ? COLOR_DARK : COLOR_TEXT;
  page.drawText(sanitizeForPdf(label), {
    x: MARGIN + indent,
    y,
    size: 8.5,
    font: fonts.regular,
    color: COLOR_MUTED,
  });
  const vText = sanitizeForPdf(value);
  const vw = font.widthOfTextAtSize(vText, 8.5);
  page.drawText(vText, {
    x: MARGIN + lw - vw + indent,
    y,
    size: 8.5,
    font,
    color,
  });
  return y - 13;
}

/** Draw a full-width table row with alternating background. */
function drawTableRow(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  label: string,
  values: string[],
  tierCount: number,
  options?: { bold?: boolean; rowIndex?: number }
): number {
  const rowH = 18;
  const labelColW = 150;
  const tierColW = (CONTENT_WIDTH - labelColW) / tierCount;
  const rowFont = options?.bold ? fonts.bold : fonts.regular;
  const rowColor = options?.bold ? COLOR_DARK : COLOR_TEXT;

  // Alternating or bold background
  if (options?.bold) {
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_WIDTH,
      height: rowH,
      color: rgb(0.94, 0.96, 0.98),
    });
  } else if ((options?.rowIndex ?? 0) % 2 === 1) {
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_WIDTH,
      height: rowH,
      color: COLOR_BG_STRIP,
    });
  }

  // Separator
  page.drawLine({
    start: { x: MARGIN, y: y - rowH },
    end: { x: RIGHT_EDGE, y: y - rowH },
    thickness: 0.5,
    color: COLOR_BORDER,
  });

  // Label
  page.drawText(sanitizeForPdf(label), {
    x: MARGIN + 4,
    y: y - 13,
    size: 8.5,
    font: rowFont,
    color: rowColor,
  });

  // Values
  for (let i = 0; i < values.length; i++) {
    const val = sanitizeForPdf(values[i]);
    const vw = rowFont.widthOfTextAtSize(val, 8.5);
    page.drawText(val, {
      x: MARGIN + labelColW + (i + 1) * tierColW - vw - 4,
      y: y - 13,
      size: 8.5,
      font: rowFont,
      color: rowColor,
    });
  }
  return y - rowH;
}

/* ------------------------------------------------------------------ */
/*  ROUTE HANDLER                                                      */
/* ------------------------------------------------------------------ */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name, contact_email, billing_address, shipping_address, billing_addresses, shipping_addresses, payment_terms), gmps(gmp_number, board_name), boms(file_name, revision)"
    )
    .eq("id", id)
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const customer = quote.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    billing_address: AddressJson | null;
    shipping_address: AddressJson | null;
    billing_addresses: unknown;
    shipping_addresses: unknown;
    payment_terms: string | null;
  } | null;
  const gmp = quote.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;
  const bom = quote.boms as unknown as {
    file_name: string;
    revision: string;
  } | null;
  const rawPricing = quote.pricing as unknown as Record<string, unknown> | null;
  const leadTimes = (quote.lead_times ?? {}) as Record<string, string>;

  // ---- Normalize pricing tiers ----
  let tiers: PricingTier[] = [];
  let warnings: string[] = [];

  if (rawPricing) {
    if (Array.isArray(rawPricing.tiers)) {
      tiers = rawPricing.tiers as PricingTier[];
      warnings = (rawPricing.warnings as string[]) ?? [];
    } else {
      for (const key of ["tier_1", "tier_2", "tier_3", "tier_4"]) {
        const t = rawPricing[key] as Record<string, number> | undefined;
        if (!t) continue;
        tiers.push({
          board_qty: t.quantity ?? 0,
          component_cost: t.components ?? 0,
          pcb_cost: t.pcb ?? 0,
          assembly_cost: t.assembly ?? 0,
          nre_charge: t.nre ?? 0,
          shipping: 0,
          subtotal: t.total ?? 0,
          per_unit: t.per_unit ?? 0,
          smt_placements: 0,
          th_placements: 0,
          mansmt_placements: 0,
          components_with_price: 0,
          components_missing_price: 0,
          component_cost_before_markup: 0,
          component_markup_amount: 0,
          component_markup_pct: 0,
          pcb_cost_before_markup: 0,
          pcb_markup_amount: 0,
          pcb_markup_pct: 0,
          overage_cost: 0,
          overage_qty: 0,
          labour: {
            smt_placement_cost: 0,
            th_placement_cost: 0,
            mansmt_placement_cost: 0,
            total_placement_cost: 0,
            setup_cost: 0,
            programming_cost: 0,
            total_labour_cost: 0,
            nre_programming: 0,
            nre_stencil: 0,
            nre_setup: 0,
            nre_pcb_fab: 0,
            nre_misc: 0,
            nre_total: t.nre ?? 0,
            total_unique_lines: 0,
            total_smt_placements: 0,
            cp_feeder_count: 0,
            ip_feeder_count: 0,
            cp_placement_sum: 0,
            ip_placement_sum: 0,
            mansmt_count: 0,
            th_placement_sum: 0,
            time_model_used: false,
            assembly_time_hours: 0,
            smt_time_hours: 0,
            th_time_hours: 0,
            mansmt_time_hours: 0,
            setup_time_hours_computed: 0,
            labour_cost: 0,
            machine_cost: 0,
          },
        });
      }
    }
  }

  // Total page count: 1 (summary) + 1 per tier
  const totalPages = 1 + tiers.length;

  // ---- Create PDF ----
  const { doc: pdfDoc, fonts, logo } = await createPdfDoc();

  /* ================================================================ */
  /*  PAGE 1 — SUMMARY                                                */
  /* ================================================================ */
  const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = drawHeader(
    page1,
    fonts,
    "QUOTATION",
    [quote.quote_number, fmtDate(quote.issued_at)],
    logo
  );

  // ---- Bill To / Ship To / Quote Details ----
  const colWidth = CONTENT_WIDTH / 3;

  // BILL TO
  page1.drawText("BILL TO", {
    x: MARGIN,
    y,
    size: 9,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  let billY = y - 14;
  page1.drawText(sanitizeForPdf(customer?.company_name ?? "Unknown"), {
    x: MARGIN,
    y: billY,
    size: 9,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  billY -= 12;
  if (customer?.contact_name) {
    page1.drawText(sanitizeForPdf(`Attn: ${customer.contact_name}`), {
      x: MARGIN,
      y: billY,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    billY -= 11;
  }
  if (customer?.contact_email) {
    page1.drawText(sanitizeForPdf(customer.contact_email), {
      x: MARGIN,
      y: billY,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    billY -= 11;
  }
  const billingAddr = extractDefaultAddress(customer?.billing_addresses) ?? customer?.billing_address ?? null;
  const billingLines = formatAddress(billingAddr);
  for (const line of billingLines) {
    page1.drawText(sanitizeForPdf(line), {
      x: MARGIN,
      y: billY,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    billY -= 11;
  }

  // SHIP TO
  const shipX = MARGIN + colWidth;
  page1.drawText("SHIP TO", {
    x: shipX,
    y,
    size: 9,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  let shipY = y - 14;
  const shippingAddr = extractDefaultAddress(customer?.shipping_addresses) ?? customer?.shipping_address ?? null;
  const shippingLines = formatAddress(shippingAddr);
  if (shippingLines.length > 0) {
    page1.drawText(sanitizeForPdf(customer?.company_name ?? ""), {
      x: shipX,
      y: shipY,
      size: 9,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
    shipY -= 12;
    for (const line of shippingLines) {
      page1.drawText(sanitizeForPdf(line), {
        x: shipX,
        y: shipY,
        size: 8,
        font: fonts.regular,
        color: COLOR_MUTED,
      });
      shipY -= 11;
    }
  } else {
    page1.drawText("Same as billing", {
      x: shipX,
      y: shipY,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    shipY -= 12;
  }

  // QUOTE DETAILS
  const detailX = MARGIN + 2 * colWidth;
  page1.drawText("QUOTE DETAILS", {
    x: detailX,
    y,
    size: 9,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  let detY = y - 14;
  const details: [string, string][] = [
    ["GMP:", gmp?.gmp_number ?? "-"],
    ["Board:", gmp?.board_name ?? "-"],
    ["BOM:", bom ? `${bom.file_name} Rev ${bom.revision}` : "-"],
    ["Validity:", `${quote.validity_days ?? 30} days`],
    ["Terms:", customer?.payment_terms ?? "Net 30"],
  ];
  for (const [label, value] of details) {
    page1.drawText(sanitizeForPdf(label), {
      x: detailX,
      y: detY,
      size: 8,
      font: fonts.bold,
      color: COLOR_MUTED,
    });
    page1.drawText(sanitizeForPdf(value), {
      x: detailX + 50,
      y: detY,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
    detY -= 12;
  }

  // Move y below all three columns
  y = Math.min(billY, shipY, detY) - 12;

  // ---- Warnings ----
  if (warnings.length > 0) {
    const warnBg = rgb(1, 0.97, 0.76);
    const warnBorder = rgb(0.98, 0.8, 0.08);
    const warnText = rgb(0.52, 0.3, 0.03);
    const warnH = 12 * warnings.length + 16;
    page1.drawRectangle({
      x: MARGIN,
      y: y - warnH,
      width: CONTENT_WIDTH,
      height: warnH,
      color: warnBg,
      borderColor: warnBorder,
      borderWidth: 1,
    });
    for (const w of warnings) {
      page1.drawText(sanitizeForPdf(`* ${w}`), {
        x: MARGIN + 8,
        y: y - 4,
        size: 8,
        font: fonts.regular,
        color: warnText,
      });
      y -= 12;
    }
    y -= 16;
  }

  // ---- Summary Pricing Table ----
  if (tiers.length > 0) {
    const labelColW = 150;
    const tierColW = (CONTENT_WIDTH - labelColW) / tiers.length;
    const rowH = 18;

    // Table header
    page1.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_WIDTH,
      height: rowH,
      color: COLOR_DARK,
    });
    for (let i = 0; i < tiers.length; i++) {
      const tierLabel = `${tiers[i].board_qty} Units`;
      const tw = fonts.bold.widthOfTextAtSize(tierLabel, 8);
      const tx = MARGIN + labelColW + i * tierColW + tierColW / 2 - tw / 2;
      page1.drawText(tierLabel, {
        x: tx,
        y: y - 13,
        size: 8,
        font: fonts.bold,
        color: COLOR_WHITE,
      });
    }
    y -= rowH;

    // Rows
    const summaryRows: { label: string; values: string[]; bold?: boolean }[] = [
      { label: "Components", values: tiers.map((t) => fmt(t.component_cost)) },
      { label: "PCB", values: tiers.map((t) => fmt(t.pcb_cost)) },
      { label: "Assembly", values: tiers.map((t) => fmt(t.assembly_cost)) },
      { label: "NRE", values: tiers.map((t) => fmt(t.nre_charge)) },
      { label: "Shipping", values: tiers.map((t) => fmt(t.shipping)) },
      {
        label: "Total",
        values: tiers.map((t) => fmt(t.subtotal)),
        bold: true,
      },
      {
        label: "Per Unit",
        values: tiers.map((t) => fmt(t.per_unit)),
        bold: true,
      },
    ];

    for (let ri = 0; ri < summaryRows.length; ri++) {
      y = drawTableRow(page1, fonts, y, summaryRows[ri].label, summaryRows[ri].values, tiers.length, {
        bold: summaryRows[ri].bold,
        rowIndex: ri,
      });
    }

    // Lead time row (if any lead times set)
    const hasLeadTimes = Object.values(leadTimes).some((v) => v && v.trim());
    if (hasLeadTimes) {
      y -= 4;
      const ltValues = tiers.map((_, i) => {
        const key = `tier_${i + 1}`;
        return leadTimes[key] ?? "-";
      });
      y = drawTableRow(page1, fonts, y, "Lead Time", ltValues, tiers.length, {
        bold: false,
        rowIndex: 0,
      });
    }
  }

  y -= 16;

  // ---- Notes ----
  if (quote.notes) {
    page1.drawText("NOTES", {
      x: MARGIN,
      y,
      size: 9,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    y -= 14;
    // Wrap notes text manually (simple word wrap)
    const noteLines = wrapText(
      sanitizeForPdf(quote.notes),
      CONTENT_WIDTH,
      fonts.regular,
      8.5
    );
    for (const line of noteLines) {
      if (y < FOOTER_SAFE_Y) break;
      page1.drawText(line, {
        x: MARGIN,
        y,
        size: 8.5,
        font: fonts.regular,
        color: COLOR_MUTED,
      });
      y -= 12;
    }
    y -= 8;
  }

  // ---- Terms & Conditions ----
  if (y > FOOTER_SAFE_Y + 100) {
    page1.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT_EDGE, y },
      thickness: 1,
      color: COLOR_BORDER,
    });
    y -= 16;
    page1.drawText("TERMS & CONDITIONS", {
      x: MARGIN,
      y,
      size: 9,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    y -= 14;

    const terms = [
      `1. This quotation is valid for ${quote.validity_days ?? 30} days from the date of issue.`,
      "2. All prices are in CAD and exclude TPS/GST (5%) and TVQ/QST (9.975%).",
      "3. Lead times are subject to component availability at the time of order confirmation.",
      "4. Payment terms: Net 30 from date of invoice unless otherwise agreed.",
      "5. NRE charges apply to first-time boards only and cover stencil, programming, and setup.",
      "6. Customer-supplied components are subject to incoming inspection.",
      "7. Quantities delivered may vary by +/-5% per IPC standards unless exact quantity is specified.",
    ];

    for (const term of terms) {
      if (y < FOOTER_SAFE_Y) break;
      page1.drawText(sanitizeForPdf(term), {
        x: MARGIN,
        y,
        size: 7.5,
        font: fonts.regular,
        color: COLOR_MUTED,
      });
      y -= 11;
    }
  }

  // Footer page 1
  drawFooter(
    page1,
    fonts,
    "R.S. Electronique Inc.",
    quote.quote_number,
    1,
    totalPages
  );

  /* ================================================================ */
  /*  PAGES 2-N — Per-Tier Detailed Breakdown                         */
  /* ================================================================ */
  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti];
    const labour = tier.labour;
    const pageNum = ti + 2;
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    let py = drawHeader(
      page,
      fonts,
      "COST BREAKDOWN",
      [
        quote.quote_number,
        `Tier ${ti + 1}: ${tier.board_qty} Units`,
      ],
      logo
    );

    // ---- Tier title ----
    page.drawText(`Quantity: ${tier.board_qty} units`, {
      x: MARGIN,
      y: py,
      size: 12,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    // Lead time on same line, right-aligned
    const ltKey = `tier_${ti + 1}`;
    const ltVal = leadTimes[ltKey];
    if (ltVal && ltVal.trim()) {
      const ltText = `Lead Time: ${ltVal}`;
      const ltW = fonts.regular.widthOfTextAtSize(ltText, 10);
      page.drawText(sanitizeForPdf(ltText), {
        x: RIGHT_EDGE - ltW,
        y: py,
        size: 10,
        font: fonts.regular,
        color: COLOR_MUTED,
      });
    }
    py -= 22;

    // ---- Material Cost ----
    py = drawSectionTitle(page, fonts, py, "MATERIAL COST");
    const componentCostBeforeMarkup =
      tier.component_cost / (1 + (Number(quote.component_markup ?? 20) / 100));
    const markupPct = Number(quote.component_markup ?? 20);

    py = drawKVRow(page, fonts, py, "Total component cost (before markup)", fmt(componentCostBeforeMarkup));
    py = drawKVRow(page, fonts, py, "Component markup", fmtPct(markupPct));
    py = drawKVRow(page, fonts, py, "Total component cost (after markup)", fmt(tier.component_cost), { bold: true });
    py = drawKVRow(page, fonts, py, "Overage cost (extra parts)", fmt(tier.overage_cost));
    py = drawKVRow(page, fonts, py, "Overage quantity (extra parts)", fmtInt(tier.overage_qty));
    py -= 8;

    // ---- PCB Cost ----
    py = drawSectionTitle(page, fonts, py, "PCB COST");
    const pcbUnitPrice = quote.pcb_cost_per_unit != null ? Number(quote.pcb_cost_per_unit) : 0;
    // Try to get per-tier PCB price from tier_inputs
    const tierInputs = rawPricing?.tier_inputs as Array<{ pcb_unit_price?: number }> | undefined;
    const tierPcbUnit = tierInputs?.[ti]?.pcb_unit_price ?? pcbUnitPrice;
    const pcbMarkupPct = 30; // default PCB markup

    py = drawKVRow(page, fonts, py, "PCB unit price", fmt(tierPcbUnit));
    py = drawKVRow(page, fonts, py, `PCB unit price x ${tier.board_qty} boards`, fmt(tierPcbUnit * tier.board_qty));
    py = drawKVRow(page, fonts, py, "PCB markup", fmtPct(pcbMarkupPct));
    py = drawKVRow(page, fonts, py, "Total PCB cost", fmt(tier.pcb_cost), { bold: true });
    py -= 8;

    // ---- Assembly Cost ----
    py = drawSectionTitle(page, fonts, py, "ASSEMBLY COST");
    py = drawKVRow(page, fonts, py, `SMT placements (${fmtInt(tier.smt_placements)} per board)`, fmt(labour.smt_placement_cost));
    py = drawKVRow(page, fonts, py, `TH placements (${fmtInt(tier.th_placements)} per board)`, fmt(labour.th_placement_cost));
    if (tier.mansmt_placements > 0) {
      py = drawKVRow(page, fonts, py, `Manual SMT (${fmtInt(tier.mansmt_placements)} per board)`, fmt(labour.mansmt_placement_cost));
    }
    py = drawKVRow(page, fonts, py, "Total placement cost", fmt(labour.total_placement_cost));
    if (labour.setup_cost > 0) {
      py = drawKVRow(page, fonts, py, "Setup cost", fmt(labour.setup_cost));
    }
    if (labour.programming_cost > 0) {
      py = drawKVRow(page, fonts, py, "Programming cost", fmt(labour.programming_cost));
    }
    py = drawKVRow(page, fonts, py, "Total assembly cost", fmt(tier.assembly_cost), { bold: true });
    py -= 8;

    // ---- NRE Breakdown ----
    py = drawSectionTitle(page, fonts, py, "NRE (NON-RECURRING ENGINEERING)");
    if (labour.nre_programming > 0) {
      py = drawKVRow(page, fonts, py, "Programming fee", fmt(labour.nre_programming));
    }
    if (labour.nre_stencil > 0) {
      py = drawKVRow(page, fonts, py, "Stencil cost", fmt(labour.nre_stencil));
    }
    if (labour.nre_pcb_fab > 0) {
      py = drawKVRow(page, fonts, py, "PCB fab NRE", fmt(labour.nre_pcb_fab));
    }
    if (labour.nre_setup > 0) {
      py = drawKVRow(page, fonts, py, "Setup cost", fmt(labour.nre_setup));
    }
    if (labour.nre_misc > 0) {
      py = drawKVRow(page, fonts, py, "Miscellaneous", fmt(labour.nre_misc));
    }
    py = drawKVRow(page, fonts, py, "Total NRE", fmt(tier.nre_charge), { bold: true });
    py -= 8;

    // ---- Shipping ----
    py = drawSectionTitle(page, fonts, py, "SHIPPING");
    py = drawKVRow(page, fonts, py, "Shipping", fmt(tier.shipping));
    py -= 8;

    // ---- Tier Total ----
    py -= 4;
    page.drawRectangle({
      x: MARGIN,
      y: py - 36,
      width: CONTENT_WIDTH,
      height: 36,
      color: rgb(0.94, 0.96, 0.98),
      borderColor: COLOR_DARK,
      borderWidth: 1,
    });
    page.drawText("TIER TOTAL", {
      x: MARGIN + 8,
      y: py - 14,
      size: 10,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    const totalText = fmt(tier.subtotal);
    const totalW = fonts.bold.widthOfTextAtSize(totalText, 12);
    page.drawText(totalText, {
      x: RIGHT_EDGE - totalW - 8,
      y: py - 14,
      size: 12,
      font: fonts.bold,
      color: COLOR_DARK,
    });

    page.drawText("PER UNIT", {
      x: MARGIN + 8,
      y: py - 28,
      size: 9,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    const puText = fmt(tier.per_unit);
    const puW = fonts.bold.widthOfTextAtSize(puText, 10);
    page.drawText(puText, {
      x: RIGHT_EDGE - puW - 8,
      y: py - 28,
      size: 10,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    py -= 52;

    // ---- Assembly Stats (if available) ----
    if (labour.total_unique_lines > 0) {
      py = drawSectionTitle(page, fonts, py, "ASSEMBLY STATISTICS");
      py = drawKVRow(page, fonts, py, "Unique component lines", fmtInt(labour.total_unique_lines));
      py = drawKVRow(page, fonts, py, "Total SMT placements per board", fmtInt(labour.total_smt_placements));
      py = drawKVRow(page, fonts, py, "CP feeders", fmtInt(labour.cp_feeder_count));
      py = drawKVRow(page, fonts, py, "IP feeders", fmtInt(labour.ip_feeder_count));
      py = drawKVRow(page, fonts, py, "Components with price", fmtInt(tier.components_with_price));
      py = drawKVRow(page, fonts, py, "Components missing price", fmtInt(tier.components_missing_price));
    }

    // Footer
    drawFooter(
      page,
      fonts,
      "R.S. Electronique Inc.",
      quote.quote_number,
      pageNum,
      totalPages
    );
  }

  // ---- Serialize ----
  const pdfBytes = await pdfDoc.save();

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = gmp?.gmp_number ?? "unknown";
  const storagePath = `${customerCode}/${gmpNumber}/${quote.quote_number}.pdf`;
  const pdfBuffer = Buffer.from(pdfBytes);

  await supabase.storage.from("quotes").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await supabase.from("quotes").update({ pdf_path: storagePath }).eq("id", id);

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quote_number}.pdf"`,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Text wrapping helper                                               */
/* ------------------------------------------------------------------ */

function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
