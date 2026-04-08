import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";

// A4 dimensions in points (595.28 x 841.89)
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
export const MARGIN = 40;
export const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

// Colors
export const COLOR_DARK = rgb(15 / 255, 23 / 255, 42 / 255); // #0f172a
export const COLOR_TEXT = rgb(51 / 255, 65 / 255, 85 / 255); // #334155
export const COLOR_MUTED = rgb(71 / 255, 85 / 255, 105 / 255); // #475569
export const COLOR_LIGHT = rgb(148 / 255, 163 / 255, 184 / 255); // #94a3b8
export const COLOR_WHITE = rgb(1, 1, 1);
export const COLOR_BG_ALT = rgb(248 / 255, 250 / 255, 252 / 255); // #f8fafc
export const COLOR_BG_STRIP = rgb(241 / 255, 245 / 255, 249 / 255); // #f1f5f9
export const COLOR_BORDER = rgb(226 / 255, 232 / 255, 240 / 255); // #e2e8f0

export interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function createPdfDoc(): Promise<{
  doc: PDFDocument;
  fonts: PdfFonts;
}> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, fonts: { regular, bold } };
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

/**
 * Draw the RS company header at the top of a page.
 * Returns the Y position below the header (after the separator line).
 */
export function drawHeader(
  page: PDFPage,
  fonts: PdfFonts,
  title: string,
  subtitleLines: string[]
): number {
  const { bold, regular } = fonts;
  let y = A4_HEIGHT - MARGIN;

  // Left side: company info
  page.drawText("R.S. ELECTRONIQUE INC.", {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
    color: COLOR_DARK,
  });
  y -= 14;
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 11;
  page.drawText("+1 (438) 833-8477 | info@rspcbassembly.com", {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 11;
  page.drawText("www.rspcbassembly.com", {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });

  // Right side: document title
  const titleWidth = bold.widthOfTextAtSize(title, 18);
  page.drawText(title, {
    x: A4_WIDTH - MARGIN - titleWidth,
    y: A4_HEIGHT - MARGIN,
    size: 18,
    font: bold,
    color: COLOR_DARK,
  });

  let rightY = A4_HEIGHT - MARGIN - 20;
  for (const line of subtitleLines) {
    const w = regular.widthOfTextAtSize(line, 9);
    page.drawText(line, {
      x: A4_WIDTH - MARGIN - w,
      y: rightY,
      size: 9,
      font: regular,
      color: COLOR_MUTED,
    });
    rightY -= 13;
  }

  // Separator line
  const sepY = y - 6;
  page.drawLine({
    start: { x: MARGIN, y: sepY },
    end: { x: A4_WIDTH - MARGIN, y: sepY },
    thickness: 2,
    color: COLOR_DARK,
  });

  return sepY - 16;
}

/**
 * Draw a footer at the bottom of a page.
 */
export function drawFooter(
  page: PDFPage,
  fonts: PdfFonts,
  left: string,
  center: string,
  pageNum?: number,
  totalPages?: number
) {
  const y = 24;
  page.drawLine({
    start: { x: MARGIN, y: y + 10 },
    end: { x: A4_WIDTH - MARGIN, y: y + 10 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  page.drawText(left, { x: MARGIN, y, size: 7, font: fonts.regular, color: COLOR_LIGHT });
  const cw = fonts.regular.widthOfTextAtSize(center, 7);
  page.drawText(center, {
    x: (A4_WIDTH - cw) / 2,
    y,
    size: 7,
    font: fonts.regular,
    color: COLOR_LIGHT,
  });
  if (pageNum !== undefined && totalPages !== undefined) {
    const right = `Page ${pageNum} of ${totalPages}`;
    const rw = fonts.regular.widthOfTextAtSize(right, 7);
    page.drawText(right, {
      x: A4_WIDTH - MARGIN - rw,
      y,
      size: 7,
      font: fonts.regular,
      color: COLOR_LIGHT,
    });
  }
}

/**
 * Draw a table header row with dark background.
 */
export function drawTableHeaderRow(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  columns: { label: string; x: number; width: number; align?: "left" | "center" | "right" }[]
): number {
  const rowHeight = 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - rowHeight,
    width: CONTENT_WIDTH,
    height: rowHeight,
    color: COLOR_DARK,
  });
  for (const col of columns) {
    let textX = col.x;
    const tw = fonts.bold.widthOfTextAtSize(col.label, 7);
    if (col.align === "center") textX = col.x + (col.width - tw) / 2;
    else if (col.align === "right") textX = col.x + col.width - tw;
    page.drawText(col.label, {
      x: textX,
      y: y - 12,
      size: 7,
      font: fonts.bold,
      color: COLOR_WHITE,
    });
  }
  return y - rowHeight;
}

/**
 * Truncate text to fit within a given width.
 */
export function truncate(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "...", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

/**
 * Draw a signature block: two lines with labels.
 */
export function drawSignatureBlock(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  leftLabel: string,
  rightLabel: string
): number {
  const lineY = y - 40;
  const leftEnd = MARGIN + CONTENT_WIDTH * 0.4;
  const rightStart = A4_WIDTH - MARGIN - CONTENT_WIDTH * 0.4;
  const rightEnd = A4_WIDTH - MARGIN;

  page.drawLine({
    start: { x: MARGIN, y: lineY },
    end: { x: leftEnd, y: lineY },
    thickness: 0.5,
    color: COLOR_LIGHT,
  });
  page.drawText(leftLabel, {
    x: MARGIN,
    y: lineY - 12,
    size: 8,
    font: fonts.regular,
    color: COLOR_MUTED,
  });

  page.drawLine({
    start: { x: rightStart, y: lineY },
    end: { x: rightEnd, y: lineY },
    thickness: 0.5,
    color: COLOR_LIGHT,
  });
  page.drawText(rightLabel, {
    x: rightStart,
    y: lineY - 12,
    size: 8,
    font: fonts.regular,
    color: COLOR_MUTED,
  });

  return lineY - 20;
}
