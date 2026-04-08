import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
      "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, quantity, gmps(gmp_number, board_name), quotes(pricing))"
    )
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const customer = invoice.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    payment_terms: string | null;
  } | null;

  const job = invoice.jobs as unknown as {
    job_number: string;
    gmp_id: string;
    quantity: number;
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
          "id, job_number, quantity, gmps(gmp_number, board_name), quotes(pricing)"
        )
        .in("job_number", jobNumbers);

      if (relatedJobs && relatedJobs.length > 1) {
        type RelatedJob = {
          id: string;
          job_number: string;
          quantity: number;
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

  // --- Build PDF with pdf-lib (pure JS, works on Vercel serverless) ---
  const invoiceNumber = invoice.invoice_number as string;
  const subtotal = Number(invoice.subtotal) || 0;
  const tpsGst = Number(invoice.tps_gst) || 0;
  const tvqQst = Number(invoice.tvq_qst) || 0;
  const freight = Number(invoice.freight) || 0;
  const discount = Number(invoice.discount) || 0;
  const total = Number(invoice.total) || 0;
  const paymentTerms = customer?.payment_terms ?? "Net 30";
  const jobNumber = job?.job_number ?? "\u2014";
  const gmpNumber = job?.gmps?.gmp_number ?? "\u2014";

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

  let y = height - 40;
  const leftMargin = 40;
  const rightEdge = width - 40;

  // --- Header ---
  page.drawText("R.S. ELECTRONIQUE INC.", {
    x: leftMargin,
    y,
    font: helveticaBold,
    size: 14,
    color: black,
  });
  y -= 14;
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", {
    x: leftMargin,
    y,
    font: helvetica,
    size: 8,
    color: gray,
  });
  y -= 11;
  page.drawText("+1 (438) 833-8477 · info@rspcbassembly.com", {
    x: leftMargin,
    y,
    font: helvetica,
    size: 8,
    color: gray,
  });
  y -= 11;
  page.drawText("GST: 840134829 · QST: 1214617001", {
    x: leftMargin,
    y,
    font: helvetica,
    size: 8,
    color: gray,
  });

  // Right side — INVOICE title
  const titleText = "INVOICE";
  page.drawText(titleText, {
    x: rightEdge - helveticaBold.widthOfTextAtSize(titleText, 18),
    y: height - 40,
    font: helveticaBold,
    size: 18,
    color: black,
  });
  page.drawText(invoiceNumber, {
    x: rightEdge - helvetica.widthOfTextAtSize(invoiceNumber, 10),
    y: height - 56,
    font: helvetica,
    size: 10,
    color: black,
  });
  const dateStr = fmtDate(invoice.issued_date);
  page.drawText(dateStr, {
    x: rightEdge - helvetica.widthOfTextAtSize(dateStr, 9),
    y: height - 69,
    font: helvetica,
    size: 9,
    color: gray,
  });

  // Separator line
  y -= 8;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightEdge, y },
    thickness: 2,
    color: black,
  });
  y -= 24;

  // --- Bill To + Invoice Details ---
  page.drawText("BILL TO", {
    x: leftMargin,
    y,
    font: helveticaBold,
    size: 9,
    color: black,
  });
  page.drawText("INVOICE DETAILS", {
    x: 320,
    y,
    font: helveticaBold,
    size: 9,
    color: black,
  });
  y -= 16;

  page.drawText(customer?.company_name ?? "Unknown", {
    x: leftMargin,
    y,
    font: helvetica,
    size: 9,
    color: black,
  });

  if (lineItems && lineItems.length > 1) {
    const jobsText = `Jobs: ${lineItems.map((li) => li.job_number).join(", ")}`;
    page.drawText(jobsText, {
      x: 320,
      y,
      font: helvetica,
      size: 9,
      color: black,
    });
  } else {
    page.drawText(`Job: ${jobNumber}`, {
      x: 320,
      y,
      font: helvetica,
      size: 9,
      color: black,
    });
  }
  y -= 14;

  if (customer?.contact_name) {
    page.drawText(`Attn: ${customer.contact_name}`, {
      x: leftMargin,
      y,
      font: helvetica,
      size: 9,
      color: gray,
    });
  }

  if (!(lineItems && lineItems.length > 1)) {
    page.drawText(`GMP: ${gmpNumber}`, {
      x: 320,
      y,
      font: helvetica,
      size: 9,
      color: black,
    });
  }
  y -= 14;

  const dueDateStr = fmtDate(invoice.due_date);
  page.drawText(`Due Date: ${dueDateStr}`, {
    x: 320,
    y,
    font: helvetica,
    size: 9,
    color: black,
  });
  y -= 14;
  page.drawText(`Terms: ${paymentTerms}`, {
    x: 320,
    y,
    font: helvetica,
    size: 9,
    color: black,
  });

  y -= 24;

  // --- Line Items Table ---
  const rowH = 20;
  const colDesc = 0.45;
  const colQty = 0.15;
  const colUnit = 0.2;
  const colAmt = 0.2;
  const tableW = rightEdge - leftMargin;

  // Table header
  page.drawRectangle({
    x: leftMargin,
    y: y - rowH,
    width: tableW,
    height: rowH,
    color: headerBg,
  });

  page.drawText("Description", {
    x: leftMargin + 4,
    y: y - 14,
    font: helveticaBold,
    size: 8,
    color: white,
  });
  const qtyLabel = "Qty";
  page.drawText(qtyLabel, {
    x:
      leftMargin +
      tableW * colDesc +
      tableW * colQty -
      helveticaBold.widthOfTextAtSize(qtyLabel, 8) -
      4,
    y: y - 14,
    font: helveticaBold,
    size: 8,
    color: white,
  });
  const upLabel = "Unit Price";
  page.drawText(upLabel, {
    x:
      leftMargin +
      tableW * (colDesc + colQty) +
      tableW * colUnit -
      helveticaBold.widthOfTextAtSize(upLabel, 8) -
      4,
    y: y - 14,
    font: helveticaBold,
    size: 8,
    color: white,
  });
  const amtLabel = "Amount";
  page.drawText(amtLabel, {
    x: rightEdge - helveticaBold.widthOfTextAtSize(amtLabel, 8) - 4,
    y: y - 14,
    font: helveticaBold,
    size: 8,
    color: white,
  });
  y -= rowH;

  // Table rows
  if (lineItems && lineItems.length > 1) {
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      // Alternating background
      if (i % 2 === 1) {
        page.drawRectangle({
          x: leftMargin,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: rgb(0.97, 0.98, 0.99),
        });
      }
      page.drawLine({
        start: { x: leftMargin, y: y - rowH },
        end: { x: rightEdge, y: y - rowH },
        thickness: 0.5,
        color: lightGray,
      });

      const desc = `PCB Assembly - Job ${item.job_number} (GMP: ${item.gmp_number})${item.board_name ? ` - ${item.board_name}` : ""}`;
      page.drawText(desc, {
        x: leftMargin + 4,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: black,
      });

      const qtyStr = String(item.quantity);
      page.drawText(qtyStr, {
        x:
          leftMargin +
          tableW * colDesc +
          tableW * colQty -
          helvetica.widthOfTextAtSize(qtyStr, 9) -
          4,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: black,
      });

      const upStr = fmt(item.per_unit);
      page.drawText(upStr, {
        x:
          leftMargin +
          tableW * (colDesc + colQty) +
          tableW * colUnit -
          helvetica.widthOfTextAtSize(upStr, 9) -
          4,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: black,
      });

      const amtStr = fmt(item.subtotal);
      page.drawText(amtStr, {
        x: rightEdge - helvetica.widthOfTextAtSize(amtStr, 9) - 4,
        y: y - 14,
        font: helvetica,
        size: 9,
        color: black,
      });

      y -= rowH;
    }
  } else {
    // Single-job row
    page.drawLine({
      start: { x: leftMargin, y: y - rowH },
      end: { x: rightEdge, y: y - rowH },
      thickness: 0.5,
      color: lightGray,
    });

    const desc = `PCB Assembly - Job ${jobNumber} (GMP: ${gmpNumber})`;
    page.drawText(desc, {
      x: leftMargin + 4,
      y: y - 14,
      font: helvetica,
      size: 9,
      color: black,
    });

    const amtStr = fmt(subtotal);
    page.drawText(amtStr, {
      x: rightEdge - helvetica.widthOfTextAtSize(amtStr, 9) - 4,
      y: y - 14,
      font: helvetica,
      size: 9,
      color: black,
    });

    y -= rowH;
  }

  y -= 16;

  // --- Summary Section ---
  const summaryLabelX = rightEdge - 240;
  const summaryValueX = rightEdge - 4;

  const drawSummaryRow = (
    label: string,
    value: string,
    bold = false,
    negate = false
  ) => {
    const font = bold ? helveticaBold : helvetica;
    const fontSize = bold ? 11 : 9;
    const color = bold ? black : gray;
    const displayValue = negate ? `-${value}` : value;

    if (bold) {
      page.drawLine({
        start: { x: summaryLabelX, y: y + 3 },
        end: { x: rightEdge, y: y + 3 },
        thickness: 1.5,
        color: black,
      });
      y -= 4;
    }

    page.drawText(label, {
      x: summaryValueX - 100 - font.widthOfTextAtSize(label, fontSize),
      y,
      font,
      size: fontSize,
      color,
    });
    page.drawText(displayValue, {
      x: summaryValueX - font.widthOfTextAtSize(displayValue, fontSize),
      y,
      font,
      size: fontSize,
      color,
    });
    y -= bold ? 20 : 16;
  };

  drawSummaryRow("Subtotal", fmt(subtotal));
  if (discount > 0) {
    drawSummaryRow("Discount", fmt(discount), false, true);
  }
  drawSummaryRow("TPS/GST (5%)", fmt(tpsGst));
  drawSummaryRow("TVQ/QST (9.975%)", fmt(tvqQst));
  if (freight > 0) {
    drawSummaryRow("Freight", fmt(freight));
  }
  drawSummaryRow("Total Due (CAD)", fmt(total), true);

  // --- Notes ---
  if (notesStr) {
    page.drawText("NOTES", {
      x: leftMargin,
      y,
      font: helveticaBold,
      size: 9,
      color: black,
    });
    y -= 14;
    // Wrap long notes — simple line splitting
    const maxLineWidth = rightEdge - leftMargin;
    const noteLines = notesStr.split("\n");
    for (const line of noteLines) {
      // Basic word wrapping
      const words = line.split(" ");
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (helvetica.widthOfTextAtSize(testLine, 9) > maxLineWidth) {
          if (currentLine) {
            page.drawText(currentLine, {
              x: leftMargin,
              y,
              font: helvetica,
              size: 9,
              color: gray,
            });
            y -= 12;
          }
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        page.drawText(currentLine, {
          x: leftMargin,
          y,
          font: helvetica,
          size: 9,
          color: gray,
        });
        y -= 12;
      }
    }
    y -= 8;
  }

  // --- Payment Terms Notice ---
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightEdge, y },
    thickness: 1,
    color: lightGray,
  });
  y -= 14;

  const termsLines = [
    `Payment is due within the terms stated above (${paymentTerms}).`,
    "Please make cheques payable to R.S. Electronique Inc. or remit",
    "payment via wire transfer. All amounts are in Canadian Dollars (CAD).",
    "A 2% monthly interest charge will be applied to overdue balances.",
  ];
  for (const line of termsLines) {
    page.drawText(line, {
      x: leftMargin,
      y,
      font: helvetica,
      size: 8,
      color: gray,
    });
    y -= 11;
  }

  // --- Footer ---
  const footerY = 24;
  page.drawLine({
    start: { x: leftMargin, y: footerY + 8 },
    end: { x: rightEdge, y: footerY + 8 },
    thickness: 0.5,
    color: lightGray,
  });
  page.drawText("R.S. Electronique Inc.", {
    x: leftMargin,
    y: footerY,
    font: helvetica,
    size: 7,
    color: gray,
  });
  page.drawText(invoiceNumber, {
    x:
      width / 2 - helvetica.widthOfTextAtSize(invoiceNumber, 7) / 2,
    y: footerY,
    font: helvetica,
    size: 7,
    color: gray,
  });
  page.drawText("Page 1 of 1", {
    x: rightEdge - helvetica.widthOfTextAtSize("Page 1 of 1", 7),
    y: footerY,
    font: helvetica,
    size: 7,
    color: gray,
  });

  // --- Serialize ---
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const storagePath = `${customerCode}/${gmpNumber}/${invoiceNumber}.pdf`;

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
