import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rgb } from "pdf-lib";
import type { PDFPage, PDFFont } from "pdf-lib";
import {
  createPdfDoc,
  drawFooter,
  fmtDate,
  A4_WIDTH,
  A4_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  COLOR_DARK,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_LIGHT,
  COLOR_WHITE,
  COLOR_BG_ALT,
  COLOR_BORDER,
  type PdfFonts,
} from "@/lib/pdf/helpers";

// Brand accent matching the SHIPDOC template Lead-Free title (#1F487C)
const COLOR_ACCENT = rgb(31 / 255, 72 / 255, 124 / 255);

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

  const docType = req.nextUrl.searchParams.get("type") ?? "packing_slip";

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(code, company_name, contact_name, billing_address, shipping_address), gmps(gmp_number, board_name)"
    )
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const customer = job.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    billing_address: Record<string, string> | null;
    shipping_address: Record<string, string> | null;
  } | null;

  const gmp = job.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;

  const metadata = (job.metadata ?? {}) as Record<string, unknown>;
  const shipDate =
    (metadata.ship_date as string) ?? new Date().toISOString().split("T")[0];
  const courierName = (metadata.courier_name as string) ?? null;
  const trackingId = (metadata.tracking_id as string) ?? null;
  const fob = (metadata.fob as string) ?? "Saint-Laurent, QC";
  const deliveryTerms = (metadata.delivery_terms as string) ?? "Ground";
  const serialNumbers = (metadata.serial_numbers as string) ?? null;

  const formatAddress = (
    addr: Record<string, string> | null | undefined
  ): string[] => {
    if (!addr) return [];
    const lines: string[] = [];
    if (addr.street) lines.push(addr.street);
    const cityLine = [addr.city, addr.province, addr.postal_code]
      .filter(Boolean)
      .join(", ");
    if (cityLine) lines.push(cityLine);
    if (addr.country) lines.push(addr.country);
    return lines;
  };

  const shipToLines = formatAddress(customer?.shipping_address ?? null);
  const billToLines = formatAddress(customer?.billing_address ?? null);

  const { data: procurement } = await supabase
    .from("procurements")
    .select("proc_code")
    .eq("job_id", id)
    .limit(1)
    .maybeSingle();

  const procBatchCode = procurement?.proc_code ?? null;
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = gmp?.gmp_number ?? "unknown";

  let pdfBytes: Uint8Array;
  let fileName: string;

  if (docType === "compliance") {
    pdfBytes = await generateComplianceCertificate({
      jobNumber: job.job_number,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      poNumber: job.po_number ?? null,
      gmpNumber,
      boardName: gmp?.board_name,
      quantity: job.quantity,
      shipDate,
      procBatchCode,
      serialNumbers,
    });
    fileName = `${job.job_number}-compliance.pdf`;
  } else {
    pdfBytes = await generatePackingSlip({
      jobNumber: job.job_number,
      procBatchCode,
      poNumber: job.po_number ?? null,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      shipToLines,
      billToLines,
      courierName,
      trackingId,
      shipDate,
      deliveryTerms,
      fob,
      items: [
        {
          lineNumber: 1,
          partNumber: gmpNumber,
          description:
            gmp?.board_name ? `PCB Assembly — ${gmp.board_name}` : `PCB Assembly — ${gmpNumber}`,
          ordered: job.quantity,
          shipped: job.quantity,
          backOrder: 0,
        },
      ],
      notes: job.notes,
    });
    fileName = `${job.job_number}-packing-slip.pdf`;
  }

  // Upload to Supabase Storage
  const storagePath = `${customerCode}/${gmpNumber}/${fileName}`;
  await supabase.storage.from("jobs").upload(storagePath, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR_TEXT
) {
  page.drawText(text, { x, y, size, font, color });
}

function drawTextRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR_TEXT
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function drawTextCenter(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR_TEXT
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color = COLOR_TEXT,
  lineHeight = 1.6
): number {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size * lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size * lineHeight;
  }
  return currentY;
}

