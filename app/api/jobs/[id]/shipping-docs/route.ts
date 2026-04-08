import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, rgb } from "pdf-lib";
import {
  createPdfDoc,
  drawHeader,
  drawFooter,
  drawTableHeaderRow,
  drawSignatureBlock,
  fmtDate,
  A4_WIDTH,
  A4_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  COLOR_DARK,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_WHITE,
  COLOR_BG_ALT,
  COLOR_BORDER,
} from "@/lib/pdf/helpers";

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

  const docType = req.nextUrl.searchParams.get("type") ?? "packing-slip";

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(code, company_name, contact_name, shipping_address), gmps(gmp_number, board_name)"
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
    shipping_address: Record<string, string> | null;
  } | null;

  const gmp = job.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;

  const metadata = (job.metadata ?? {}) as Record<string, unknown>;
  const shipDate =
    (metadata.ship_date as string) ??
    new Date().toISOString().split("T")[0];
  const courierName = (metadata.courier_name as string) ?? null;
  const trackingId = (metadata.tracking_id as string) ?? null;

  const addr = customer?.shipping_address;
  const shipToAddress = addr
    ? [addr.street, addr.city, addr.province, addr.postal_code, addr.country]
        .filter(Boolean)
        .join(", ")
    : null;

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
      gmpNumber,
      boardName: gmp?.board_name,
      quantity: job.quantity,
      shipDate,
      procBatchCode,
    });
    fileName = `${job.job_number}-compliance.pdf`;
  } else {
    pdfBytes = await generatePackingSlip({
      jobNumber: job.job_number,
      procBatchCode,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      shipToAddress,
      courierName,
      trackingId,
      shipDate,
      items: [
        {
          gmpNumber,
          boardName: gmp?.board_name,
          quantity: job.quantity,
          description: `PCB Assembly — ${gmpNumber}`,
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
// Packing Slip
// ---------------------------------------------------------------------------

interface PackingSlipItem {
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  description?: string | null;
}

interface PackingSlipParams {
  jobNumber: string;
  procBatchCode: string | null;
  customerName: string;
  contactName: string | null | undefined;
  shipToAddress: string | null;
  courierName: string | null;
  trackingId: string | null;
  shipDate: string | null;
  items: PackingSlipItem[];
  notes: string | null | undefined;
}

async function generatePackingSlip(p: PackingSlipParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const dateStr = fmtDate(p.shipDate);

  let y = drawHeader(page, fonts, "PACKING SLIP", [p.jobNumber, dateStr]);

  // Ship To block (left)
  page.drawText("SHIP TO", {
    x: MARGIN,
    y,
    size: 9,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  let leftY = y - 14;
  page.drawText(p.customerName, { x: MARGIN, y: leftY, size: 9, font: fonts.regular, color: COLOR_TEXT });
  leftY -= 13;
  if (p.contactName) {
    page.drawText(`Attn: ${p.contactName}`, { x: MARGIN, y: leftY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    leftY -= 13;
  }
  if (p.shipToAddress) {
    page.drawText(p.shipToAddress, { x: MARGIN, y: leftY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    leftY -= 13;
  }

  // Shipment details block (right)
  const rightX = A4_WIDTH / 2 + 20;
  page.drawText("SHIPMENT DETAILS", {
    x: rightX,
    y,
    size: 9,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  let rightY = y - 14;
  const detailLines: string[] = [
    `Job: ${p.jobNumber}`,
    ...(p.procBatchCode ? [`Batch: ${p.procBatchCode}`] : []),
    `Ship Date: ${dateStr}`,
    ...(p.courierName ? [`Courier: ${p.courierName}`] : []),
    ...(p.trackingId ? [`Tracking: ${p.trackingId}`] : []),
  ];
  for (const line of detailLines) {
    page.drawText(line, { x: rightX, y: rightY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    rightY -= 13;
  }

  y = Math.min(leftY, rightY) - 10;

  // Items table
  const colItem = MARGIN + 4;
  const colGmp = MARGIN + 40;
  const colDesc = MARGIN + 200;
  const colQty = A4_WIDTH - MARGIN - 60;

  const columns = [
    { label: "#", x: colItem, width: 30, align: "center" as const },
    { label: "GMP / Board", x: colGmp, width: 155, align: "left" as const },
    { label: "Description", x: colDesc, width: 170, align: "left" as const },
    { label: "Quantity", x: colQty, width: 55, align: "right" as const },
  ];

  y = drawTableHeaderRow(page, fonts, y, columns);

  const totalQty = p.items.reduce((sum, item) => sum + item.quantity, 0);

  for (let i = 0; i < p.items.length; i++) {
    const item = p.items[i];
    const rowH = 20;
    const rowY = y - rowH;

    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_WIDTH, height: rowH, color: COLOR_BG_ALT });
    }

    const textY = rowY + 6;
    const numText = String(i + 1);
    const numW = fonts.regular.widthOfTextAtSize(numText, 9);
    page.drawText(numText, { x: colItem + (30 - numW) / 2, y: textY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    page.drawText(`${item.gmpNumber}${item.boardName ? ` (${item.boardName})` : ""}`, {
      x: colGmp, y: textY, size: 9, font: fonts.regular, color: COLOR_TEXT,
    });
    page.drawText(item.description ?? "PCB Assembly", {
      x: colDesc, y: textY, size: 9, font: fonts.regular, color: COLOR_TEXT,
    });
    const qtyText = String(item.quantity);
    const qtyW = fonts.regular.widthOfTextAtSize(qtyText, 9);
    page.drawText(qtyText, { x: colQty + 55 - qtyW, y: textY, size: 9, font: fonts.regular, color: COLOR_TEXT });

    page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: A4_WIDTH - MARGIN, y: rowY }, thickness: 0.5, color: COLOR_BORDER });
    y = rowY;
  }

  // Total row
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 1.5, color: COLOR_DARK });
  y -= 16;
  const totalLabel = "Total Boards";
  const totalLabelW = fonts.bold.widthOfTextAtSize(totalLabel, 10);
  page.drawText(totalLabel, { x: colQty - totalLabelW - 12, y, size: 10, font: fonts.bold, color: COLOR_DARK });
  const totalValText = String(totalQty);
  const totalValW = fonts.bold.widthOfTextAtSize(totalValText, 10);
  page.drawText(totalValText, { x: colQty + 55 - totalValW, y, size: 10, font: fonts.bold, color: COLOR_DARK });

  // Notes
  if (p.notes) {
    y -= 24;
    page.drawText("NOTES", { x: MARGIN, y, size: 9, font: fonts.bold, color: COLOR_DARK });
    y -= 14;
    page.drawText(p.notes, { x: MARGIN, y, size: 9, font: fonts.regular, color: COLOR_MUTED });
  }

  // Signature block
  y -= 20;
  drawSignatureBlock(page, fonts, y, "Packed By / Date", "Received By / Date");

  // Footer
  drawFooter(page, fonts, "R.S. Electronique Inc.", `Packing Slip — ${p.jobNumber}`, 1, 1);

  return doc.save();
}

// ---------------------------------------------------------------------------
// Compliance Certificate
// ---------------------------------------------------------------------------

interface ComplianceParams {
  jobNumber: string;
  customerName: string;
  contactName: string | null | undefined;
  gmpNumber: string;
  boardName: string | null | undefined;
  quantity: number;
  shipDate: string | null;
  procBatchCode: string | null;
}

async function generateComplianceCertificate(p: ComplianceParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const dateStr = fmtDate(p.shipDate);

  // ---- Page 1: RoHS Certificate ----
  const page1 = doc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Custom header for compliance (title is two lines)
  let y = A4_HEIGHT - MARGIN;
  page1.drawText("R.S. ELECTRONIQUE INC.", { x: MARGIN, y, size: 14, font: fonts.bold, color: COLOR_DARK });
  page1.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: MARGIN, y: y - 14, size: 8, font: fonts.regular, color: COLOR_MUTED });
  page1.drawText("+1 (438) 833-8477 | info@rspcbassembly.com", { x: MARGIN, y: y - 25, size: 8, font: fonts.regular, color: COLOR_MUTED });
  page1.drawText("www.rspcbassembly.com", { x: MARGIN, y: y - 36, size: 8, font: fonts.regular, color: COLOR_MUTED });

  const titleLine1 = "CERTIFICATE OF";
  const titleLine2 = "COMPLIANCE";
  let tw = fonts.bold.widthOfTextAtSize(titleLine1, 16);
  page1.drawText(titleLine1, { x: A4_WIDTH - MARGIN - tw, y, size: 16, font: fonts.bold, color: COLOR_DARK });
  tw = fonts.bold.widthOfTextAtSize(titleLine2, 16);
  page1.drawText(titleLine2, { x: A4_WIDTH - MARGIN - tw, y: y - 18, size: 16, font: fonts.bold, color: COLOR_DARK });
  const subLine = "Lead-Free / RoHS";
  let sw = fonts.regular.widthOfTextAtSize(subLine, 9);
  page1.drawText(subLine, { x: A4_WIDTH - MARGIN - sw, y: y - 34, size: 9, font: fonts.regular, color: COLOR_MUTED });
  sw = fonts.regular.widthOfTextAtSize(dateStr, 9);
  page1.drawText(dateStr, { x: A4_WIDTH - MARGIN - sw, y: y - 47, size: 9, font: fonts.regular, color: COLOR_MUTED });

  y -= 52;
  page1.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 2, color: COLOR_DARK });
  y -= 24;

  // Customer info (left)
  page1.drawText("CUSTOMER", { x: MARGIN, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  page1.drawText(p.customerName, { x: MARGIN, y: y - 14, size: 9, font: fonts.regular, color: COLOR_TEXT });
  if (p.contactName) {
    page1.drawText(`Attn: ${p.contactName}`, { x: MARGIN, y: y - 27, size: 9, font: fonts.regular, color: COLOR_TEXT });
  }

  // Product details (right)
  const rx = A4_WIDTH / 2 + 20;
  page1.drawText("PRODUCT DETAILS", { x: rx, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  const productLines = [
    `Job: ${p.jobNumber}`,
    `GMP: ${p.gmpNumber}`,
    ...(p.boardName ? [`Board: ${p.boardName}`] : []),
    `Quantity: ${p.quantity} units`,
    ...(p.procBatchCode ? [`Batch: ${p.procBatchCode}`] : []),
  ];
  let pY = y - 14;
  for (const pl of productLines) {
    page1.drawText(pl, { x: rx, y: pY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    pY -= 13;
  }

  y -= 70;

  // RoHS section
  page1.drawText("Lead-Free / RoHS Compliance Declaration", { x: MARGIN, y, size: 12, font: fonts.bold, color: COLOR_DARK });
  y -= 18;

  const rohsText = "R.S. Electronique Inc. hereby certifies that the above-referenced assembled printed circuit boards have been manufactured in compliance with the European Union Directive 2011/65/EU (RoHS 2) and its amendment Directive (EU) 2015/863 (RoHS 3) restricting the use of certain hazardous substances in electrical and electronic equipment.";
  y = drawWrappedText(page1, fonts.regular, rohsText, MARGIN, y, CONTENT_WIDTH, 9, COLOR_TEXT);
  y -= 8;

  page1.drawText("This certificate confirms the following:", { x: MARGIN, y, size: 9, font: fonts.regular, color: COLOR_TEXT });
  y -= 16;

  const rohsBullets = [
    "1. All solder paste and solder materials used in the assembly process are lead-free, conforming to SAC305 (Sn96.5/Ag3.0/Cu0.5) or equivalent lead-free alloy.",
    "2. All electronic components procured for this assembly are declared RoHS-compliant by their respective manufacturers.",
    "3. The assembled PCBs do not contain any of the following restricted substances above the maximum concentration values: Lead (Pb), Mercury (Hg), Cadmium (Cd), Hexavalent Chromium (Cr6+), Polybrominated Biphenyls (PBB), Polybrominated Diphenyl Ethers (PBDE), Bis(2-Ethylhexyl) phthalate (DEHP), Butyl benzyl phthalate (BBP), Dibutyl phthalate (DBP), Diisobutyl phthalate (DIBP).",
    "4. The reflow soldering profile used meets the requirements for lead-free processing with peak temperatures appropriate for SAC305 alloy.",
  ];

  for (const bullet of rohsBullets) {
    y = drawWrappedText(page1, fonts.regular, bullet, MARGIN + 12, y, CONTENT_WIDTH - 12, 9, COLOR_TEXT);
    y -= 6;
  }

  y -= 10;
  page1.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: COLOR_BORDER });
  y -= 20;

  drawSignatureBlock(page1, fonts, y, "Authorized Signature / Date", "Title");
  drawFooter(page1, fonts, "R.S. Electronique Inc.", `RoHS Certificate — ${p.jobNumber}`, 1, 2);

  // ---- Page 2: IPC Certificate ----
  const page2 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  y = A4_HEIGHT - MARGIN;

  page2.drawText("R.S. ELECTRONIQUE INC.", { x: MARGIN, y, size: 14, font: fonts.bold, color: COLOR_DARK });
  page2.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: MARGIN, y: y - 14, size: 8, font: fonts.regular, color: COLOR_MUTED });
  page2.drawText("+1 (438) 833-8477 | info@rspcbassembly.com", { x: MARGIN, y: y - 25, size: 8, font: fonts.regular, color: COLOR_MUTED });
  page2.drawText("www.rspcbassembly.com", { x: MARGIN, y: y - 36, size: 8, font: fonts.regular, color: COLOR_MUTED });

  tw = fonts.bold.widthOfTextAtSize(titleLine1, 16);
  page2.drawText(titleLine1, { x: A4_WIDTH - MARGIN - tw, y, size: 16, font: fonts.bold, color: COLOR_DARK });
  tw = fonts.bold.widthOfTextAtSize(titleLine2, 16);
  page2.drawText(titleLine2, { x: A4_WIDTH - MARGIN - tw, y: y - 18, size: 16, font: fonts.bold, color: COLOR_DARK });
  const ipcSub = "IPC Quality Standards";
  sw = fonts.regular.widthOfTextAtSize(ipcSub, 9);
  page2.drawText(ipcSub, { x: A4_WIDTH - MARGIN - sw, y: y - 34, size: 9, font: fonts.regular, color: COLOR_MUTED });
  sw = fonts.regular.widthOfTextAtSize(dateStr, 9);
  page2.drawText(dateStr, { x: A4_WIDTH - MARGIN - sw, y: y - 47, size: 9, font: fonts.regular, color: COLOR_MUTED });

  y -= 52;
  page2.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 2, color: COLOR_DARK });
  y -= 24;

  // Customer + Product (same as page 1)
  page2.drawText("CUSTOMER", { x: MARGIN, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  page2.drawText(p.customerName, { x: MARGIN, y: y - 14, size: 9, font: fonts.regular, color: COLOR_TEXT });
  if (p.contactName) {
    page2.drawText(`Attn: ${p.contactName}`, { x: MARGIN, y: y - 27, size: 9, font: fonts.regular, color: COLOR_TEXT });
  }
  page2.drawText("PRODUCT DETAILS", { x: rx, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  pY = y - 14;
  for (const pl of productLines) {
    page2.drawText(pl, { x: rx, y: pY, size: 9, font: fonts.regular, color: COLOR_TEXT });
    pY -= 13;
  }

  y -= 70;

  // IPC section
  page2.drawText("IPC Quality Compliance Declaration", { x: MARGIN, y, size: 12, font: fonts.bold, color: COLOR_DARK });
  y -= 18;

  const ipcIntro = "R.S. Electronique Inc. hereby certifies that the above-referenced assembled printed circuit boards have been manufactured and inspected in accordance with the following IPC standards:";
  y = drawWrappedText(page2, fonts.regular, ipcIntro, MARGIN, y, CONTENT_WIDTH, 9, COLOR_TEXT);
  y -= 12;

  const ipcBullets = [
    "1. IPC-A-610 Rev. H -- Acceptability of Electronic Assemblies, Class 2 (Dedicated Service Electronic Products). All solder joints, component placements, and workmanship meet or exceed Class 2 requirements unless otherwise specified by the customer.",
    "2. IPC J-STD-001 Rev. H -- Requirements for Soldered Electrical and Electronic Assemblies. All soldering processes, materials, and methods conform to this standard.",
    "3. IPC-7711/7721 Rev. C -- Rework, Modification and Repair of Electronic Assemblies. Any rework or repair performed follows the procedures defined in this standard.",
    "4. Visual inspection and/or Automated Optical Inspection (AOI) has been performed on 100% of assemblies in this shipment. All boards have passed inspection criteria prior to shipment.",
  ];

  for (const bullet of ipcBullets) {
    y = drawWrappedText(page2, fonts.regular, bullet, MARGIN + 12, y, CONTENT_WIDTH - 12, 9, COLOR_TEXT);
    y -= 6;
  }

  y -= 4;
  page2.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: COLOR_BORDER });
  y -= 10;

  const closingText = "This certificate applies to the specific job and quantity referenced above. R.S. Electronique Inc. maintains quality records for traceability purposes. Supporting documentation is available upon request.";
  y = drawWrappedText(page2, fonts.regular, closingText, MARGIN, y, CONTENT_WIDTH, 9, COLOR_TEXT);
  y -= 10;

  drawSignatureBlock(page2, fonts, y, "Quality Assurance / Date", "Title");
  drawFooter(page2, fonts, "R.S. Electronique Inc.", `IPC Certificate — ${p.jobNumber}`, 2, 2);

  return doc.save();
}

// ---------------------------------------------------------------------------
// Text wrapping helper
// ---------------------------------------------------------------------------

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: ReturnType<typeof rgb>
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size * 1.6;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size * 1.6;
  }
  return currentY;
}

// Need PDFPage and PDFFont types for the helper
import type { PDFPage, PDFFont } from "pdf-lib";
