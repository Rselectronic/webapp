import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

interface InvoiceLineItem {
  job_number: string;
  gmp_number: string;
  board_name?: string | null;
  quantity: number;
  per_unit: number;
  subtotal: number;
}

function fmt(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

function drawTextCenteredV(
  page: PDFPage,
  text: string,
  x: number,
  yCenter: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
) {
  page.drawText(text, { x, y: yCenter - size * 0.33, font, size, color });
}

function drawTextRightAligned(
  page: PDFPage,
  text: string,
  xRight: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, font, size, color });
}

function truncateToWidth(
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

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, customers(code, company_name, contact_name, contact_email, contact_phone, billing_address, shipping_address, payment_terms), jobs(job_number, gmp_id, quantity, po_number, gmps(gmp_number, board_name), quotes(pricing))"
    )
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  type Address = {
    street?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country?: string;
  } | null;

  const customer = invoice.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    billing_address: Address;
    shipping_address: Address;
    payment_terms: string | null;
  } | null;

  const job = invoice.jobs as unknown as {
    job_number: string;
    gmp_id: string;
    quantity: number;
    po_number: string | null;
    gmps: { gmp_number: string; board_name: string | null } | null;
    quotes: {
      pricing: {
        tiers?: { board_qty: number; subtotal: number; per_unit?: number }[];
      };
    } | null;
  } | null;

  // Detect consolidated invoice by checking notes for the marker
  let lineItems: InvoiceLineItem[] | undefined;
  const notesStr = invoice.notes as string | null;

  if (notesStr && notesStr.includes("Consolidated invoice for jobs:")) {
    const jobListMatch = notesStr.match(
      /Consolidated invoice for jobs:\s*(.+?)$/m
    );
    if (jobListMatch) {
      const jobEntries = jobListMatch[1].split(",").map((s) => s.trim());
      const jobNumbers = jobEntries.map((entry) => {
        const match = entry.match(/^([^\s(]+)/);
        return match ? match[1] : entry;
      });

      const { data: relatedJobs } = await supabase
        .from("jobs")
        .select(
          "id, job_number, quantity, po_number, gmps(gmp_number, board_name), quotes(pricing)"
        )
        .in("job_number", jobNumbers);

      if (relatedJobs && relatedJobs.length > 1) {
        type RelatedJob = {
          id: string;
          job_number: string;
          quantity: number;
          po_number: string | null;
          gmps: { gmp_number: string; board_name: string | null } | null;
          quotes: {
            pricing: {
              tiers?: {
                board_qty: number;
                subtotal: number;
                per_unit?: number;
              }[];
            };
          } | null;
        };

        lineItems = (relatedJobs as unknown as RelatedJob[]).map((rj) => {
          const tiers = rj.quotes?.pricing?.tiers;
          let subtotal = 0;
          let perUnit = 0;
          if (tiers?.length) {
            const matched =
              tiers.find((t) => t.board_qty === rj.quantity) ?? tiers[0];
            subtotal = matched.subtotal;
            perUnit =
              matched.per_unit ??
              (rj.quantity > 0 ? matched.subtotal / rj.quantity : 0);
          }
          return {
            job_number: rj.job_number,
            gmp_number: rj.gmps?.gmp_number ?? "Unknown",
            board_name: rj.gmps?.board_name,
            quantity: rj.quantity,
            per_unit: Math.round(perUnit * 100) / 100,
            subtotal: Math.round(subtotal * 100) / 100,
          };
        });
      }
    }
  }

  // Build single-line items list if not a consolidated invoice.
  if (!lineItems && job) {
    const tiers = job.quotes?.pricing?.tiers;
    let perUnit = 0;
    let lineSubtotal = Number(invoice.subtotal) || 0;
    if (tiers?.length) {
      const matched = tiers.find((t) => t.board_qty === job.quantity) ?? tiers[0];
      perUnit =
        matched.per_unit ?? (job.quantity > 0 ? matched.subtotal / job.quantity : 0);
      if (!lineSubtotal) lineSubtotal = matched.subtotal;
    } else if (job.quantity > 0) {
      perUnit = lineSubtotal / job.quantity;
    }
    lineItems = [
      {
        job_number: job.job_number,
        gmp_number: job.gmps?.gmp_number ?? "",
        board_name: job.gmps?.board_name ?? null,
        quantity: job.quantity,
        per_unit: Math.round(perUnit * 100) / 100,
        subtotal: Math.round(lineSubtotal * 100) / 100,
      },
    ];
  }

  const invoiceNumber = invoice.invoice_number as string;
  const subtotalAmt = Number(invoice.subtotal) || 0;
  const tpsGst = Number(invoice.tps_gst) || 0;
  const tvqQst = Number(invoice.tvq_qst) || 0;
  const freight = Number(invoice.freight) || 0;
  const discount = Number(invoice.discount) || 0;
  const total = Number(invoice.total) || 0;
  const paymentTerms = customer?.payment_terms ?? "Net 30";
  const poNumber = job?.po_number ?? "";

  // --- Build PDF with pdf-lib (pure JS, works on Vercel serverless) ---
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Try to embed the RS logo
  let logoImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "pdf", "rs-logo.png");
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      logoImg = await pdfDoc.embedPng(logoBytes);
    }
  } catch {
    logoImg = null;
  }

  // Letter size (Excel template is US Letter proportions)
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  // --- Color palette (matches RS template) ---
  const black = rgb(0, 0, 0);
  const darkText = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.35, 0.35, 0.35);
  const accentRed = rgb(0.75, 0.09, 0.12); // R.S. red
  const headerFill = rgb(0.12, 0.18, 0.32); // dark navy for table header
  const sectionFill = rgb(0.93, 0.94, 0.97); // light blue-gray
  const zebra = rgb(0.975, 0.978, 0.985);
  const border = rgb(0.72, 0.75, 0.8);
  const white = rgb(1, 1, 1);

  const LM = 36; // left margin
  const RM = width - 36; // right edge
  let y = height - 36;

  // ============================================================
  // ROW 1 — HEADER: Logo + "ÉLECTRONIQUE INC." left, "INVOICE" right
  // ============================================================
  const headerTop = y;
  const headerHeight = 58;

  // Logo (if available) — scale to ~48px height
  let textStartX = LM;
  if (logoImg) {
    const logoH = 50;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    page.drawImage(logoImg, {
      x: LM,
      y: headerTop - logoH,
      width: logoW,
      height: logoH,
    });
    textStartX = LM + logoW + 6;
  }

  // "ÉLECTRONIQUE INC." — template uses Cambria size 20, we use TimesRomanBold
  page.drawText("ELECTRONIQUE INC.", {
    x: textStartX,
    y: headerTop - 32,
    font: timesRomanBold,
    size: 18,
    color: accentRed,
  });

  // "INVOICE" title on the right (Row 1 I1:J1 merged)
  const invoiceTitle = "INVOICE";
  const invoiceTitleSize = 32;
  const invoiceTitleW = timesRomanBold.widthOfTextAtSize(
    invoiceTitle,
    invoiceTitleSize
  );
  page.drawText(invoiceTitle, {
    x: RM - invoiceTitleW,
    y: headerTop - 26,
    font: timesRomanBold,
    size: invoiceTitleSize,
    color: darkText,
  });

  y = headerTop - headerHeight;

  // ============================================================
  // ROWS 2-5 — Left: address/contact block. Right: Date/Invoice#/Terms
  // ============================================================
  const metaTop = y - 4;
  const metaLineH = 13;

  // LEFT column — company contact info
  let ly = metaTop;
  page.drawText("5580 Vanden Abeele", {
    x: LM,
    y: ly,
    font: helvetica,
    size: 9,
    color: darkText,
  });
  ly -= metaLineH;
  page.drawText("Saint-Laurent, QC H4S 1P9", {
    x: LM,
    y: ly,
    font: helvetica,
    size: 9,
    color: darkText,
  });
  ly -= metaLineH;
  page.drawText("+1 (438) 833-8477", {
    x: LM,
    y: ly,
    font: helvetica,
    size: 9,
    color: darkText,
  });
  ly -= metaLineH;
  page.drawText("info@rspcbassembly.com", {
    x: LM,
    y: ly,
    font: helvetica,
    size: 9,
    color: accentRed,
  });
  ly -= metaLineH;
  page.drawText("www.rspcbassembly.com", {
    x: LM,
    y: ly,
    font: helvetica,
    size: 9,
    color: accentRed,
  });

  // RIGHT column — Date / Invoice # / Terms (labels + boxed values)
  const metaLabelX = RM - 220;
  const metaValueX = RM - 140;
  const metaValueRight = RM;
  const metaRowH = 18;

  const metaRows: [string, string][] = [
    ["Date", fmtDate(invoice.issued_date)],
    ["Invoice #", invoiceNumber],
    ["Terms", paymentTerms],
  ];

  let my = metaTop + 2;
  for (const [label, value] of metaRows) {
    // Label
    page.drawText(label, {
      x: metaLabelX,
      y: my - 12,
      font: helveticaBold,
      size: 10,
      color: darkText,
    });
    // Value box
    page.drawRectangle({
      x: metaValueX,
      y: my - metaRowH,
      width: metaValueRight - metaValueX,
      height: metaRowH,
      borderColor: border,
      borderWidth: 0.5,
      color: white,
    });
    const valText = truncateToWidth(
      value,
      metaValueRight - metaValueX - 8,
      helvetica,
      10
    );
    page.drawText(valText, {
      x: metaValueX + 6,
      y: my - 13,
      font: helvetica,
      size: 10,
      color: darkText,
    });
    my -= metaRowH + 2;
  }

  y = Math.min(ly, my) - 16;

  // ============================================================
  // ROW 9 — BILL TO / SHIP TO section headers
  // ============================================================
  const halfW = (RM - LM - 12) / 2;
  const billX = LM;
  const shipX = LM + halfW + 12;

  // Header bars
  page.drawRectangle({
    x: billX,
    y: y - 16,
    width: halfW,
    height: 16,
    color: sectionFill,
    borderColor: border,
    borderWidth: 0.5,
  });
  page.drawText("BILL TO", {
    x: billX + 6,
    y: y - 12,
    font: helveticaBold,
    size: 10,
    color: accentRed,
  });

  page.drawRectangle({
    x: shipX,
    y: y - 16,
    width: halfW,
    height: 16,
    color: sectionFill,
    borderColor: border,
    borderWidth: 0.5,
  });
  page.drawText("SHIP TO", {
    x: shipX + 6,
    y: y - 12,
    font: helveticaBold,
    size: 10,
    color: accentRed,
  });

  y -= 16;

  // Address blocks — 6 lines each
  const blockHeight = 80;
  page.drawRectangle({
    x: billX,
    y: y - blockHeight,
    width: halfW,
    height: blockHeight,
    borderColor: border,
    borderWidth: 0.5,
    color: white,
  });
  page.drawRectangle({
    x: shipX,
    y: y - blockHeight,
    width: halfW,
    height: blockHeight,
    borderColor: border,
    borderWidth: 0.5,
    color: white,
  });

  const addrLineH = 12;
  const addrPadX = 6;
  const companyName = customer?.company_name ?? "";
  const billAddr = customer?.billing_address ?? {};
  const shipAddr = customer?.shipping_address ?? {};

  const formatAddressLines = (
    attLabel: string,
    contactName: string | null,
    addr: Address
  ): string[] => {
    const street = addr?.street ?? "";
    const cityLine = [addr?.city, addr?.province, addr?.postal_code]
      .filter(Boolean)
      .join(", ");
    const country = addr?.country ?? "";
    return [
      contactName ? `${attLabel}: ${contactName}` : attLabel,
      companyName,
      street,
      cityLine,
      [country, customer?.contact_email].filter(Boolean).join("  "),
      customer?.contact_phone ?? "",
    ];
  };

  const billLines = formatAddressLines(
    "Att: Accounts Payable",
    customer?.contact_name ?? null,
    billAddr
  );
  const shipLines = formatAddressLines(
    "Att: Accounts Receivable",
    customer?.contact_name ?? null,
    shipAddr
  );

  let by = y - 13;
  for (const line of billLines) {
    const txt = truncateToWidth(line, halfW - 2 * addrPadX, helvetica, 9);
    page.drawText(txt, {
      x: billX + addrPadX,
      y: by,
      font: helvetica,
      size: 9,
      color: darkText,
    });
    by -= addrLineH;
  }

  let sy = y - 13;
  for (const line of shipLines) {
    const txt = truncateToWidth(line, halfW - 2 * addrPadX, helvetica, 9);
    page.drawText(txt, {
      x: shipX + addrPadX,
      y: sy,
      font: helvetica,
      size: 9,
      color: darkText,
    });
    sy -= addrLineH;
  }

  y -= blockHeight + 14;

  // ============================================================
  // ROW 17 — LINE ITEMS TABLE HEADER
  // PO # | PRODUCT # | DESCRIPTION | QTY | UNIT PRICE | TOTAL AMOUNT
  // ============================================================
  const tableW = RM - LM;
  // Column widths (proportional to Excel template):
  // PO# 13% | Product# 22% | Description 34% | Qty 8% | Unit Price 11% | Total 12%
  const colPO = LM;
  const colProd = LM + tableW * 0.13;
  const colDesc = LM + tableW * 0.35;
  const colQty = LM + tableW * 0.69;
  const colUnit = LM + tableW * 0.77;
  const colTotal = LM + tableW * 0.88;
  const colEnd = RM;

  const tableHeaderH = 22;
  page.drawRectangle({
    x: LM,
    y: y - tableHeaderH,
    width: tableW,
    height: tableHeaderH,
    color: headerFill,
  });

  // Header labels (centered vertically)
  const headerLabels: { text: string; x: number; w: number; align: "l" | "c" | "r" }[] = [
    { text: "PO #", x: colPO, w: colProd - colPO, align: "l" },
    { text: "PRODUCT #", x: colProd, w: colDesc - colProd, align: "l" },
    { text: "DESCRIPTION", x: colDesc, w: colQty - colDesc, align: "l" },
    { text: "QTY", x: colQty, w: colUnit - colQty, align: "c" },
    { text: "UNIT PRICE", x: colUnit, w: colTotal - colUnit, align: "r" },
    { text: "TOTAL AMOUNT", x: colTotal, w: colEnd - colTotal, align: "r" },
  ];

  for (const h of headerLabels) {
    const size = 9;
    const tw = helveticaBold.widthOfTextAtSize(h.text, size);
    let tx = h.x + 6;
    if (h.align === "c") tx = h.x + (h.w - tw) / 2;
    else if (h.align === "r") tx = h.x + h.w - tw - 6;
    page.drawText(h.text, {
      x: tx,
      y: y - 14,
      font: helveticaBold,
      size,
      color: white,
    });
  }

  // Column dividers in header
  const divs = [colProd, colDesc, colQty, colUnit, colTotal];
  for (const dx of divs) {
    page.drawLine({
      start: { x: dx, y: y },
      end: { x: dx, y: y - tableHeaderH },
      thickness: 0.5,
      color: rgb(0.3, 0.35, 0.45),
    });
  }

  y -= tableHeaderH;

  // --- Table rows ---
  const rowH = 22;
  const minRows = 6;
  const items = lineItems ?? [];
  const rowsToDraw = Math.max(items.length, minRows);

  const drawRowBorders = (rowY: number, filled: boolean) => {
    if (filled) {
      page.drawRectangle({
        x: LM,
        y: rowY - rowH,
        width: tableW,
        height: rowH,
        color: zebra,
      });
    }
    // Bottom line
    page.drawLine({
      start: { x: LM, y: rowY - rowH },
      end: { x: RM, y: rowY - rowH },
      thickness: 0.5,
      color: border,
    });
    // Column dividers
    for (const dx of [colPO, colProd, colDesc, colQty, colUnit, colTotal, colEnd]) {
      page.drawLine({
        start: { x: dx, y: rowY },
        end: { x: dx, y: rowY - rowH },
        thickness: 0.5,
        color: border,
      });
    }
  };

  for (let i = 0; i < rowsToDraw; i++) {
    drawRowBorders(y, i % 2 === 1);
    const item = items[i];
    if (item) {
      // PO #
      const poText = truncateToWidth(
        poNumber || "",
        colProd - colPO - 10,
        helvetica,
        9
      );
      page.drawText(poText, {
        x: colPO + 6,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: darkText,
      });

      // PRODUCT # — GMP number
      const prodText = truncateToWidth(
        item.gmp_number ?? "",
        colDesc - colProd - 10,
        helvetica,
        9
      );
      page.drawText(prodText, {
        x: colProd + 6,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: darkText,
      });

      // DESCRIPTION — board name / job number
      const descParts: string[] = [];
      if (item.board_name) descParts.push(item.board_name);
      descParts.push(`PCB Assembly (Job ${item.job_number})`);
      const descText = truncateToWidth(
        descParts.join(" — "),
        colQty - colDesc - 10,
        helvetica,
        9
      );
      page.drawText(descText, {
        x: colDesc + 6,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: darkText,
      });

      // QTY — centered
      const qtyStr = String(item.quantity);
      const qtyW = helvetica.widthOfTextAtSize(qtyStr, 9);
      page.drawText(qtyStr, {
        x: colQty + (colUnit - colQty - qtyW) / 2,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: darkText,
      });

      // UNIT PRICE — right aligned
      drawTextRightAligned(
        page,
        fmt(item.per_unit),
        colTotal - 6,
        y - 14,
        helvetica,
        9,
        darkText
      );

      // TOTAL AMOUNT — right aligned
      drawTextRightAligned(
        page,
        fmt(item.subtotal),
        colEnd - 6,
        y - 14,
        helvetica,
        9,
        darkText
      );
    }
    y -= rowH;
  }

  // ============================================================
  // SUMMARY SECTION (rows 34-39)
  // Left: TERMS OF SALE / TAX ID panel.  Right: Subtotal / Discount / GST / QST / Freight / TOTAL
  // ============================================================
  y -= 4;

  const summaryTop = y;
  const summaryLabelX = LM + tableW * 0.62;
  const summaryValueLeft = LM + tableW * 0.82;
  const summaryValueRight = RM;
  const summaryRowH = 18;

  const drawSummaryRow = (
    label: string,
    value: string,
    opts?: { bold?: boolean; double?: boolean; negate?: boolean }
  ) => {
    const font = opts?.bold ? helveticaBold : helvetica;
    const size = opts?.bold ? 11 : 10;
    const color = opts?.bold ? black : darkText;
    const valStr = opts?.negate ? `-${value}` : value;

    // Label
    page.drawText(label, {
      x: summaryLabelX,
      y: y - 13,
      font,
      size,
      color,
    });

    // Value box
    page.drawRectangle({
      x: summaryValueLeft,
      y: y - summaryRowH,
      width: summaryValueRight - summaryValueLeft,
      height: summaryRowH,
      color: opts?.bold ? sectionFill : white,
      borderColor: border,
      borderWidth: opts?.double ? 1 : 0.5,
    });

    drawTextRightAligned(
      page,
      valStr,
      summaryValueRight - 6,
      y - 13,
      font,
      size,
      color
    );

    y -= summaryRowH;
  };

  drawSummaryRow("Subtotal", fmt(subtotalAmt));
  drawSummaryRow("Discount", fmt(discount), { negate: discount > 0 });
  drawSummaryRow("TPS/GST (5%)", fmt(tpsGst));
  drawSummaryRow("TVQ/QST (9.975%)", fmt(tvqQst));
  drawSummaryRow("Freight", fmt(freight));
  drawSummaryRow("TOTAL", fmt(total), { bold: true, double: true });

  // Currency row
  drawSummaryRow("Currency", "CAD");

  // --- Left panel: TERMS OF SALE AND OTHER COMMENTS / TAX ID ---
  const panelTop = summaryTop;
  const panelBottom = y;
  const panelW = summaryLabelX - LM - 10;

  // Header bar
  const panelHeaderH = 16;
  page.drawRectangle({
    x: LM,
    y: panelTop - panelHeaderH,
    width: panelW,
    height: panelHeaderH,
    color: sectionFill,
    borderColor: border,
    borderWidth: 0.5,
  });
  page.drawText("TERMS OF SALE AND OTHER COMMENTS", {
    x: LM + 6,
    y: panelTop - 12,
    font: helveticaBold,
    size: 9,
    color: accentRed,
  });

  // Body
  const bodyTop = panelTop - panelHeaderH;
  const bodyH = panelBottom - bodyTop;
  page.drawRectangle({
    x: LM,
    y: panelBottom,
    width: panelW,
    height: bodyH,
    color: white,
    borderColor: border,
    borderWidth: 0.5,
  });

  // TAX ID header (like row 36 in template)
  let py = bodyTop - 14;
  page.drawText("TAX ID:", {
    x: LM + 8,
    y: py,
    font: helveticaBold,
    size: 9,
    color: darkText,
  });
  py -= 13;
  page.drawText("G.S.T: 840134829", {
    x: LM + 8,
    y: py,
    font: helvetica,
    size: 9,
    color: darkText,
  });
  py -= 13;
  page.drawText("Q.S.T: 1214617001", {
    x: LM + 8,
    y: py,
    font: helvetica,
    size: 9,
    color: darkText,
  });
  py -= 18;

  // Cheques line
  const chequeText = "Please make all cheques payable to R.S. ELECTRONIQUE INC.";
  page.drawText(
    truncateToWidth(chequeText, panelW - 16, helvetica, 8),
    {
      x: LM + 8,
      y: py,
      font: helvetica,
      size: 8,
      color: muted,
    }
  );
  py -= 12;

  // Questions line
  const qText =
    "For any questions concerning this invoice, contact accounts@rspcbassembly.com";
  page.drawText(
    truncateToWidth(qText, panelW - 16, helvetica, 8),
    {
      x: LM + 8,
      y: py,
      font: helvetica,
      size: 8,
      color: muted,
    }
  );

  // Notes (if any) below the panel
  y -= 8;
  if (notesStr && !notesStr.includes("Consolidated invoice for jobs:")) {
    page.drawText("NOTES", {
      x: LM,
      y,
      font: helveticaBold,
      size: 9,
      color: darkText,
    });
    y -= 13;
    const maxW = RM - LM;
    const noteLines = notesStr.split("\n");
    for (const rawLine of noteLines) {
      const words = rawLine.split(" ");
      let cur = "";
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        if (helvetica.widthOfTextAtSize(test, 8) > maxW) {
          if (cur) {
            page.drawText(cur, { x: LM, y, font: helvetica, size: 8, color: muted });
            y -= 11;
          }
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) {
        page.drawText(cur, { x: LM, y, font: helvetica, size: 8, color: muted });
        y -= 11;
      }
    }
  }

  // --- Footer ---
  const footerY = 32;
  page.drawLine({
    start: { x: LM, y: footerY + 12 },
    end: { x: RM, y: footerY + 12 },
    thickness: 0.5,
    color: border,
  });
  page.drawText("R.S. Electronique Inc. · 5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", {
    x: LM,
    y: footerY,
    font: helvetica,
    size: 7,
    color: muted,
  });
  drawTextRightAligned(
    page,
    `${invoiceNumber} · Page 1 of 1`,
    RM,
    footerY,
    helvetica,
    7,
    muted
  );

  // Avoid "unused variable" warnings when helpers are kept for layout fidelity.
  void drawTextCenteredV;
  void headerLabels;

  // --- Serialize ---
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const gmpNumberForPath =
    lineItems?.[0]?.gmp_number || job?.gmps?.gmp_number || "unknown";
  const storagePath = `${customerCode}/${gmpNumberForPath}/${invoiceNumber}.pdf`;

  await supabase.storage.from("invoices").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await supabase
    .from("invoices")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
    },
  });
}