/**
 * Draw the RS company letterhead matching the SHIPDOC template:
 * - Company name (left), document title (right)
 * - Address, phone, email, web
 * - Accent separator line
 * Returns Y position below the letterhead.
 */
function drawShipdocLetterhead(
  page: PDFPage,
  fonts: PdfFonts,
  docTitle: string
): number {
  const { bold, regular } = fonts;
  const topY = A4_HEIGHT - MARGIN;

  // Title (right, accent color)
  const titleSize = 22;
  const titleW = bold.widthOfTextAtSize(docTitle, titleSize);
  page.drawText(docTitle, {
    x: A4_WIDTH - MARGIN - titleW,
    y: topY - titleSize + 4,
    size: titleSize,
    font: bold,
    color: COLOR_ACCENT,
  });

  // Company name (left, bold, large)
  drawText(page, "R.S. ELECTRONIQUE INC.", MARGIN, topY - 4, bold, 14, COLOR_DARK);

  // Company address/contact lines
  let y = topY - 20;
  const contactLines = [
    "5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9, Canada",
    "+1 (438) 833-8477   |   info@rspcbassembly.com",
    "www.rspcbassembly.com",
  ];
  for (const line of contactLines) {
    drawText(page, line, MARGIN, y, regular, 8, COLOR_MUTED);
    y -= 11;
  }

  // Accent bar separator
  const sepY = y - 4;
  page.drawRectangle({
    x: MARGIN,
    y: sepY,
    width: CONTENT_WIDTH,
    height: 2,
    color: COLOR_ACCENT,
  });

  return sepY - 16;
}

// ---------------------------------------------------------------------------
// Packing Slip — matches SHIPDOC V8 PackingSlip sheet
// ---------------------------------------------------------------------------

interface PackingSlipItem {
  lineNumber: number;
  partNumber: string;
  description: string;
  ordered: number;
  shipped: number;
  backOrder: number;
}

interface PackingSlipParams {
  jobNumber: string;
  procBatchCode: string | null;
  poNumber: string | null;
  customerName: string;
  contactName: string | null | undefined;
  shipToLines: string[];
  billToLines: string[];
  courierName: string | null;
  trackingId: string | null;
  shipDate: string | null;
  deliveryTerms: string;
  fob: string;
  items: PackingSlipItem[];
  notes: string | null | undefined;
}

