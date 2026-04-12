import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PricingTier } from "@/lib/pricing/types";

function fmt(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name), gmps(gmp_number, board_name), boms(file_name, revision)"
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

  // Normalize pricing — supports two formats:
  //   1. Standard: { tiers: PricingTier[], warnings: string[] }
  //   2. Batch: { tier_1: {...}, tier_2: {...}, ... }
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
          labour: {
            smt_placement_cost: 0, th_placement_cost: 0, mansmt_placement_cost: 0,
            total_placement_cost: 0, setup_cost: 0, programming_cost: 0,
            total_labour_cost: 0, nre_programming: 0, nre_stencil: 0,
            nre_setup: 0, nre_pcb_fab: 0, nre_misc: 0, nre_total: t.nre ?? 0,
            total_unique_lines: 0, total_smt_placements: 0, cp_feeder_count: 0,
            ip_feeder_count: 0, cp_placement_sum: 0, ip_placement_sum: 0,
            mansmt_count: 0, th_placement_sum: 0,
          },
        });
      }
    }
  }

  // --- Build PDF with pdf-lib (pure JS, works on Vercel serverless) ---
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const headerBg = rgb(0.06, 0.09, 0.16); // #0f172a
  const white = rgb(1, 1, 1);
  const blue = rgb(0.1, 0.3, 0.7);

  let y = height - 40;
  const leftMargin = 40;
  const rightEdge = width - 40;

  // --- Header ---
  page.drawText("R.S. ÉLECTRONIQUE INC.", { x: leftMargin, y, font: helveticaBold, size: 14, color: black });
  y -= 14;
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: leftMargin, y, font: helvetica, size: 8, color: gray });
  y -= 11;
  page.drawText("+1 (438) 833-8477 · info@rspcbassembly.com", { x: leftMargin, y, font: helvetica, size: 8, color: gray });
  y -= 11;
  page.drawText("www.rspcbassembly.com", { x: leftMargin, y, font: helvetica, size: 8, color: gray });
  y -= 11;
  page.drawText("GST/TPS: 840134829 · QST/TVQ: 1214617001", { x: leftMargin, y, font: helvetica, size: 8, color: gray });

  // Right side — QUOTATION title
  page.drawText("QUOTATION", { x: rightEdge - helveticaBold.widthOfTextAtSize("QUOTATION", 18), y: height - 40, font: helveticaBold, size: 18, color: black });
  page.drawText(quote.quote_number, { x: rightEdge - helvetica.widthOfTextAtSize(quote.quote_number, 10), y: height - 56, font: helvetica, size: 10, color: black });
  const dateStr = fmtDate(quote.issued_at);
  page.drawText(dateStr, { x: rightEdge - helvetica.widthOfTextAtSize(dateStr, 9), y: height - 69, font: helvetica, size: 9, color: gray });

  // Separator line
  y -= 8;
  page.drawLine({ start: { x: leftMargin, y }, end: { x: rightEdge, y }, thickness: 2, color: black });
  y -= 24;

  // --- Bill To + Quote Details ---
  page.drawText("BILL TO", { x: leftMargin, y, font: helveticaBold, size: 9, color: black });
  page.drawText("QUOTE DETAILS", { x: 320, y, font: helveticaBold, size: 9, color: black });
  y -= 16;

  page.drawText(customer?.company_name ?? "Unknown", { x: leftMargin, y, font: helvetica, size: 9, color: black });
  page.drawText(`GMP: ${gmp?.gmp_number ?? "—"}`, { x: 320, y, font: helvetica, size: 9, color: black });
  y -= 14;

  if (customer?.contact_name) {
    page.drawText(`Attn: ${customer.contact_name}`, { x: leftMargin, y, font: helvetica, size: 9, color: gray });
  }
  if (gmp?.board_name) {
    page.drawText(`Board: ${gmp.board_name}`, { x: 320, y, font: helvetica, size: 9, color: black });
  }
  y -= 14;

  const bomText = bom ? `${bom.file_name} Rev ${bom.revision}` : "—";
  page.drawText(`BOM: ${bomText}`, { x: 320, y, font: helvetica, size: 9, color: black });
  y -= 14;
  page.drawText(`Validity: ${quote.validity_days ?? 30} days`, { x: 320, y, font: helvetica, size: 9, color: black });
  if (quote.nre_charge && Number(quote.nre_charge) > 0) {
    y -= 14;
    page.drawText(`NRE: ${fmt(Number(quote.nre_charge))}`, { x: 320, y, font: helvetica, size: 9, color: black });
  }

  y -= 24;

  // --- Warnings ---
  if (warnings.length > 0) {
    page.drawRectangle({ x: leftMargin, y: y - 12 * warnings.length - 8, width: rightEdge - leftMargin, height: 12 * warnings.length + 16, color: rgb(1, 0.97, 0.76), borderColor: rgb(0.98, 0.8, 0.08), borderWidth: 1 });
    for (const w of warnings) {
      page.drawText(`• ${w}`, { x: leftMargin + 8, y: y - 4, font: helvetica, size: 8, color: rgb(0.52, 0.3, 0.03) });
      y -= 12;
    }
    y -= 16;
  }

  // --- Pricing Table ---
  if (tiers.length > 0) {
    const labelColW = 150;
    const tierColW = (rightEdge - leftMargin - labelColW) / tiers.length;
    const rowH = 20;

    // Table header
    page.drawRectangle({ x: leftMargin, y: y - rowH, width: rightEdge - leftMargin, height: rowH, color: headerBg });

    for (let i = 0; i < tiers.length; i++) {
      const tierLabel = `${tiers[i].board_qty} Units`;
      const tx = leftMargin + labelColW + i * tierColW + tierColW / 2 - helveticaBold.widthOfTextAtSize(tierLabel, 8) / 2;
      page.drawText(tierLabel, { x: tx, y: y - 14, font: helveticaBold, size: 8, color: white });
    }
    y -= rowH;

    // Data rows
    const rows: { label: string; values: string[]; bold?: boolean }[] = [
      { label: "Components", values: tiers.map((t) => fmt(t.component_cost)) },
      { label: "PCB", values: tiers.map((t) => fmt(t.pcb_cost)) },
      { label: "Assembly", values: tiers.map((t) => fmt(t.assembly_cost)) },
      { label: "NRE", values: tiers.map((t) => fmt(t.nre_charge)) },
      { label: "Shipping", values: tiers.map((t) => fmt(t.shipping)) },
      { label: "Total", values: tiers.map((t) => fmt(t.subtotal)), bold: true },
      { label: "Per Unit", values: tiers.map((t) => fmt(t.per_unit)), bold: true },
    ];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const rowFont = row.bold ? helveticaBold : helvetica;
      const rowColor = row.bold ? black : gray;

      // Alternating row background
      if (ri % 2 === 1) {
        page.drawRectangle({ x: leftMargin, y: y - rowH, width: rightEdge - leftMargin, height: rowH, color: rgb(0.97, 0.98, 0.99) });
      }
      if (row.bold) {
        page.drawRectangle({ x: leftMargin, y: y - rowH, width: rightEdge - leftMargin, height: rowH, color: rgb(0.94, 0.96, 0.98) });
      }

      // Row separator
      page.drawLine({ start: { x: leftMargin, y: y - rowH }, end: { x: rightEdge, y: y - rowH }, thickness: 0.5, color: lightGray });

      // Label
      page.drawText(row.label, { x: leftMargin + 4, y: y - 14, font: rowFont, size: 9, color: rowColor });

      // Values
      for (let i = 0; i < row.values.length; i++) {
        const val = row.values[i];
        const vx = leftMargin + labelColW + (i + 1) * tierColW - helvetica.widthOfTextAtSize(val, 9) - 4;
        page.drawText(val, { x: vx, y: y - 14, font: rowFont, size: 9, color: rowColor });
      }
      y -= rowH;
    }
  }

  y -= 16;

  // --- Notes ---
  if (quote.notes) {
    page.drawText("NOTES", { x: leftMargin, y, font: helveticaBold, size: 9, color: black });
    y -= 14;
    page.drawText(quote.notes, { x: leftMargin, y, font: helvetica, size: 9, color: gray });
    y -= 20;
  }

  // --- Terms & Conditions ---
  page.drawLine({ start: { x: leftMargin, y }, end: { x: rightEdge, y }, thickness: 1, color: lightGray });
  y -= 16;
  page.drawText("TERMS & CONDITIONS", { x: leftMargin, y, font: helveticaBold, size: 9, color: black });
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
    page.drawText(term, { x: leftMargin, y, font: helvetica, size: 7.5, color: gray });
    y -= 11;
  }

  // --- Footer ---
  const footerY = 24;
  page.drawLine({ start: { x: leftMargin, y: footerY + 8 }, end: { x: rightEdge, y: footerY + 8 }, thickness: 0.5, color: lightGray });
  page.drawText("R.S. Électronique Inc.", { x: leftMargin, y: footerY, font: helvetica, size: 7, color: gray });
  page.drawText(quote.quote_number, { x: width / 2 - helvetica.widthOfTextAtSize(quote.quote_number, 7) / 2, y: footerY, font: helvetica, size: 7, color: gray });
  page.drawText("Page 1 of 1", { x: rightEdge - helvetica.widthOfTextAtSize("Page 1 of 1", 7), y: footerY, font: helvetica, size: 7, color: gray });

  // --- Serialize ---
  const pdfBytes = await pdfDoc.save();

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = gmp?.gmp_number ?? "unknown";
  const storagePath = `${customerCode}/${gmpNumber}/${quote.quote_number}.pdf`;

  const pdfBuffer = Buffer.from(pdfBytes);

  await supabase.storage
    .from("quotes")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  await supabase
    .from("quotes")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quote_number}.pdf"`,
    },
  });
}
