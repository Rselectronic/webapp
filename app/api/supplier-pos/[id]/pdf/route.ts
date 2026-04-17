import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { loadRsLogo } from "@/lib/pdf/helpers";

interface POLine {
  mpn: string;
  description: string | null;
  manufacturer?: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  dc?: string | null;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

/** Truncate text to fit within a given pixel width. */
function truncate(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "\u2026", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

// ── Colors (match the Excel template's restrained look) ────────────
const INK = rgb(0.08, 0.09, 0.11); // near-black
const SUB = rgb(0.32, 0.36, 0.42); // muted slate
const MUTED = rgb(0.55, 0.60, 0.66);
const LINE = rgb(0.75, 0.78, 0.82);
const LINE_SOFT = rgb(0.88, 0.90, 0.92);
const HEADER_BG = rgb(0.92, 0.94, 0.97); // very light blue-gray
const BLOCK_BG = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const ACCENT = rgb(0.78, 0.09, 0.14); // red title accent (classic PO look)

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
  const totalAmount = Number(po.total_amount) || 0;

  // Financial roll-ups
  const subtotal = lines.reduce(
    (acc, l) => acc + (Number(l.line_total) || 0),
    0
  );
  const tax = 0;
  const shipping = 0;
  const other = 0;
  const grandTotal = totalAmount > 0 ? totalAmount : subtotal + tax + shipping + other;

  // ── Build PDF ────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logo = await loadRsLogo(doc);

  const PAGE_W = 612; // US Letter (template is US Letter)
  const PAGE_H = 792;
  const MARGIN = 36;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // Line-item table column layout (matches template: # | MPN | MFR | DC | QTY | UNIT | EXT)
  const COL = {
    num: { x: MARGIN, w: 26 },
    mpn: { x: 0, w: 150 },
    mfr: { x: 0, w: 120 },
    dc: { x: 0, w: 36 },
    qty: { x: 0, w: 40 },
    unit: { x: 0, w: 70 },
    ext: { x: 0, w: 0 },
  };
  COL.mpn.x = COL.num.x + COL.num.w;
  COL.mfr.x = COL.mpn.x + COL.mpn.w;
  COL.dc.x = COL.mfr.x + COL.mfr.w;
  COL.qty.x = COL.dc.x + COL.dc.w;
  COL.unit.x = COL.qty.x + COL.qty.w;
  COL.ext.x = COL.unit.x + COL.unit.w;
  COL.ext.w = PAGE_W - MARGIN - COL.ext.x;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ── Header: Company + PURCHASE ORDER title ──────────────────────
  // Left: logo + company block
  let companyX = MARGIN;
  if (logo) {
    const logoH = 44;
    const scale = logoH / logo.height;
    const logoW = logo.width * scale;
    page.drawImage(logo, { x: MARGIN, y: y - logoH + 6, width: logoW, height: logoH });
    companyX = MARGIN + logoW + 8;
  }
  page.drawText("R.S. \u00C9LECTRONIQUE INC.", {
    x: companyX,
    y,
    size: 16,
    font: fontBold,
    color: INK,
  });
  y -= 18;
  const addressLines = [
    "5580 Rue Vanden Abeele",
    "Saint-Laurent, QC H4S 1P9",
    "apatel@rspcbassembly.com",
    "www.rspcbassembly.com",
    "+1 (438) 833-8477",
  ];
  for (const line of addressLines) {
    page.drawText(line, {
      x: companyX,
      y,
      size: 8.5,
      font: fontRegular,
      color: SUB,
    });
    y -= 11;
  }

  // Right: PURCHASE ORDER title + meta table (Date / PO #)
  const titleY = PAGE_H - MARGIN;
  const title = "PURCHASE ORDER";
  const titleSize = 22;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: PAGE_W - MARGIN - titleW,
    y: titleY,
    size: titleSize,
    font: fontBold,
    color: ACCENT,
  });

  // Meta box (Date / PO #) — two rows, right-aligned
  const metaBoxW = 200;
  const metaBoxX = PAGE_W - MARGIN - metaBoxW;
  const metaLabelW = 60;
  const metaRowH = 16;
  let metaY = titleY - titleSize - 8;

  // Date row
  page.drawRectangle({
    x: metaBoxX,
    y: metaY - metaRowH,
    width: metaLabelW,
    height: metaRowH,
    color: HEADER_BG,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  page.drawRectangle({
    x: metaBoxX + metaLabelW,
    y: metaY - metaRowH,
    width: metaBoxW - metaLabelW,
    height: metaRowH,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  page.drawText("Date", {
    x: metaBoxX + 6,
    y: metaY - metaRowH + 5,
    size: 8,
    font: fontBold,
    color: INK,
  });
  page.drawText(dateStr, {
    x: metaBoxX + metaLabelW + 6,
    y: metaY - metaRowH + 5,
    size: 9,
    font: fontRegular,
    color: INK,
  });
  metaY -= metaRowH;

  // PO # row
  page.drawRectangle({
    x: metaBoxX,
    y: metaY - metaRowH,
    width: metaLabelW,
    height: metaRowH,
    color: HEADER_BG,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  page.drawRectangle({
    x: metaBoxX + metaLabelW,
    y: metaY - metaRowH,
    width: metaBoxW - metaLabelW,
    height: metaRowH,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  page.drawText("PO #", {
    x: metaBoxX + 6,
    y: metaY - metaRowH + 5,
    size: 8,
    font: fontBold,
    color: INK,
  });
  page.drawText(po.po_number, {
    x: metaBoxX + metaLabelW + 6,
    y: metaY - metaRowH + 5,
    size: 9,
    font: fontBold,
    color: INK,
  });

  // Advance y to whichever side is lower
  y = Math.min(y, metaY - metaRowH) - 18;

  // ── SUPPLIER | SHIP TO blocks ───────────────────────────────────
  const blockW = (CONTENT_W - 12) / 2;
  const blockH = 92;
  const supplierX = MARGIN;
  const shipToX = MARGIN + blockW + 12;
  const blockTop = y;

  function drawBlock(
    pg: PDFPage,
    x: number,
    top: number,
    width: number,
    height: number,
    header: string,
    body: string[]
  ) {
    // Header bar
    pg.drawRectangle({
      x,
      y: top - 18,
      width,
      height: 18,
      color: INK,
    });
    pg.drawText(header, {
      x: x + 8,
      y: top - 13,
      size: 9,
      font: fontBold,
      color: WHITE,
    });
    // Body box
    pg.drawRectangle({
      x,
      y: top - height,
      width,
      height: height - 18,
      color: BLOCK_BG,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    let by = top - 18 - 14;
    for (const line of body) {
      if (!line) continue;
      pg.drawText(truncate(line, width - 16, fontRegular, 9), {
        x: x + 8,
        y: by,
        size: 9,
        font: fontRegular,
        color: INK,
      });
      by -= 12;
    }
  }

  // Supplier block contents
  const supplierBody: string[] = [];
  supplierBody.push(po.supplier_name || "");
  if (po.supplier_email) supplierBody.push(po.supplier_email);

  drawBlock(
    page,
    supplierX,
    blockTop,
    blockW,
    blockH,
    "SUPPLIER",
    supplierBody
  );

  // Ship to block
  drawBlock(page, shipToX, blockTop, blockW, blockH, "SHIP TO", [
    "Anas Patel",
    "R.S. \u00C9LECTRONIQUE INC.",
    "5580 Rue Vanden Abeele",
    "Saint-Laurent, QC H4S 1P9",
    "+1 (438) 833-8477",
  ]);

  y = blockTop - blockH - 12;

  // ── Order meta row: REQUISITIONER | SHIP VIA | CURRENCY | F.O.B. | PAYMENT TERMS ──
  const metaCols = [
    { label: "REQUISITIONER", value: "Anas Patel" },
    { label: "SHIP VIA", value: "Supplier Shipping" },
    { label: "CURRENCY", value: "CAD" },
    { label: "F.O.B.", value: "R.S. \u00C9lectronique Inc." },
    { label: "PAYMENT TERMS", value: "Net 30" },
  ];
  const colW = CONTENT_W / metaCols.length;
  const metaHeaderH = 16;
  const metaValueH = 18;

  // header row
  for (let i = 0; i < metaCols.length; i++) {
    page.drawRectangle({
      x: MARGIN + i * colW,
      y: y - metaHeaderH,
      width: colW,
      height: metaHeaderH,
      color: INK,
    });
    const lbl = metaCols[i].label;
    const lw = fontBold.widthOfTextAtSize(lbl, 8);
    page.drawText(lbl, {
      x: MARGIN + i * colW + (colW - lw) / 2,
      y: y - metaHeaderH + 5,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
  }
  // value row
  for (let i = 0; i < metaCols.length; i++) {
    page.drawRectangle({
      x: MARGIN + i * colW,
      y: y - metaHeaderH - metaValueH,
      width: colW,
      height: metaValueH,
      color: WHITE,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    const val = truncate(metaCols[i].value, colW - 8, fontRegular, 9);
    const vw = fontRegular.widthOfTextAtSize(val, 9);
    page.drawText(val, {
      x: MARGIN + i * colW + (colW - vw) / 2,
      y: y - metaHeaderH - metaValueH + 6,
      size: 9,
      font: fontRegular,
      color: INK,
    });
  }
  y -= metaHeaderH + metaValueH + 14;

  // ── Line item table ────────────────────────────────────────────
  const tableTop = y;
  const rowH = 18;
  const headerRowH = 20;

  function drawLineItemHeader(pg: PDFPage, yTop: number) {
    pg.drawRectangle({
      x: MARGIN,
      y: yTop - headerRowH,
      width: CONTENT_W,
      height: headerRowH,
      color: INK,
    });
    const headers: [string, keyof typeof COL, "left" | "center" | "right"][] = [
      ["#", "num", "center"],
      ["MANUFACTURER PN", "mpn", "left"],
      ["MANUFACTURER", "mfr", "left"],
      ["DC", "dc", "center"],
      ["QTY", "qty", "right"],
      ["UNIT PRICE", "unit", "right"],
      ["EXT PRICE", "ext", "right"],
    ];
    for (const [label, key, align] of headers) {
      const c = COL[key];
      let tx = c.x + 6;
      const tw = fontBold.widthOfTextAtSize(label, 8);
      if (align === "center") tx = c.x + (c.w - tw) / 2;
      else if (align === "right") tx = c.x + c.w - tw - 6;
      pg.drawText(label, {
        x: tx,
        y: yTop - headerRowH + 6,
        size: 8,
        font: fontBold,
        color: WHITE,
      });
    }
    // Vertical column separators
    const sepYTop = yTop;
    const sepYBot = yTop - headerRowH;
    for (const key of ["mpn", "mfr", "dc", "qty", "unit", "ext"] as const) {
      const c = COL[key];
      pg.drawLine({
        start: { x: c.x, y: sepYTop },
        end: { x: c.x, y: sepYBot },
        thickness: 0.3,
        color: MUTED,
      });
    }
  }

  drawLineItemHeader(page, tableTop);
  let rowY = tableTop - headerRowH;

  // Ensure a minimum of 20 rows to match the template look
  const MIN_ROWS = 20;
  const rowCount = Math.max(MIN_ROWS, lines.length);

  // Need space check for continuation (totals + terms footer ~= 160)
  const FOOTER_RESERVE = 170;

  function drawTableBorder(pg: PDFPage, top: number, bottom: number) {
    pg.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: CONTENT_W,
      height: top - bottom,
      borderColor: INK,
      borderWidth: 1,
    });
    // Redraw vertical separators from top to bottom
    for (const key of ["mpn", "mfr", "dc", "qty", "unit", "ext"] as const) {
      const c = COL[key];
      pg.drawLine({
        start: { x: c.x, y: top },
        end: { x: c.x, y: bottom },
        thickness: 0.3,
        color: LINE,
      });
    }
  }

  let pageTableTop = tableTop;

  for (let i = 0; i < rowCount; i++) {
    // Check for continuation
    if (rowY - rowH < MARGIN + FOOTER_RESERVE) {
      drawTableBorder(page, pageTableTop, rowY);
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageTableTop = PAGE_H - MARGIN;
      drawLineItemHeader(page, pageTableTop);
      rowY = pageTableTop - headerRowH;
    }

    const line: POLine | undefined = lines[i];
    const bottomY = rowY - rowH;

    // Alternating zebra background for readability (keep subtle)
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: bottomY,
        width: CONTENT_W,
        height: rowH,
        color: BLOCK_BG,
      });
    }

    // Bottom border
    page.drawLine({
      start: { x: MARGIN, y: bottomY },
      end: { x: PAGE_W - MARGIN, y: bottomY },
      thickness: 0.3,
      color: LINE_SOFT,
    });

    const textY = bottomY + 5;
    const size = 9;

    // # (row number, always shown)
    const nStr = String(i + 1);
    const nw = fontRegular.widthOfTextAtSize(nStr, size);
    page.drawText(nStr, {
      x: COL.num.x + (COL.num.w - nw) / 2,
      y: textY,
      size,
      font: fontRegular,
      color: line ? INK : MUTED,
    });

    if (line) {
      // MPN
      page.drawText(
        truncate(line.mpn || "", COL.mpn.w - 10, fontRegular, size),
        {
          x: COL.mpn.x + 6,
          y: textY,
          size,
          font: fontRegular,
          color: INK,
        }
      );

      // Manufacturer
      const mfr = line.manufacturer || "";
      page.drawText(truncate(mfr, COL.mfr.w - 10, fontRegular, size), {
        x: COL.mfr.x + 6,
        y: textY,
        size,
        font: fontRegular,
        color: INK,
      });

      // DC (date code)
      const dc = line.dc || "";
      if (dc) {
        const dcw = fontRegular.widthOfTextAtSize(dc, size);
        page.drawText(truncate(dc, COL.dc.w - 6, fontRegular, size), {
          x: COL.dc.x + (COL.dc.w - dcw) / 2,
          y: textY,
          size,
          font: fontRegular,
          color: INK,
        });
      }

      // Qty (right-aligned)
      const qtyStr = String(line.qty ?? 0);
      const qw = fontRegular.widthOfTextAtSize(qtyStr, size);
      page.drawText(qtyStr, {
        x: COL.qty.x + COL.qty.w - qw - 6,
        y: textY,
        size,
        font: fontRegular,
        color: INK,
      });

      // Unit price (right-aligned)
      const unitStr = fmtMoney(Number(line.unit_price) || 0);
      const uw = fontRegular.widthOfTextAtSize(unitStr, size);
      page.drawText(unitStr, {
        x: COL.unit.x + COL.unit.w - uw - 6,
        y: textY,
        size,
        font: fontRegular,
        color: INK,
      });

      // Ext price (right-aligned)
      const extStr = fmtMoney(Number(line.line_total) || 0);
      const ew = fontBold.widthOfTextAtSize(extStr, size);
      page.drawText(extStr, {
        x: COL.ext.x + COL.ext.w - ew - 6,
        y: textY,
        size,
        font: fontBold,
        color: INK,
      });
    }

    rowY = bottomY;
  }

  // Close the table with a border
  drawTableBorder(page, pageTableTop, rowY);
  y = rowY - 10;

  // ── Totals panel (right side) ─────────────────────────────────
  const totalsW = 220;
  const totalsX = PAGE_W - MARGIN - totalsW;
  const totalRowH = 16;
  const totalsRows: { label: string; value: string; emphasize?: boolean }[] = [
    { label: "SUBTOTAL", value: fmtMoney(subtotal) },
    { label: "TAX", value: fmtMoney(tax) },
    { label: "SHIPPING", value: fmtMoney(shipping) },
    { label: "OTHER", value: fmtMoney(other) },
    { label: "TOTAL", value: fmtMoney(grandTotal), emphasize: true },
  ];

  let ty = y;
  for (const r of totalsRows) {
    const labelW = 110;
    // Label cell
    page.drawRectangle({
      x: totalsX,
      y: ty - totalRowH,
      width: labelW,
      height: totalRowH,
      color: r.emphasize ? INK : HEADER_BG,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    page.drawText(r.label, {
      x: totalsX + 8,
      y: ty - totalRowH + 5,
      size: r.emphasize ? 9 : 8,
      font: fontBold,
      color: r.emphasize ? WHITE : INK,
    });

    // Value cell
    page.drawRectangle({
      x: totalsX + labelW,
      y: ty - totalRowH,
      width: totalsW - labelW,
      height: totalRowH,
      color: r.emphasize ? HEADER_BG : WHITE,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    const valStr = "$ " + r.value;
    const vw = fontBold.widthOfTextAtSize(valStr, 9);
    page.drawText(valStr, {
      x: totalsX + totalsW - vw - 8,
      y: ty - totalRowH + 5,
      size: 9,
      font: fontBold,
      color: INK,
    });
    ty -= totalRowH;
  }

  // ── Comments / Special Instructions (left side, same vertical band as totals) ──
  const commentsW = CONTENT_W - totalsW - 12;
  const commentsH = totalRowH * totalsRows.length;
  const commentsX = MARGIN;
  const commentsTop = y;

  page.drawRectangle({
    x: commentsX,
    y: commentsTop - 16,
    width: commentsW,
    height: 16,
    color: INK,
  });
  page.drawText("Comments or Special Instructions", {
    x: commentsX + 8,
    y: commentsTop - 12,
    size: 8,
    font: fontBold,
    color: WHITE,
  });
  page.drawRectangle({
    x: commentsX,
    y: commentsTop - commentsH,
    width: commentsW,
    height: commentsH - 16,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.5,
  });

  // Default comment body: PROC reference + confirm receipt note
  const commentsBody: string[] = [];
  if (procCode) commentsBody.push(`PROC: ${procCode}`);
  commentsBody.push(
    `Please confirm receipt and provide expected ship date.`
  );
  commentsBody.push(
    `All shipments must reference PO # ${po.po_number} on packing slip and invoice.`
  );
  commentsBody.push(`All amounts in Canadian Dollars (CAD).`);

  let cy = commentsTop - 16 - 12;
  for (const cl of commentsBody) {
    page.drawText(truncate(cl, commentsW - 16, fontRegular, 8), {
      x: commentsX + 8,
      y: cy,
      size: 8,
      font: fontRegular,
      color: SUB,
    });
    cy -= 11;
  }

  y = ty - 18;

  // ── Authorized signature block ───────────────────────────────
  const sigLineW = 200;
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: MARGIN + sigLineW, y: y },
    thickness: 0.5,
    color: INK,
  });
  page.drawText("Authorized by", {
    x: MARGIN,
    y: y - 11,
    size: 7.5,
    font: fontRegular,
    color: MUTED,
  });
  page.drawText("Anas Patel, CEO \u2014 R.S. \u00C9lectronique Inc.", {
    x: MARGIN,
    y: y + 4,
    size: 9,
    font: fontItalic,
    color: INK,
  });

  const dateSigX = PAGE_W - MARGIN - sigLineW;
  page.drawLine({
    start: { x: dateSigX, y: y },
    end: { x: dateSigX + sigLineW, y: y },
    thickness: 0.5,
    color: INK,
  });
  page.drawText("Date", {
    x: dateSigX,
    y: y - 11,
    size: 7.5,
    font: fontRegular,
    color: MUTED,
  });
  page.drawText(dateStr, {
    x: dateSigX,
    y: y + 4,
    size: 9,
    font: fontRegular,
    color: INK,
  });

  y -= 30;

  // ── Terms & conditions footer ─────────────────────────────────
  const termsY = Math.max(y, MARGIN + 40);
  page.drawLine({
    start: { x: MARGIN, y: termsY },
    end: { x: PAGE_W - MARGIN, y: termsY },
    thickness: 0.5,
    color: LINE,
  });
  const termsLines = [
    "Terms: Net 30 unless otherwise noted. Supplier to acknowledge receipt of this PO within 24 hours.",
    "Defective or non-conforming parts may be returned at supplier's expense.",
    "GST/TPS 840134829 \u00B7 QST/TVQ 1214617001",
  ];
  let tlY = termsY - 11;
  for (const tl of termsLines) {
    page.drawText(tl, {
      x: MARGIN,
      y: tlY,
      size: 7,
      font: fontRegular,
      color: MUTED,
    });
    tlY -= 9;
  }

  // Page label (bottom right)
  const pageLbl = po.po_number;
  const plw = fontRegular.widthOfTextAtSize(pageLbl, 7);
  page.drawText(pageLbl, {
    x: PAGE_W - MARGIN - plw,
    y: MARGIN - 10 > 0 ? MARGIN - 10 : 10,
    size: 7,
    font: fontRegular,
    color: MUTED,
  });

  // ── Serialize ─────────────────────────────────────────────────
  const pdfBytes = await doc.save();

  // Upload to Supabase Storage
  const customerCode = procurement?.jobs?.customers?.code ?? "unknown";
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