async function generatePackingSlip(p: PackingSlipParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const dateStr = fmtDate(p.shipDate);

  // Letterhead
  let y = drawShipdocLetterhead(page, fonts, "PACKING SLIP");

  // ---- Info strip: DATE | JOB # | PO # | DELIVERY | FOB ----
  // Two rows of key/value cells matching the Excel layout (rows 2-5 and 6-7)
  const stripTop = y;
  const labelCol1X = MARGIN;
  const labelCol2X = MARGIN + CONTENT_WIDTH / 2 + 10;
  const valueOffset = 80;
  const lineH = 14;

  const drawKV = (
    label: string,
    value: string,
    x: number,
    rowY: number
  ) => {
    drawText(page, label, x, rowY, fonts.bold, 8, COLOR_DARK);
    drawText(page, value, x + valueOffset, rowY, fonts.regular, 9, COLOR_TEXT);
  };

  let r = stripTop;
  drawKV("DATE", dateStr, labelCol1X, r);
  drawKV("JOB #", p.jobNumber, labelCol2X, r);
  r -= lineH;
  drawKV("PO #", p.poNumber ?? "—", labelCol1X, r);
  drawKV("BATCH", p.procBatchCode ?? "—", labelCol2X, r);
  r -= lineH;
  drawKV("DELIVERY", p.deliveryTerms, labelCol1X, r);
  drawKV("FOB", p.fob, labelCol2X, r);
  r -= lineH;
  drawKV("COURIER", p.courierName ?? "—", labelCol1X, r);
  drawKV("TRACKING ID", p.trackingId ?? "—", labelCol2X, r);
  r -= lineH + 4;

  // Border around info strip
  page.drawRectangle({
    x: MARGIN - 4,
    y: r + 4,
    width: CONTENT_WIDTH + 8,
    height: stripTop - r + 8,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });

  y = r - 12;

  // ---- BILL TO / SHIP TO blocks ----
  const boxTop = y;
  const boxWidth = (CONTENT_WIDTH - 12) / 2;
  const billX = MARGIN;
  const shipX = MARGIN + boxWidth + 12;
  const boxHeight = 86;

  // Bill-To box
  page.drawRectangle({
    x: billX,
    y: boxTop - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });
  page.drawRectangle({
    x: billX,
    y: boxTop - 16,
    width: boxWidth,
    height: 16,
    color: COLOR_DARK,
  });
  drawText(page, "BILL TO:", billX + 6, boxTop - 12, fonts.bold, 8, COLOR_WHITE);

  let bY = boxTop - 28;
  drawText(page, p.customerName, billX + 6, bY, fonts.bold, 9, COLOR_DARK);
  bY -= 12;
  if (p.contactName) {
    drawText(page, `Attn: ${p.contactName}`, billX + 6, bY, fonts.regular, 8, COLOR_TEXT);
    bY -= 11;
  }
  for (const line of p.billToLines) {
    drawText(page, line, billX + 6, bY, fonts.regular, 8, COLOR_TEXT);
    bY -= 11;
  }

  // Ship-To box
  page.drawRectangle({
    x: shipX,
    y: boxTop - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });
  page.drawRectangle({
    x: shipX,
    y: boxTop - 16,
    width: boxWidth,
    height: 16,
    color: COLOR_DARK,
  });
  drawText(page, "SHIP TO:", shipX + 6, boxTop - 12, fonts.bold, 8, COLOR_WHITE);

  let sY = boxTop - 28;
  drawText(page, p.customerName, shipX + 6, sY, fonts.bold, 9, COLOR_DARK);
  sY -= 12;
  if (p.contactName) {
    drawText(page, `Attn: ${p.contactName}`, shipX + 6, sY, fonts.regular, 8, COLOR_TEXT);
    sY -= 11;
  }
  for (const line of p.shipToLines.length ? p.shipToLines : p.billToLines) {
    drawText(page, line, shipX + 6, sY, fonts.regular, 8, COLOR_TEXT);
    sY -= 11;
  }

  y = boxTop - boxHeight - 18;

  // ---- Line items table: # | LINE # | PART NUMBER | DESCRIPTION | ORDERED | SHIPPED | CURRENT | BACK ORDER ----
  const tableX = MARGIN;
  const col = {
    num: { x: tableX + 4, w: 22, label: "#", align: "center" as const },
    line: { x: tableX + 26, w: 36, label: "LINE #", align: "center" as const },
    part: { x: tableX + 62, w: 120, label: "PART NUMBER", align: "left" as const },
    desc: { x: tableX + 182, w: 175, label: "DESCRIPTION", align: "left" as const },
    ordered: { x: tableX + 357, w: 48, label: "ORDERED", align: "right" as const },
    shipped: { x: tableX + 405, w: 44, label: "SHIPPED", align: "right" as const },
    current: { x: tableX + 449, w: 36, label: "CURRENT", align: "right" as const },
    back: { x: tableX + 485, w: 30, label: "BACK ORDER", align: "right" as const },
  };

  // Header row
  const headerH = 20;
  page.drawRectangle({
    x: tableX,
    y: y - headerH,
    width: CONTENT_WIDTH,
    height: headerH,
    color: COLOR_DARK,
  });
  const hdrTextY = y - 13;
  for (const c of Object.values(col)) {
    const w = fonts.bold.widthOfTextAtSize(c.label, 7);
    let tx = c.x;
    if (c.align === "center") tx = c.x + (c.w - w) / 2;
    else if (c.align === "right") tx = c.x + c.w - w - 2;
    page.drawText(c.label, {
      x: tx,
      y: hdrTextY,
      size: 7,
      font: fonts.bold,
      color: COLOR_WHITE,
    });
  }
  y -= headerH;

  // Data rows
  const rowH = 22;
  let totalOrdered = 0;
  let totalShipped = 0;
  let totalBack = 0;

  for (let i = 0; i < p.items.length; i++) {
    const item = p.items[i];
    totalOrdered += item.ordered;
    totalShipped += item.shipped;
    totalBack += item.backOrder;
    const current = item.shipped;

    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: COLOR_BG_ALT,
      });
    }

    const ty = y - 14;

    const drawCell = (
      c: { x: number; w: number; align: "left" | "center" | "right" },
      text: string,
      font: PDFFont = fonts.regular,
      size = 9
    ) => {
      const w = font.widthOfTextAtSize(text, size);
      let tx = c.x;
      if (c.align === "center") tx = c.x + (c.w - w) / 2;
      else if (c.align === "right") tx = c.x + c.w - w - 2;
      page.drawText(text, { x: tx, y: ty, size, font, color: COLOR_TEXT });
    };

    drawCell(col.num, String(i + 1));
    drawCell(col.line, String(item.lineNumber));
    drawCell(col.part, item.partNumber, fonts.bold);
    drawCell(col.desc, item.description);
    drawCell(col.ordered, String(item.ordered));
    drawCell(col.shipped, String(item.shipped));
    drawCell(col.current, String(current));
    drawCell(col.back, String(item.backOrder));

    // Row bottom line
    page.drawLine({
      start: { x: tableX, y: y - rowH },
      end: { x: tableX + CONTENT_WIDTH, y: y - rowH },
      thickness: 0.4,
      color: COLOR_BORDER,
    });
    y -= rowH;
  }

  // Fill empty rows to match template (always 8 visual rows)
  const minRows = 8;
  for (let i = p.items.length; i < minRows; i++) {
    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: COLOR_BG_ALT,
      });
    }
    page.drawLine({
      start: { x: tableX, y: y - rowH },
      end: { x: tableX + CONTENT_WIDTH, y: y - rowH },
      thickness: 0.4,
      color: COLOR_BORDER,
    });
    y -= rowH;
  }

  // Table border
  const tableBottom = y;
  page.drawRectangle({
    x: tableX,
    y: tableBottom,
    width: CONTENT_WIDTH,
    height: headerH + Math.max(p.items.length, minRows) * rowH,
    borderColor: COLOR_DARK,
    borderWidth: 0.75,
  });

  // ---- TOTAL row ----
  y -= 8;
  page.drawLine({
    start: { x: tableX + 300, y: y + 2 },
    end: { x: tableX + CONTENT_WIDTH, y: y + 2 },
    thickness: 1.5,
    color: COLOR_DARK,
  });
  y -= 14;
  drawTextRight(page, "TOTAL:", col.ordered.x - 6, y, fonts.bold, 10, COLOR_DARK);
  drawTextRight(
    page,
    String(totalOrdered),
    col.ordered.x + col.ordered.w - 2,
    y,
    fonts.bold,
    10,
    COLOR_DARK
  );
  drawTextRight(
    page,
    String(totalShipped),
    col.shipped.x + col.shipped.w - 2,
    y,
    fonts.bold,
    10,
    COLOR_DARK
  );
  drawTextRight(
    page,
    String(totalShipped),
    col.current.x + col.current.w - 2,
    y,
    fonts.bold,
    10,
    COLOR_DARK
  );
  drawTextRight(
    page,
    String(totalBack),
    col.back.x + col.back.w - 2,
    y,
    fonts.bold,
    10,
    COLOR_DARK
  );

  // ---- Compliance note (from template) ----
  y -= 24;
  const noteText =
    "Note: We hereby certify that the items shipped in this package are in compliance with the requirements specified on your P.O.";
  y = drawWrappedText(page, fonts.regular, noteText, MARGIN, y, CONTENT_WIDTH, 8, COLOR_TEXT, 1.5);
  y -= 4;

  // Optional customer notes
  if (p.notes) {
    y -= 4;
    drawText(page, "NOTES:", MARGIN, y, fonts.bold, 8, COLOR_DARK);
    y -= 11;
    y = drawWrappedText(page, fonts.regular, p.notes, MARGIN, y, CONTENT_WIDTH, 8, COLOR_MUTED, 1.5);
    y -= 2;
  }

  // ---- Signed by block ----
  y -= 12;
  drawText(page, "Signed by:", MARGIN, y, fonts.bold, 9, COLOR_DARK);
  const sigLineY = y - 4;
  page.drawLine({
    start: { x: MARGIN + 60, y: sigLineY },
    end: { x: MARGIN + 260, y: sigLineY },
    thickness: 0.5,
    color: COLOR_LIGHT,
  });
  drawText(page, "Date:", MARGIN + 290, y, fonts.bold, 9, COLOR_DARK);
  page.drawLine({
    start: { x: MARGIN + 320, y: sigLineY },
    end: { x: A4_WIDTH - MARGIN, y: sigLineY },
    thickness: 0.5,
    color: COLOR_LIGHT,
  });

  // ---- Bottom disclaimer ----
  const disclaimerY = 58;
  page.drawLine({
    start: { x: MARGIN, y: disclaimerY + 20 },
    end: { x: A4_WIDTH - MARGIN, y: disclaimerY + 20 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  const disclaimer1 =
    "IN NO EVENT WILL R.S. ELECTRONIQUE INC. BE LIABLE FOR LOST PROFITS OR OTHER CONSEQUENTIAL AND INCIDENTAL DAMAGES. FOR REPLACEMENT,";
  const disclaimer2 =
    "THE DEFECTIVE PRODUCTS MUST BE RETURNED WITHIN 30 DAYS OF THE SHIPMENT DATE WITH A RETURN AUTHORIZATION NUMBER.";
  drawTextCenter(page, disclaimer1, A4_WIDTH / 2, disclaimerY + 10, fonts.regular, 6, COLOR_MUTED);
  drawTextCenter(page, disclaimer2, A4_WIDTH / 2, disclaimerY + 2, fonts.regular, 6, COLOR_MUTED);

  // Footer
  drawFooter(
    page,
    fonts,
    "R.S. Electronique Inc.",
    `Packing Slip — ${p.jobNumber}`,
    1,
    1
  );

  return doc.save();
}

// ---------------------------------------------------------------------------
// Compliance Certificate — matches SHIPDOC V8 Compliance + Lead-Free sheets
// Produces a 2-page PDF: Page 1 = Lead-Free Certification, Page 2 = IPC Cert
// ---------------------------------------------------------------------------

interface ComplianceParams {
  jobNumber: string;
  customerName: string;
  contactName: string | null | undefined;
  poNumber: string | null;
  gmpNumber: string;
  boardName: string | null | undefined;
  quantity: number;
  shipDate: string | null;
  procBatchCode: string | null;
  serialNumbers: string | null;
}

async function generateComplianceCertificate(
  p: ComplianceParams
): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const dateStr = fmtDate(p.shipDate);

  // ============================================================
  // PAGE 1 — Lead-Free Certification (SHIPDOC sheet1)
  // ============================================================
  const page1 = doc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Right-side company block (as in template rows L2-L6)
  let headerY = A4_HEIGHT - MARGIN;
  const rightX = A4_WIDTH - MARGIN;
  drawTextRight(page1, "R.S. Electronique Inc.", rightX, headerY - 4, fonts.bold, 11, COLOR_DARK);
  drawTextRight(page1, "5580 Vanden Abeele,", rightX, headerY - 18, fonts.regular, 9, COLOR_MUTED);
  drawTextRight(page1, "Ville Saint Laurent,", rightX, headerY - 30, fonts.regular, 9, COLOR_MUTED);
  drawTextRight(page1, "Quebec, H4S1P9", rightX, headerY - 42, fonts.regular, 9, COLOR_MUTED);
  drawTextRight(page1, "www.rspcbassembly.com", rightX, headerY - 54, fonts.regular, 9, COLOR_MUTED);

  // Title — large, centered, accent color ("Lead-Free Certification")
  let y1 = headerY - 90;
  drawTextCenter(page1, "Lead-Free Certification", A4_WIDTH / 2, y1, fonts.bold, 22, COLOR_ACCENT);
  y1 -= 28;

  // Accent underline below title
  page1.drawLine({
    start: { x: MARGIN + 120, y: y1 + 6 },
    end: { x: A4_WIDTH - MARGIN - 120, y: y1 + 6 },
    thickness: 1,
    color: COLOR_ACCENT,
  });
  y1 -= 8;

  // Body certification text
  const leadFreeBody =
    "The following document certifies that R.S. Electronique Inc. has followed the lead-free standards in accordance with the EU RoHS directive 2011/65/EU and the EU requirements commission delegated directive 2015/863.";
  y1 = drawWrappedText(
    page1,
    fonts.regular,
    leadFreeBody,
    MARGIN + 20,
    y1,
    CONTENT_WIDTH - 40,
    11,
    COLOR_TEXT,
    1.55
  );
  y1 -= 14;

  // ---- ORDER info table ----
  // "ORDER" banner
  const orderBannerH = 20;
  page1.drawRectangle({
    x: MARGIN + 20,
    y: y1 - orderBannerH,
    width: CONTENT_WIDTH - 40,
    height: orderBannerH,
    color: COLOR_ACCENT,
  });
  drawTextCenter(
    page1,
    "ORDER",
    A4_WIDTH / 2,
    y1 - 14,
    fonts.bold,
    12,
    COLOR_WHITE
  );
  y1 -= orderBannerH;

  // 2x3 grid of labels/values
  const tblX = MARGIN + 20;
  const tblW = CONTENT_WIDTH - 40;
  const cellW = tblW / 3;
  const cellH = 36;

  const orderCells: Array<{ label: string; value: string }> = [
    { label: "Customer Name", value: p.customerName },
    { label: "Product Number", value: p.gmpNumber },
    { label: "Quantity", value: `${p.quantity}` },
    { label: "Purchase Order", value: p.poNumber ?? "—" },
    { label: "Date", value: dateStr },
    { label: "Job #", value: p.jobNumber },
  ];

  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 3);
    const colIdx = i % 3;
    const cx = tblX + colIdx * cellW;
    const cy = y1 - (row + 1) * cellH;
    page1.drawRectangle({
      x: cx,
      y: cy,
      width: cellW,
      height: cellH,
      borderColor: COLOR_BORDER,
      borderWidth: 0.75,
    });
    // Label
    drawText(page1, orderCells[i].label, cx + 6, cy + cellH - 12, fonts.bold, 9, COLOR_DARK);
    // Value
    drawText(page1, orderCells[i].value, cx + 6, cy + 10, fonts.regular, 10, COLOR_TEXT);
  }

  y1 -= cellH * 2 + 18;

  // ---- Solder materials table ----
  drawText(page1, "Primary Solder Material Used", MARGIN + 20, y1, fonts.bold, 11, COLOR_DARK);
  y1 -= 8;

  const solderCols = [
    { label: "Manufacturer", w: tblW * 0.33 },
    { label: "Solder Type", w: tblW * 0.37 },
    { label: "Type of Product", w: tblW * 0.3 },
  ];
  const solderRows = [
    ["Inventec", "ECOREL FREE 305-16 — SAC305", "Solder Paste"],
    ["AIM Solder", "SAC305", "Solder Wire"],
  ];

  // Solder header row
  const solderRowH = 22;
  const solderHdrH = 20;
  let sX = tblX;
  page1.drawRectangle({
    x: tblX,
    y: y1 - solderHdrH,
    width: tblW,
    height: solderHdrH,
    color: COLOR_DARK,
  });
  for (const c of solderCols) {
    drawText(page1, c.label, sX + 6, y1 - 14, fonts.bold, 9, COLOR_WHITE);
    sX += c.w;
  }
  y1 -= solderHdrH;

  // Solder data rows
  for (let r = 0; r < solderRows.length; r++) {
    if (r % 2 === 0) {
      page1.drawRectangle({
        x: tblX,
        y: y1 - solderRowH,
        width: tblW,
        height: solderRowH,
        color: COLOR_BG_ALT,
      });
    }
    let cx = tblX;
    for (let c = 0; c < solderCols.length; c++) {
      drawText(page1, solderRows[r][c], cx + 6, y1 - 15, fonts.regular, 10, COLOR_TEXT);
      cx += solderCols[c].w;
    }
    page1.drawLine({
      start: { x: tblX, y: y1 - solderRowH },
      end: { x: tblX + tblW, y: y1 - solderRowH },
      thickness: 0.4,
      color: COLOR_BORDER,
    });
    y1 -= solderRowH;
  }
  // Table border
  const solderTblBottom = y1;
  page1.drawRectangle({
    x: tblX,
    y: solderTblBottom,
    width: tblW,
    height: solderHdrH + solderRows.length * solderRowH,
    borderColor: COLOR_DARK,
    borderWidth: 0.75,
  });

  y1 -= 36;

  // ---- Approved by signature block ----
  drawText(page1, "Approved by:", MARGIN + 20, y1, fonts.bold, 10, COLOR_DARK);
  y1 -= 28;
  // Signature line
  page1.drawLine({
    start: { x: MARGIN + 20, y: y1 + 4 },
    end: { x: MARGIN + 260, y: y1 + 4 },
    thickness: 0.5,
    color: COLOR_DARK,
  });
  drawText(page1, "Shamsuddin Patel", MARGIN + 20, y1 - 10, fonts.regular, 9, COLOR_TEXT);
  drawText(page1, "Quality Manager", MARGIN + 20, y1 - 22, fonts.regular, 8, COLOR_MUTED);

  // Date (right side)
  page1.drawLine({
    start: { x: A4_WIDTH - MARGIN - 200, y: y1 + 4 },
    end: { x: A4_WIDTH - MARGIN - 20, y: y1 + 4 },
    thickness: 0.5,
    color: COLOR_DARK,
  });
  drawText(page1, dateStr, A4_WIDTH - MARGIN - 200, y1 - 10, fonts.regular, 9, COLOR_TEXT);
  drawText(page1, "Date", A4_WIDTH - MARGIN - 200, y1 - 22, fonts.regular, 8, COLOR_MUTED);

  // ---- Document metadata footer ----
  const metaY = 60;
  page1.drawLine({
    start: { x: MARGIN, y: metaY + 20 },
    end: { x: A4_WIDTH - MARGIN, y: metaY + 20 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  drawText(page1, "Document name: Lead Free Certification", MARGIN, metaY + 10, fonts.regular, 7, COLOR_MUTED);
  drawTextRight(page1, "Version: 2.0", A4_WIDTH - MARGIN, metaY + 10, fonts.regular, 7, COLOR_MUTED);
  drawTextCenter(
    page1,
    "For any questions or assistance, please contact info@rspcbassembly.com",
    A4_WIDTH / 2,
    metaY,
    fonts.regular,
    7,
    COLOR_MUTED
  );

  drawFooter(
    page1,
    fonts,
    "R.S. Electronique Inc.",
    `Lead-Free Certification — ${p.jobNumber}`,
    1,
    2
  );

  // ============================================================
  // PAGE 2 — Certificate of Compliance / IPC (SHIPDOC sheet2)
  // ============================================================
  const page2 = doc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Header block (matches template row 1)
  let y2 = A4_HEIGHT - MARGIN - 4;
  drawTextCenter(page2, "R.S. ELECTRONIQUE INC.", A4_WIDTH / 2, y2, fonts.bold, 16, COLOR_DARK);
  y2 -= 18;
  drawTextCenter(
    page2,
    "5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9",
    A4_WIDTH / 2,
    y2,
    fonts.regular,
    10,
    COLOR_MUTED
  );
  y2 -= 13;
  drawTextCenter(
    page2,
    "TEL: (514) 581-9925          FAX: (514) 956-8950",
    A4_WIDTH / 2,
    y2,
    fonts.regular,
    9,
    COLOR_MUTED
  );
  y2 -= 11;
  drawTextCenter(
    page2,
    "info@rspcbassembly.com   |   www.rspcbassembly.com",
    A4_WIDTH / 2,
    y2,
    fonts.regular,
    9,
    COLOR_MUTED
  );
  y2 -= 22;

  // Accent separator
  page2.drawRectangle({
    x: MARGIN,
    y: y2,
    width: CONTENT_WIDTH,
    height: 2,
    color: COLOR_ACCENT,
  });
  y2 -= 26;

  // Title "Certificate of Compliance"
  drawTextCenter(
    page2,
    "Certificate of Compliance",
    A4_WIDTH / 2,
    y2,
    fonts.bold,
    20,
    COLOR_DARK
  );
  y2 -= 30;

  // ---- Body certification statement (IPC-A-610) ----
  // Template si#78 — use bold/italic approximations within body
  drawText(page2, "R.S. ELECTRONIQUE INC.", MARGIN, y2, fonts.bold, 11, COLOR_DARK);
  const leadW = fonts.bold.widthOfTextAtSize("R.S. ELECTRONIQUE INC.", 11);
  drawText(
    page2,
    " hereby certifies that all the PCB's are fully compliant",
    MARGIN + leadW,
    y2,
    fonts.regular,
    11,
    COLOR_TEXT
  );
  y2 -= 16;
  const bodyRest =
    "with the following standards: IPC and IPC-A-610 Acceptability of Electronic Assemblies. We certify that the assembly was done according to the P.O. requirement.";
  y2 = drawWrappedText(page2, fonts.regular, bodyRest, MARGIN, y2, CONTENT_WIDTH, 11, COLOR_TEXT, 1.55);
  y2 -= 18;

  // ---- Job/product details — label/value pairs matching template rows 18-34 ----
  const labelW = 220;
  const drawRow = (label: string, value: string) => {
    drawText(page2, label, MARGIN, y2, fonts.bold, 10, COLOR_DARK);
    drawText(page2, value, MARGIN + labelW, y2, fonts.regular, 10, COLOR_TEXT);
    page2.drawLine({
      start: { x: MARGIN + labelW, y: y2 - 3 },
      end: { x: A4_WIDTH - MARGIN, y: y2 - 3 },
      thickness: 0.4,
      color: COLOR_BORDER,
    });
    y2 -= 22;
  };

  drawRow("Clients Name:", p.customerName);
  drawRow("Client P.O. No:", p.poNumber ?? "—");
  drawRow("Solder Type:", "SAC305 (Lead-Free)");
  drawRow("IPC Class:", "Class 2 — Dedicated Service Electronic Products");
  drawRow("Global Manufacturing Package:", p.gmpNumber);
  drawRow(
    "BOM Name:",
    p.boardName ? `${p.gmpNumber} — ${p.boardName}` : p.gmpNumber
  );
  drawRow("Gerber Name:", p.gmpNumber);
  drawRow("QTY Shipped:", `${p.quantity} units`);
  drawRow(
    "Product Serial No:",
    p.serialNumbers ?? (p.procBatchCode ? `Batch ${p.procBatchCode}` : "—")
  );

  y2 -= 20;

  // ---- Signature block ----
  const sigY = Math.max(y2, 160);

  // Left: Date
  drawText(page2, "Date (MM/DD/YYYY)", MARGIN, sigY, fonts.bold, 9, COLOR_DARK);
  page2.drawLine({
    start: { x: MARGIN, y: sigY - 20 },
    end: { x: MARGIN + 180, y: sigY - 20 },
    thickness: 0.5,
    color: COLOR_DARK,
  });
  drawText(page2, dateStr, MARGIN, sigY - 18, fonts.regular, 10, COLOR_TEXT);

  // Right: Quality Manager
  const qmX = A4_WIDTH - MARGIN - 220;
  drawText(page2, "Shamsuddin Patel", qmX, sigY, fonts.bold, 10, COLOR_DARK);
  page2.drawLine({
    start: { x: qmX, y: sigY - 20 },
    end: { x: qmX + 200, y: sigY - 20 },
    thickness: 0.5,
    color: COLOR_DARK,
  });
  drawText(page2, "Quality Manager Signature", qmX, sigY - 32, fonts.regular, 8, COLOR_MUTED);

  drawFooter(
    page2,
    fonts,
    "R.S. Electronique Inc.",
    `Certificate of Compliance — ${p.jobNumber}`,
    2,
    2
  );

  return doc.save();
}
