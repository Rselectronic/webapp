import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface POLine {
  mpn: string;
  description: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
}

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

/** Truncate text to fit within a given width (approximate). */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

// Colors
const BLACK = rgb(0.06, 0.09, 0.16); // #0f172a
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.28, 0.33, 0.42); // #475569
const LIGHT_GRAY = rgb(0.58, 0.64, 0.71); // #94a3b8
const ROW_ALT = rgb(0.97, 0.98, 0.99); // #f8fafc
const WHITE = rgb(1, 1, 1);
const BORDER = rgb(0.89, 0.91, 0.94); // #e2e8f0

export async function GET(
  _req: NextRequest,
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

  // Fetch PO with related procurement -> job -> customer
  const { data: po, error } = await supabase
    .from("supplier_pos")
    .select(
      "*, procurements(proc_code, jobs(job_number, customers(code, company_name)))"
    )
    .eq("id", id)
    .single();

  if (error || !po) {
    return NextResponse.json(
      { error: "Supplier PO not found" },
      { status: 404 }
    );
  }

  const procurement = po.procurements as unknown as {
    proc_code: string;
    jobs: {
      job_number: string;
      customers: { code: string; company_name: string } | null;
    } | null;
  } | null;

  const lines = (po.lines ?? []) as POLine[];
  const dateStr = fmtDate(po.created_at);

  const procCode = procurement?.proc_code ?? null;
  const jobNumber = procurement?.jobs?.job_number ?? null;
  const customerName = procurement?.jobs?.customers?.company_name ?? null;
  const totalAmount = Number(po.total_amount) || 0;

  // ── Build PDF ──────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // Column widths for the table (absolute points)
  const COL_MPN_W = CONTENT_W * 0.25;
  const COL_DESC_W = CONTENT_W * 0.33;
  const COL_QTY_W = CONTENT_W * 0.12;
  const COL_PRICE_W = CONTENT_W * 0.15;
  const COL_TOTAL_W = CONTENT_W * 0.15;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  let pageNum = 1;
  const pageNumbers: { page: ReturnType<typeof doc.addPage>; num: number }[] = [
    { page, num: pageNum },
  ];

  /** Add a new page if remaining space is too small. */
  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) {
      // leave room for footer
      drawFooter(page, pageNum);
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      pageNumbers.push({ page, num: pageNum });
      y = PAGE_H - MARGIN;
    }
  }

  function drawFooter(
    pg: ReturnType<typeof doc.addPage>,
    num: number
  ) {
    const footerY = 24;
    // top border
    pg.drawLine({
      start: { x: MARGIN, y: footerY + 12 },
      end: { x: PAGE_W - MARGIN, y: footerY + 12 },
      thickness: 0.5,
      color: BORDER,
    });
    pg.drawText("R.S. \u00c9lectronique Inc.", {
      x: MARGIN,
      y: footerY,
      size: 7,
      font: fontRegular,
      color: LIGHT_GRAY,
    });
    pg.drawText(po.po_number, {
      x: PAGE_W / 2 - fontRegular.widthOfTextAtSize(po.po_number, 7) / 2,
      y: footerY,
      size: 7,
      font: fontRegular,
      color: LIGHT_GRAY,
    });
    // Page number placeholder text -- we'll fill totalPages at the end
    const pgText = `Page ${num}`;
    pg.drawText(pgText, {
      x: PAGE_W - MARGIN - fontRegular.widthOfTextAtSize(pgText, 7),
      y: footerY,
      size: 7,
      font: fontRegular,
      color: LIGHT_GRAY,
    });
  }

  // ── Header ────────────────────────────────────────────────
  // Company name (left)
  page.drawText("R.S. \u00c9LECTRONIQUE INC.", {
    x: MARGIN,
    y: y,
    size: 14,
    font: fontBold,
    color: BLACK,
  });
  y -= 13;
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", {
    x: MARGIN,
    y: y,
    size: 8,
    font: fontRegular,
    color: GRAY,
  });
  y -= 11;
  page.drawText("+1 (438) 833-8477 \u00b7 info@rspcbassembly.com", {
    x: MARGIN,
    y: y,
    size: 8,
    font: fontRegular,
    color: GRAY,
  });

  // PO title + number (right side, same vertical area)
  const titleY = PAGE_H - MARGIN;
  const poTitle = "PURCHASE ORDER";
  page.drawText(poTitle, {
    x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(poTitle, 18),
    y: titleY,
    size: 18,
    font: fontBold,
    color: BLACK,
  });
  page.drawText(po.po_number, {
    x:
      PAGE_W -
      MARGIN -
      fontRegular.widthOfTextAtSize(po.po_number, 10),
    y: titleY - 16,
    size: 10,
    font: fontRegular,
    color: DARK,
  });
  page.drawText(dateStr, {
    x:
      PAGE_W - MARGIN - fontRegular.widthOfTextAtSize(dateStr, 9),
    y: titleY - 28,
    size: 9,
    font: fontRegular,
    color: GRAY,
  });

  // Separator line
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_W - MARGIN, y: y },
    thickness: 2,
    color: BLACK,
  });
  y -= 20;

  // ── Supplier + Order Details ──────────────────────────────
  const infoLeftX = MARGIN;
  const infoRightX = MARGIN + CONTENT_W * 0.52;

  // Supplier block
  page.drawText("SUPPLIER", {
    x: infoLeftX,
    y: y,
    size: 9,
    font: fontBold,
    color: BLACK,
  });
  y -= 14;
  page.drawText(po.supplier_name, {
    x: infoLeftX,
    y: y,
    size: 9,
    font: fontRegular,
    color: GRAY,
  });
  if (po.supplier_email) {
    y -= 13;
    page.drawText(po.supplier_email, {
      x: infoLeftX,
      y: y,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
  }

  // Order details block (right column, same y range)
  let detailY = y + (po.supplier_email ? 27 : 14);
  page.drawText("ORDER DETAILS", {
    x: infoRightX,
    y: detailY,
    size: 9,
    font: fontBold,
    color: BLACK,
  });
  detailY -= 14;
  if (procCode) {
    page.drawText(`PROC: ${procCode}`, {
      x: infoRightX,
      y: detailY,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
    detailY -= 13;
  }
  if (jobNumber) {
    page.drawText(`Job: ${jobNumber}`, {
      x: infoRightX,
      y: detailY,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
    detailY -= 13;
  }
  if (customerName) {
    page.drawText(`Customer: ${customerName}`, {
      x: infoRightX,
      y: detailY,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
    detailY -= 13;
  }
  page.drawText(`Lines: ${lines.length}`, {
    x: infoRightX,
    y: detailY,
    size: 9,
    font: fontRegular,
    color: GRAY,
  });

  y -= 24;

  // ── Table Header ──────────────────────────────────────────
  const TABLE_ROW_H = 18;
  const HEADER_H = 22;

  function drawTableHeader() {
    // Background
    page.drawRectangle({
      x: MARGIN,
      y: y - HEADER_H + 4,
      width: CONTENT_W,
      height: HEADER_H,
      color: BLACK,
    });

    const headerY = y - HEADER_H + 10;
    let colX = MARGIN + 8;

    page.drawText("MPN", {
      x: colX,
      y: headerY,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
    colX += COL_MPN_W;

    page.drawText("Description", {
      x: colX,
      y: headerY,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
    colX += COL_DESC_W;

    const qtyLabel = "Qty";
    page.drawText(qtyLabel, {
      x: colX + COL_QTY_W - 8 - fontBold.widthOfTextAtSize(qtyLabel, 8),
      y: headerY,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
    colX += COL_QTY_W;

    const priceLabel = "Unit Price";
    page.drawText(priceLabel, {
      x: colX + COL_PRICE_W - 8 - fontBold.widthOfTextAtSize(priceLabel, 8),
      y: headerY,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
    colX += COL_PRICE_W;

    const totalLabel = "Total";
    page.drawText(totalLabel, {
      x: colX + COL_TOTAL_W - 8 - fontBold.widthOfTextAtSize(totalLabel, 8),
      y: headerY,
      size: 8,
      font: fontBold,
      color: WHITE,
    });

    y -= HEADER_H;
  }

  drawTableHeader();

  // ── Table Rows ────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    ensureSpace(TABLE_ROW_H + 4);

    // If we're at the top of a new page, redraw the header
    if (y === PAGE_H - MARGIN) {
      drawTableHeader();
    }

    const line = lines[i];

    // Alternating row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - TABLE_ROW_H + 4,
        width: CONTENT_W,
        height: TABLE_ROW_H,
        color: ROW_ALT,
      });
    }

    // Bottom border
    page.drawLine({
      start: { x: MARGIN, y: y - TABLE_ROW_H + 4 },
      end: { x: PAGE_W - MARGIN, y: y - TABLE_ROW_H + 4 },
      thickness: 0.5,
      color: BORDER,
    });

    const rowTextY = y - TABLE_ROW_H + 9;
    let colX = MARGIN + 8;

    // MPN
    const mpnText = truncate(line.mpn || "\u2014", 22);
    page.drawText(mpnText, {
      x: colX,
      y: rowTextY,
      size: 9,
      font: fontRegular,
      color: DARK,
    });
    colX += COL_MPN_W;

    // Description
    const descText = truncate(line.description ?? "\u2014", 32);
    page.drawText(descText, {
      x: colX,
      y: rowTextY,
      size: 9,
      font: fontRegular,
      color: DARK,
    });
    colX += COL_DESC_W;

    // Qty (right-aligned)
    const qtyStr = String(line.qty);
    page.drawText(qtyStr, {
      x: colX + COL_QTY_W - 8 - fontRegular.widthOfTextAtSize(qtyStr, 9),
      y: rowTextY,
      size: 9,
      font: fontRegular,
      color: DARK,
    });
    colX += COL_QTY_W;

    // Unit Price (right-aligned)
    const priceStr = fmt(line.unit_price);
    page.drawText(priceStr, {
      x: colX + COL_PRICE_W - 8 - fontRegular.widthOfTextAtSize(priceStr, 9),
      y: rowTextY,
      size: 9,
      font: fontRegular,
      color: DARK,
    });
    colX += COL_PRICE_W;

    // Line Total (right-aligned)
    const totalStr = fmt(line.line_total);
    page.drawText(totalStr, {
      x: colX + COL_TOTAL_W - 8 - fontRegular.widthOfTextAtSize(totalStr, 9),
      y: rowTextY,
      size: 9,
      font: fontRegular,
      color: DARK,
    });

    y -= TABLE_ROW_H;
  }

  // ── Grand Total ───────────────────────────────────────────
  ensureSpace(40);

  // Top border for total
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_W - MARGIN, y: y },
    thickness: 1.5,
    color: BLACK,
  });
  y -= 18;

  const grandTotalLabel = "Grand Total (CAD)";
  const grandTotalValue = fmt(totalAmount);
  const labelW = fontBold.widthOfTextAtSize(grandTotalLabel, 11);
  const valueW = fontBold.widthOfTextAtSize(grandTotalValue, 11);

  page.drawText(grandTotalLabel, {
    x: PAGE_W - MARGIN - valueW - 16 - labelW,
    y: y,
    size: 11,
    font: fontBold,
    color: BLACK,
  });
  page.drawText(grandTotalValue, {
    x: PAGE_W - MARGIN - valueW,
    y: y,
    size: 11,
    font: fontBold,
    color: BLACK,
  });
  y -= 24;

  // ── Terms ─────────────────────────────────────────────────
  ensureSpace(60);

  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_W - MARGIN, y: y },
    thickness: 0.5,
    color: BORDER,
  });
  y -= 14;

  const termsLines = [
    `Please confirm receipt of this purchase order and provide expected ship date.`,
    `All shipments should reference PO number ${po.po_number}.`,
    `Ship to: R.S. \u00c9lectronique Inc., 5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9, Canada.`,
    `All amounts are in Canadian Dollars (CAD).`,
  ];
  for (const tl of termsLines) {
    page.drawText(tl, {
      x: MARGIN,
      y: y,
      size: 8,
      font: fontRegular,
      color: LIGHT_GRAY,
    });
    y -= 12;
  }

  // Draw footer on the last page
  drawFooter(page, pageNum);

  // Update page footers with total page count (re-draw "Page X of Y")
  // Since pdf-lib doesn't support dynamic render callbacks, we already drew
  // "Page N" in drawFooter. For multi-page POs we could overlay, but the
  // simple "Page N" is sufficient for typical supplier POs.

  // ── Serialize ─────────────────────────────────────────────
  const pdfBytes = await doc.save();

  // Upload to Supabase Storage
  const customerCode =
    procurement?.jobs?.customers?.code ?? "unknown";
  const storagePath = `${customerCode}/${po.po_number}.pdf`;

  await supabase.storage.from("procurement").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  // Persist storage path on the PO record
  await supabase
    .from("supplier_pos")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${po.po_number}.pdf"`,
    },
  });
}
