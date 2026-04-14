import { PDFDocument, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";

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
  /** RS company logo extracted from the invoice Excel template. May be null
   *  if the file can't be read (falls back to text-only header). */
  logo: PDFImage | null;
}> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadRsLogo(doc);
  return { doc, fonts: { regular, bold }, logo };
}

/**
 * Load the RS company logo (extracted from RS INVOICE TEMPLATE V3.xlsm)
 * and embed it into the given PDFDocument.
 *
 * Lives at public/pdf/rs-logo.png. Returns null if the file can't be read
 * so callers can fall back to a text-only header without crashing.
 *
 * Cache the returned PDFImage per-document — do not call this twice.
 */
export async function loadRsLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "pdf", "rs-logo.png");
    if (!fs.existsSync(logoPath)) return null;
    const bytes = fs.readFileSync(logoPath);
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

/**
 * Draw the RS company header at the top of a page.
 * Returns the Y position below the header (after the separator line).
 *
 * If `logo` is provided, draws it on the left side and pushes the company
 * text block to the right of it. Matches the RS INVOICE TEMPLATE V3.xlsm
 * layout (logo top-left, big title top-right).
 */
export function drawHeader(
  page: PDFPage,
  fonts: PdfFonts,
  title: string,
  subtitleLines: string[],
  logo?: PDFImage | null,
  options?: { pageWidth?: number; pageHeight?: number; margin?: number }
): number {
  const { bold, regular } = fonts;
  const pageWidth = options?.pageWidth ?? A4_WIDTH;
  const pageHeight = options?.pageHeight ?? A4_HEIGHT;
  const margin = options?.margin ?? MARGIN;

  let y = pageHeight - margin;
  let textStartX = margin;

  // Draw logo on the left if provided
  if (logo) {
    const logoMaxH = 48;
    const scale = logoMaxH / logo.height;
    const logoW = logo.width * scale;
    const logoH = logoMaxH;
    page.drawImage(logo, {
      x: margin,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    textStartX = margin + logoW + 8;
  }

  // Left side: company info (pushed right if logo present)
  page.drawText("R.S. ELECTRONIQUE INC.", {
    x: textStartX,
    y,
    size: 14,
    font: bold,
    color: COLOR_DARK,
  });
  y -= 14;
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", {
    x: textStartX,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 11;
  page.drawText("+1 (438) 833-8477 | info@rspcbassembly.com", {
    x: textStartX,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 11;
  page.drawText("www.rspcbassembly.com", {
    x: textStartX,
    y,
    size: 8,
    font: regular,
    color: COLOR_MUTED,
  });

  // Right side: document title
  const titleWidth = bold.widthOfTextAtSize(title, 18);
  page.drawText(title, {
    x: pageWidth - margin - titleWidth,
    y: pageHeight - margin,
    size: 18,
    font: bold,
    color: COLOR_DARK,
  });

  let rightY = pageHeight - margin - 20;
  for (const line of subtitleLines) {
    const w = regular.widthOfTextAtSize(line, 9);
    page.drawText(line, {
      x: pageWidth - margin - w,
      y: rightY,
      size: 9,
      font: regular,
      color: COLOR_MUTED,
    });
    rightY -= 13;
  }

  // Header occupies ~60pt when logo is present, less without
  const minY = logo ? pageHeight - margin - 58 : y - 6;
  const sepY = Math.min(minY, y - 6);
  page.drawLine({
    start: { x: margin, y: sepY },
    end: { x: pageWidth - margin, y: sepY },
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
 * Sanitize text for WinAnsi encoding (standard PDF fonts like Helvetica).
 * Replaces common non-Latin-1 characters with safe equivalents.
 * WITHOUT this, pdf-lib throws on Greek letters (Ω, μ), typographic
 * quotes, em-dashes, superscripts, etc. — which appear constantly in
 * component descriptions like "1kΩ" or "0.1μF".
 */
export function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "";
  const replacements: Record<string, string> = {
    // Greek / math
    "Ω": "Ohm", "μ": "u", "π": "pi", "Δ": "D", "Σ": "Sum",
    "α": "a", "β": "b", "γ": "g", "θ": "th", "λ": "lambda",
    // Math symbols
    "±": "+/-", "×": "x", "÷": "/", "≈": "~", "≤": "<=", "≥": ">=",
    "≠": "!=", "∞": "inf", "√": "sqrt", "°": " deg",
    // Superscripts / subscripts
    "²": "^2", "³": "^3", "¹": "^1", "⁰": "^0", "⁴": "^4", "⁵": "^5",
    "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9",
    // Typographic punctuation
    "—": "-", "–": "-", "―": "-",
    "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
    "…": "...", "•": "*", "·": ".",
    // Non-breaking space + other whitespace
    "\u00A0": " ", "\u2009": " ", "\u200B": "",
  };
  let out = text;
  for (const [from, to] of Object.entries(replacements)) {
    out = out.split(from).join(to);
  }
  // Strip anything remaining that isn't printable ASCII or Latin-1
  out = out.replace(/[^\x20-\xFF]/g, "?");
  return out;
}

/**
 * Truncate text to fit within a given width.
 * Automatically sanitizes for WinAnsi encoding so Greek letters etc. won't crash.
 */
export function truncate(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string {
  if (!text) return "";
  const safe = sanitizeForPdf(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let t = safe;
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
