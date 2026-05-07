import { isAdminRole } from "@/lib/auth/roles";
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

/* ------------------------------------------------------------------ */
/*  ROUTE HANDLER                                                      */
/* ------------------------------------------------------------------ */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Admin-only: quote PDFs are a customer-facing commercial document â€” only
  // admins should be able to mint and store them. Production users would
  // also fail to write to the `quotes` storage bucket and the `pdf_path`
  // column update due to RLS, so the silent-failure path produces a partial
  // result; gate explicitly for a clean 403.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name, contact_email, billing_address, shipping_address, billing_addresses, shipping_addresses, payment_terms), gmps(gmp_number, board_name), boms(file_name, revision, bom_name, gerber_name, gerber_revision)"
    )
    .eq("id", id)
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Customer-supplied parts â€” pulled from the join of quote_customer_supplied
  // with bom_lines. Shown on the PDF so the customer sees the exact MPNs they
  // need to ship; these lines are already excluded from the priced totals.
  const { data: csRows } = await supabase
    .from("quote_customer_supplied")
    .select("bom_line_id")
    .eq("quote_id", id);
  const csLineIds = (csRows ?? []).map((r) => r.bom_line_id);
  const { data: csLineData } = csLineIds.length > 0
    ? await supabase
        .from("bom_lines")
        .select("id, line_number, mpn, cpc, description, manufacturer, quantity, reference_designator")
        .in("id", csLineIds)
        .order("line_number", { ascending: true })
    : { data: [] };
  const customerSuppliedLines = csLineData ?? [];

  // BOM lines (all priced lines â€” for the per-tier quotation line table).
  // Exclude customer-supplied lines since they don't appear on the priced list.
  const csLineIdSet = new Set(csLineIds);
  const { data: allBomLinesData } = quote.bom_id
    ? await supabase
        .from("bom_lines")
        .select("id, line_number, mpn, cpc, description, manufacturer, quantity, is_pcb, is_dni")
        .eq("bom_id", quote.bom_id)
        .order("line_number", { ascending: true })
    : { data: [] };
  const quotationLines = (allBomLinesData ?? []).filter(
    (l) => !csLineIdSet.has(l.id) && !l.is_dni
  );
  const quotationLineIds = quotationLines.map((l) => l.id);

  // Per-tier pinned supplier + lead-time for each BOM line.
  const { data: blPricingData } = quotationLineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, tier_qty, supplier, selected_unit_price_cad, selected_unit_price, selected_currency, selected_lead_time_days")
        .in("bom_line_id", quotationLineIds)
    : { data: [] };
  // Index as Map<`${bom_line_id}|${tier_qty}`, row>
  const pricingByLineTier = new Map<string, {
    supplier: string;
    unit_price: number;
    lead_time_days: number | null;
  }>();
  for (const r of (blPricingData ?? [])) {
    const cad = r.selected_unit_price_cad ?? r.selected_unit_price ?? 0;
    pricingByLineTier.set(`${r.bom_line_id}|${r.tier_qty}`, {
      supplier: r.supplier,
      unit_price: Number(cad),
      lead_time_days: r.selected_lead_time_days ?? null,
    });
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
    bom_name: string | null;
    gerber_name: string | null;
    gerber_revision: string | null;
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
          // Assembly margin breakdown â€” 0 for legacy tier1..tier4 JSONB
          // shape (pre-engine-v2 quotes). New quotes go through the
          // tiers[] path above and carry real values.
          assembly_cost_before_markup: 0,
          assembly_markup_amount: 0,
          assembly_markup_pct: 0,
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
            nre_pcb_fab: 0,
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

  // Total page count: 1 (summary) + optional customer-supplied page + 1 per tier
  const hasCustomerSupplied = customerSuppliedLines.length > 0;
  const totalPages = 1 + (hasCustomerSupplied ? 1 : 0) + tiers.length;

  // ---- Create PDF ----
  const { doc: pdfDoc, fonts, logo } = await createPdfDoc();

  /* ================================================================ */
  /*  PAGE 1 â€” SUMMARY                                                */
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
  // Translate the procurement mode enum into the customer-facing label.
  // "turnkey" → "Turnkey (RS supplies parts)" etc. Keeps the customer
  // crystal-clear about who's procuring what.
  const procModeRaw = (quote as { procurement_mode?: string | null })
    .procurement_mode;
  // Mode labels: turnkey + assembly_only are unambiguous enough on their
  // own, so no clarifying parenthetical. Consignment is the one where the
  // customer needs to know they're on the hook for parts, so we keep the
  // bracketed explanation for that case only.
  const procModeLabel = (() => {
    switch (procModeRaw) {
      case "turnkey":
        return "Turnkey";
      case "consignment":
        return "Consignment (customer supplies parts)";
      case "assembly_only":
        return "Assembly only";
      default:
        return null;
    }
  })();

  const quoteCurrency =
    (quote as { currency?: string | null }).currency === "USD" ? "USD" : "CAD";
  const quoteFxRate = Number(
    (quote as { fx_rate_to_cad?: number | string | null }).fx_rate_to_cad ?? 1
  );

  /**
   * Customer-facing money formatter. The pricing engine outputs CAD; for
   * USD quotes we divide by the captured FX rate before printing so the
   * customer sees the agreed USD price (e.g. CAD 800 ÷ 1.3742 ≈ USD 582).
   * Returns "$NNN.NN" — the currency is already declared once in the
   * QUOTE DETAILS column, so we don't repeat it on every cell.
   */
  const fmtMoney = (cad: number | null | undefined): string => {
    const n = cad ?? 0;
    const converted =
      quoteCurrency === "USD" && quoteFxRate > 0 ? n / quoteFxRate : n;
    return `$${converted.toFixed(2)}`;
  };

  const details: [string, string][] = [
    ["GMP:", gmp?.gmp_number ?? "-"],
    ["BOM Name:", bom ? (bom.bom_name ?? bom.file_name ?? "-") : "-"],
    ["BOM Rev:", bom?.revision ?? "-"],
    ["Gerber Name:", bom?.gerber_name ?? "-"],
    ["Gerber Rev:", bom?.gerber_revision ?? "-"],
    ...(procModeLabel ? ([["Mode:", procModeLabel]] as [string, string][]) : []),
    ["Currency:", quoteCurrency],
    // FX rate is intentionally NOT printed here — it's an internal-only
    // value persisted on quotes.fx_rate_to_cad for our books. The customer
    // sees the agreed USD figures but never the rate behind them.
    ["Validity:", `${quote.validity_days ?? 30} days`],
    ["Terms:", customer?.payment_terms ?? "Net 30"],
  ];
  // Value column offset widened from 50px to 80px so the longest label
  // ("Gerber Name:" / "FX (CAD/USD):") doesn't run into its own value at
  // 8pt — that was the overlap visible in the rendered PDF.
  const labelToValueOffset = 80;
  for (const [label, value] of details) {
    page1.drawText(sanitizeForPdf(label), {
      x: detailX,
      y: detY,
      size: 8,
      font: fonts.bold,
      color: COLOR_MUTED,
    });
    page1.drawText(sanitizeForPdf(value), {
      x: detailX + labelToValueOffset,
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

  // ---- Summary Pricing Table (row per tier) ----
  if (tiers.length > 0) {
    const rowH = 18;
    // 4 columns: Qty | Per-Unit | Extended | Lead Time
    const colCount = 4;
    const colW = CONTENT_WIDTH / colCount;
    const headers = ["Qty", "Per-Unit Price", "Extended Price", "Lead Time"];

    // Header row
    page1.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_WIDTH,
      height: rowH,
      color: COLOR_DARK,
    });
    for (let i = 0; i < colCount; i++) {
      const h = headers[i];
      const hw = fonts.bold.widthOfTextAtSize(h, 8);
      page1.drawText(h, {
        x: MARGIN + i * colW + colW / 2 - hw / 2,
        y: y - 13,
        size: 8,
        font: fonts.bold,
        color: COLOR_WHITE,
      });
    }
    y -= rowH;

    // One row per tier
    for (let ti = 0; ti < tiers.length; ti++) {
      const t = tiers[ti];
      const ltKey = `tier_${ti + 1}`;
      const lt = leadTimes[ltKey]?.trim() ? leadTimes[ltKey] : "-";
      const values = [
        String(t.board_qty),
        fmtMoney(t.per_unit),
        fmtMoney(t.subtotal),
        lt,
      ];
      const rowFont = fonts.regular;
      const rowColor = COLOR_TEXT;

      if (ti % 2 === 1) {
        page1.drawRectangle({
          x: MARGIN,
          y: y - rowH,
          width: CONTENT_WIDTH,
          height: rowH,
          color: COLOR_BG_STRIP,
        });
      }
      page1.drawLine({
        start: { x: MARGIN, y: y - rowH },
        end: { x: RIGHT_EDGE, y: y - rowH },
        thickness: 0.5,
        color: COLOR_BORDER,
      });

      for (let ci = 0; ci < colCount; ci++) {
        const val = sanitizeForPdf(values[ci]);
        const vw = rowFont.widthOfTextAtSize(val, 8.5);
        page1.drawText(val, {
          x: MARGIN + ci * colW + colW / 2 - vw / 2,
          y: y - 13,
          size: 8.5,
          font: rowFont,
          color: rowColor,
        });
      }
      y -= rowH;
    }
  }

  y -= 16;

  // ---- NRE (one-time charges) ----
  // NRE is per-quote, not per-tier — the engine echoes the same numbers
  // onto every tier. Pull from tier[0]'s labour breakdown when available;
  // fall back to the flat `nre_charge` for older quotes that don't carry
  // the split.
  if (tiers.length > 0) {
    const firstTier = tiers[0];
    const labour = firstTier.labour as
      | {
          nre_programming?: number;
          nre_stencil?: number;
          nre_pcb_fab?: number;
          nre_total?: number;
        }
      | null
      | undefined;
    const nreProgramming = Number(labour?.nre_programming ?? 0);
    const nreStencil = Number(labour?.nre_stencil ?? 0);
    const nrePcbFab = Number(labour?.nre_pcb_fab ?? 0);
    const nreTotal =
      Number(labour?.nre_total ?? 0) ||
      nreProgramming + nreStencil + nrePcbFab ||
      Number(firstTier.nre_charge ?? 0);

    if (nreTotal > 0) {
      const nreRowH = 16;
      const nreHeaderH = 18;

      // Section header bar.
      page1.drawRectangle({
        x: MARGIN,
        y: y - nreHeaderH,
        width: CONTENT_WIDTH,
        height: nreHeaderH,
        color: COLOR_DARK,
      });
      page1.drawText("NRE (ONE-TIME CHARGES)", {
        x: MARGIN + 6,
        y: y - 13,
        size: 8,
        font: fonts.bold,
        color: COLOR_WHITE,
      });
      y -= nreHeaderH;

      // Each populated breakdown line + total. Skip lines with zero value
      // so a quote with only programming + stencil doesn't render an
      // empty PCB-fab row.
      const items: [string, number][] = [];
      if (nreProgramming > 0) items.push(["Programming", nreProgramming]);
      if (nreStencil > 0) items.push(["Stencil", nreStencil]);
      if (nrePcbFab > 0) items.push(["PCB Fab", nrePcbFab]);
      // Include "Other" only when the total exceeds the explicit pieces —
      // protects legacy quotes whose labour breakdown is incomplete.
      const explicitSum = nreProgramming + nreStencil + nrePcbFab;
      if (nreTotal - explicitSum > 0.005 && explicitSum > 0) {
        items.push(["Other", nreTotal - explicitSum]);
      }
      // No labour breakdown at all → render a single "Total" line.
      if (items.length === 0) items.push(["Total", nreTotal]);

      for (let i = 0; i < items.length; i++) {
        const [label, amount] = items[i];
        if (i % 2 === 1) {
          page1.drawRectangle({
            x: MARGIN,
            y: y - nreRowH,
            width: CONTENT_WIDTH,
            height: nreRowH,
            color: COLOR_BG_STRIP,
          });
        }
        page1.drawLine({
          start: { x: MARGIN, y: y - nreRowH },
          end: { x: RIGHT_EDGE, y: y - nreRowH },
          thickness: 0.5,
          color: COLOR_BORDER,
        });
        page1.drawText(sanitizeForPdf(label), {
          x: MARGIN + 6,
          y: y - 12,
          size: 8.5,
          font: fonts.regular,
          color: COLOR_TEXT,
        });
        const valStr = fmtMoney(amount);
        const valW = fonts.regular.widthOfTextAtSize(valStr, 8.5);
        page1.drawText(valStr, {
          x: RIGHT_EDGE - valW - 6,
          y: y - 12,
          size: 8.5,
          font: fonts.regular,
          color: COLOR_TEXT,
        });
        y -= nreRowH;
      }

      // Total row — only when we actually broke the NRE down.
      if (items.length > 1 || items[0]?.[0] !== "Total") {
        page1.drawRectangle({
          x: MARGIN,
          y: y - nreRowH,
          width: CONTENT_WIDTH,
          height: nreRowH,
          color: COLOR_BG_STRIP,
        });
        page1.drawLine({
          start: { x: MARGIN, y: y - nreRowH },
          end: { x: RIGHT_EDGE, y: y - nreRowH },
          thickness: 0.5,
          color: COLOR_BORDER,
        });
        page1.drawText("Total NRE", {
          x: MARGIN + 6,
          y: y - 12,
          size: 9,
          font: fonts.bold,
          color: COLOR_DARK,
        });
        const totalStr = fmtMoney(nreTotal);
        const totalW = fonts.bold.widthOfTextAtSize(totalStr, 9);
        page1.drawText(totalStr, {
          x: RIGHT_EDGE - totalW - 6,
          y: y - 12,
          size: 9,
          font: fonts.bold,
          color: COLOR_DARK,
        });
        y -= nreRowH;
      }

      y -= 16;
    }
  }

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

    // Tax line on the boilerplate has to match the actual quote: USD/
    // international quotes don't carry Quebec sales tax.
    const taxClause =
      quoteCurrency === "USD"
        ? "All prices are in USD; applicable sales taxes are billed separately on the invoice."
        : "All prices are in CAD and exclude TPS/GST (5%) and TVQ/QST (9.975%).";

    const terms = [
      `1. This quotation is valid for ${quote.validity_days ?? 30} days from the date of issue.`,
      `2. ${taxClause}`,
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
  /*  OPTIONAL PAGE â€” Customer-Supplied Parts                         */
  /*  Only drawn when the quote has lines marked as customer-supplied.*/
  /*  Lists each part + per-tier total qty the customer needs to ship.*/
  /* ================================================================ */
  let nextPageNum = 2;
  if (hasCustomerSupplied) {
    const csPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let csY = drawHeader(
      csPage,
      fonts,
      "CUSTOMER-SUPPLIED PARTS",
      [
        quote.quote_number,
        `${customerSuppliedLines.length} part${customerSuppliedLines.length === 1 ? "" : "s"} to be supplied by customer`,
      ],
      logo
    );

    csPage.drawText(
      "The parts listed below are to be supplied by the customer and are NOT included in the quoted component cost. " +
        "Please ship them to RS Electronique prior to production.",
      {
        x: MARGIN,
        y: csY,
        size: 9,
        font: fonts.regular,
        color: COLOR_MUTED,
        maxWidth: A4_WIDTH - 2 * MARGIN,
        lineHeight: 12,
      }
    );
    csY -= 30;

    // Column layout: Designator | CPC | MPN | Manufacturer | Description
    const colDesig = MARGIN;
    const colCpc = MARGIN + 130;
    const colMpn = MARGIN + 220;
    const colMfr = MARGIN + 330;
    const colDesc = MARGIN + 420;

    // Header row.
    csPage.drawRectangle({
      x: MARGIN,
      y: csY - 2,
      width: A4_WIDTH - 2 * MARGIN,
      height: 16,
      color: COLOR_BG_STRIP,
    });
    csPage.drawText("Designator", { x: colDesig, y: csY + 3, size: 8, font: fonts.bold, color: COLOR_TEXT });
    csPage.drawText("CPC", { x: colCpc, y: csY + 3, size: 8, font: fonts.bold, color: COLOR_TEXT });
    csPage.drawText("MPN", { x: colMpn, y: csY + 3, size: 8, font: fonts.bold, color: COLOR_TEXT });
    csPage.drawText("Manufacturer", { x: colMfr, y: csY + 3, size: 8, font: fonts.bold, color: COLOR_TEXT });
    csPage.drawText("Description", { x: colDesc, y: csY + 3, size: 8, font: fonts.bold, color: COLOR_TEXT });
    csY -= 16;

    for (const line of customerSuppliedLines) {
      if (csY < 60) {
        drawFooter(csPage, fonts, "R.S. Electronique Inc.", quote.quote_number, nextPageNum, totalPages);
        // If we overflow, drop the rest onto a continuation page.
        const cont = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        csY = drawHeader(
          cont,
          fonts,
          "CUSTOMER-SUPPLIED PARTS (continued)",
          [quote.quote_number],
          logo
        );
        nextPageNum++;
      }
      const desig = sanitizeForPdf(line.reference_designator ?? "â€”");
      const cpc = sanitizeForPdf(line.cpc ?? "â€”");
      const mpn = sanitizeForPdf(line.mpn ?? "â€”");
      const mfr = sanitizeForPdf(line.manufacturer ?? "â€”");
      const desc = sanitizeForPdf(line.description ?? "â€”");
      csPage.drawText(desig.slice(0, 22), { x: colDesig, y: csY, size: 8, font: fonts.regular, color: COLOR_TEXT });
      csPage.drawText(cpc.slice(0, 16), { x: colCpc, y: csY, size: 8, font: fonts.regular, color: COLOR_TEXT });
      csPage.drawText(mpn.slice(0, 18), { x: colMpn, y: csY, size: 8, font: fonts.regular, color: COLOR_TEXT });
      csPage.drawText(mfr.slice(0, 14), { x: colMfr, y: csY, size: 8, font: fonts.regular, color: COLOR_TEXT });
      csPage.drawText(desc.slice(0, 24), { x: colDesc, y: csY, size: 8, font: fonts.regular, color: COLOR_TEXT });
      csY -= 12;
    }

    drawFooter(
      csPage,
      fonts,
      "R.S. Electronique Inc.",
      quote.quote_number,
      nextPageNum,
      totalPages
    );
    nextPageNum++;
  }

  /* ================================================================ */
  /*  PAGES â€” Per-Tier Detailed Breakdown                             */
  /* ================================================================ */
  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti];
    const labour = tier.labour;
    // Page numbering accounts for the optional customer-supplied page that
    // sits between page 1 (summary) and the per-tier breakdown pages.
    const pageNum = nextPageNum + ti;
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

    // ---- Cost Summary ----
    py = drawSectionTitle(page, fonts, py, "COST SUMMARY");
    py = drawKVRow(page, fonts, py, "Component Cost", fmtMoney(tier.component_cost));
    py = drawKVRow(page, fonts, py, "PCB Cost", fmtMoney(tier.pcb_cost));
    py = drawKVRow(page, fonts, py, "Assembly Cost", fmtMoney(tier.assembly_cost));
    py = drawKVRow(page, fonts, py, "NRE", fmtMoney(tier.nre_charge));
    py = drawKVRow(page, fonts, py, "Shipping", fmtMoney(tier.shipping));
    py = drawKVRow(page, fonts, py, "Subtotal", fmtMoney(tier.subtotal), { bold: true });
    py = drawKVRow(page, fonts, py, "Per Unit", fmtMoney(tier.per_unit), { bold: true });
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
    const totalText = fmtMoney(tier.subtotal);
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
    const puText = fmtMoney(tier.per_unit);
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
