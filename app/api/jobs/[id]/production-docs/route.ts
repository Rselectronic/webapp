import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";
import {
  createPdfDoc,
  drawHeader,
  drawFooter,
  drawTableHeaderRow,
  drawSignatureBlock,
  truncate,
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
  COLOR_BG_STRIP,
  COLOR_BORDER,
  COLOR_LIGHT,
  type PdfFonts,
} from "@/lib/pdf/helpers";

const VALID_TYPES = ["job-card", "traveller", "print-bom", "reception"] as const;
type DocType = (typeof VALID_TYPES)[number];

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  TB: "Top + Bottom",
  TS: "Top-Side Only",
  CS: "Consignment",
  CB: "Customer Board",
  AS: "Assembly Only",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("type") as DocType | null;

  if (!typeParam || !VALID_TYPES.includes(typeParam)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      `id, job_number, status, quantity, assembly_type, po_number, notes,
       scheduled_start, scheduled_completion,
       customer_id, gmp_id, bom_id, quote_id,
       customers(code, company_name),
       gmps(gmp_number, board_name),
       boms(id, file_name, revision, component_count),
       quotes(quote_number)`
    )
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const customer = job.customers as unknown as {
    code: string;
    company_name: string;
  } | null;
  const gmp = job.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;
  const bom = job.boms as unknown as {
    id: string;
    file_name: string;
    revision: string;
    component_count: number;
  } | null;
  const quote = job.quotes as unknown as { quote_number: string } | null;

  const customerCode = customer?.code ?? "UNKNOWN";
  const customerName = customer?.company_name ?? "Unknown Customer";
  const gmpNumber = gmp?.gmp_number ?? "—";
  const boardName = gmp?.board_name;

  let procBatchCode: string | null = null;
  const { data: proc } = await supabase
    .from("procurements")
    .select("proc_code")
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proc) {
    procBatchCode = proc.proc_code;
  }

  let pdfBytes: Uint8Array;
  let fileName: string;

  switch (typeParam) {
    case "job-card": {
      pdfBytes = await generateJobCard({
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        assemblyType: job.assembly_type ?? "TB",
        procBatchCode,
        scheduledStart: job.scheduled_start,
        scheduledCompletion: job.scheduled_completion,
        componentCount: bom?.component_count ?? 0,
        poNumber: job.po_number,
        quoteNumber: quote?.quote_number,
        notes: job.notes,
      });
      fileName = `${job.job_number}-Job-Card.pdf`;
      break;
    }

    case "traveller": {
      pdfBytes = await generateTraveller({
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        assemblyType: job.assembly_type ?? "TB",
      });
      fileName = `${job.job_number}-Traveller.pdf`;
      break;
    }

    case "print-bom": {
      if (!bom) {
        return NextResponse.json(
          { error: "No BOM linked to this job" },
          { status: 400 }
        );
      }

      const { data: bomLines, error: bomError } = await supabase
        .from("bom_lines")
        .select(
          "line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code"
        )
        .eq("bom_id", bom.id)
        .order("quantity", { ascending: false });

      if (bomError) {
        return NextResponse.json(
          { error: "Failed to fetch BOM lines" },
          { status: 500 }
        );
      }

      pdfBytes = await generatePrintBom({
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        bomFileName: bom.file_name,
        bomRevision: bom.revision,
        lines: (bomLines ?? []).map((l) => ({
          lineNumber: l.line_number,
          quantity: l.quantity,
          referenceDesignator: l.reference_designator,
          cpc: l.cpc,
          description: l.description,
          mpn: l.mpn,
          manufacturer: l.manufacturer,
          mCode: l.m_code,
        })),
      });
      fileName = `${job.job_number}-BOM.pdf`;
      break;
    }

    case "reception": {
      if (!bom) {
        return NextResponse.json(
          { error: "No BOM linked to this job" },
          { status: 400 }
        );
      }

      const { data: bomLines2, error: bomError2 } = await supabase
        .from("bom_lines")
        .select(
          "line_number, quantity, mpn, description, manufacturer, m_code"
        )
        .eq("bom_id", bom.id)
        .order("line_number", { ascending: true });

      if (bomError2) {
        return NextResponse.json(
          { error: "Failed to fetch BOM lines" },
          { status: 500 }
        );
      }

      const boardQty = job.quantity;

      const { data: overageRows } = await supabase
        .from("overage_table")
        .select("m_code, qty_threshold, extras")
        .order("m_code")
        .order("qty_threshold", { ascending: true });

      const overageMap = new Map<string, { threshold: number; extras: number }[]>();
      for (const row of overageRows ?? []) {
        const existing = overageMap.get(row.m_code) ?? [];
        existing.push({ threshold: row.qty_threshold, extras: row.extras });
        overageMap.set(row.m_code, existing);
      }

      function getOverage(mCode: string | null, qty: number): number {
        if (!mCode) return 0;
        const tiers = overageMap.get(mCode);
        if (!tiers) return 0;
        let extras = 0;
        for (const tier of tiers) {
          if (qty >= tier.threshold) extras = tier.extras;
        }
        return extras;
      }

      const receptionLines = (bomLines2 ?? []).map((l) => {
        const qtyNeeded = l.quantity * boardQty;
        const qtyExtra = getOverage(l.m_code, boardQty);
        return {
          lineNumber: l.line_number,
          mpn: l.mpn,
          description: l.description,
          manufacturer: l.manufacturer,
          mCode: l.m_code,
          qtyNeeded,
          qtyExtra,
          totalExpected: qtyNeeded + qtyExtra,
        };
      });

      pdfBytes = await generateReception({
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        procBatchCode,
        lines: receptionLines,
      });
      fileName = `${job.job_number}-Reception.pdf`;
      break;
    }
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Job Card
// ---------------------------------------------------------------------------

interface JobCardParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  assemblyType: string;
  procBatchCode: string | null;
  scheduledStart: string | null;
  scheduledCompletion: string | null;
  componentCount: number;
  poNumber: string | null;
  quoteNumber?: string | null;
  notes: string | null;
}

async function generateJobCard(p: JobCardParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const today = new Date().toLocaleDateString("en-CA");

  let y = drawHeader(page, fonts, "JOB CARD", [p.jobNumber, `Printed: ${today}`]);

  // Detail grid - 2 columns of labeled cells
  const cellW = CONTENT_WIDTH / 2;
  const cellH = 40;
  const gridX = MARGIN;

  const cells: { label: string; value: string; large?: boolean }[] = [
    { label: "Customer", value: `${p.customerCode} — ${p.customerName}` },
    { label: "Quantity", value: String(p.quantity), large: true },
    { label: "GMP / Board", value: `${p.gmpNumber}${p.boardName ? ` (${p.boardName})` : ""}` },
    { label: "Assembly Type", value: `${p.assemblyType} — ${ASSEMBLY_TYPE_LABELS[p.assemblyType] ?? p.assemblyType}` },
  ];

  if (p.procBatchCode) cells.push({ label: "PROC Batch Code", value: p.procBatchCode });
  if (p.poNumber) cells.push({ label: "Customer PO", value: p.poNumber });
  if (p.quoteNumber) cells.push({ label: "Quote Reference", value: p.quoteNumber });
  cells.push({ label: "Component Count", value: String(p.componentCount), large: true });
  cells.push({ label: "Scheduled Start", value: fmtDate(p.scheduledStart) });
  cells.push({ label: "Scheduled Completion", value: fmtDate(p.scheduledCompletion) });

  // Draw border
  const gridRows = Math.ceil(cells.length / 2);
  const gridH = gridRows * cellH;
  page.drawRectangle({
    x: gridX,
    y: y - gridH,
    width: CONTENT_WIDTH,
    height: gridH,
    borderColor: COLOR_BORDER,
    borderWidth: 1,
  });

  for (let i = 0; i < cells.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = gridX + col * cellW + 14;
    const cy = y - row * cellH;

    // Horizontal dividers
    if (row > 0 && col === 0) {
      page.drawLine({
        start: { x: gridX, y: cy },
        end: { x: gridX + CONTENT_WIDTH, y: cy },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
    }

    // Vertical divider
    if (col === 0) {
      page.drawLine({
        start: { x: gridX + cellW, y: cy },
        end: { x: gridX + cellW, y: cy - cellH },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
    }

    page.drawText(cells[i].label.toUpperCase(), {
      x: cx,
      y: cy - 16,
      size: 8,
      font: fonts.bold,
      color: COLOR_LIGHT,
    });
    page.drawText(cells[i].value, {
      x: cx,
      y: cy - 30,
      size: cells[i].large ? 16 : 12,
      font: cells[i].large ? fonts.bold : fonts.regular,
      color: COLOR_DARK,
    });
  }

  y -= gridH + 16;

  // Notes
  if (p.notes) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 60,
      width: CONTENT_WIDTH,
      height: 60,
      borderColor: COLOR_BORDER,
      borderWidth: 1,
    });
    page.drawText("NOTES", { x: MARGIN + 14, y: y - 16, size: 9, font: fonts.bold, color: COLOR_DARK });
    page.drawText(p.notes, { x: MARGIN + 14, y: y - 32, size: 9, font: fonts.regular, color: COLOR_MUTED });
    y -= 76;
  }

  // Signatures
  drawSignatureBlock(page, fonts, y, "Released By (Signature / Date)", "Received By (Operator / Date)");

  drawFooter(page, fonts, "R.S. Electronique Inc.", `${p.jobNumber} — Job Card`, 1, 1);

  return doc.save();
}

// ---------------------------------------------------------------------------
// Traveller
// ---------------------------------------------------------------------------

interface TravellerParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  assemblyType: string;
}

const PROCESS_STEPS = [
  "Materials Received",
  "Setup Started",
  "SMT Top — Start",
  "SMT Top — End",
  "SMT Bottom — Start",
  "SMT Bottom — End",
  "Reflow — Start",
  "Reflow — End",
  "AOI — Start",
  "AOI — Passed",
  "AOI — Failed",
  "Through-Hole — Start",
  "Through-Hole — End",
  "Touchup",
  "Washing",
  "Packing",
  "Ready to Ship",
];

async function generateTraveller(p: TravellerParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const today = new Date().toLocaleDateString("en-CA");

  let y = drawHeader(page, fonts, "PRODUCTION TRAVELLER", [p.jobNumber, `Printed: ${today}`]);

  // Summary strip
  const stripH = 28;
  page.drawRectangle({ x: MARGIN, y: y - stripH, width: CONTENT_WIDTH, height: stripH, color: COLOR_BG_STRIP });

  const summaryItems = [
    { label: "Customer", value: `${p.customerCode} — ${p.customerName}` },
    { label: "GMP", value: `${p.gmpNumber}${p.boardName ? ` (${p.boardName})` : ""}` },
    { label: "Qty", value: String(p.quantity) },
    { label: "Type", value: p.assemblyType },
  ];

  let sx = MARGIN + 10;
  for (const item of summaryItems) {
    page.drawText(item.label.toUpperCase(), { x: sx, y: y - 10, size: 7, font: fonts.bold, color: COLOR_LIGHT });
    page.drawText(item.value, { x: sx, y: y - 22, size: 10, font: fonts.regular, color: COLOR_DARK });
    sx += fonts.regular.widthOfTextAtSize(item.value, 10) + 30;
  }

  y -= stripH + 12;

  // Process steps table
  const colStep = MARGIN + 4;
  const colOp = MARGIN + 160;
  const colDate = MARGIN + 250;
  const colNotes = MARGIN + 360;
  const colSign = MARGIN + 460;

  const columns = [
    { label: "Process Step", x: colStep, width: 152, align: "left" as const },
    { label: "Operator", x: colOp, width: 86, align: "left" as const },
    { label: "Date / Time", x: colDate, width: 106, align: "left" as const },
    { label: "Notes", x: colNotes, width: 96, align: "left" as const },
    { label: "Sign-off", x: colSign, width: 50, align: "center" as const },
  ];

  y = drawTableHeaderRow(page, fonts, y, columns);

  const rowH = 26;
  for (let i = 0; i < PROCESS_STEPS.length; i++) {
    const rowY = y - rowH;
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_WIDTH, height: rowH, color: COLOR_BG_ALT });
    }

    const textY = rowY + 9;
    page.drawText(PROCESS_STEPS[i], { x: colStep, y: textY, size: 9, font: fonts.bold, color: COLOR_DARK });

    // Checkbox (empty rectangle)
    const cbSize = 10;
    page.drawRectangle({
      x: colSign + 20,
      y: textY - 2,
      width: cbSize,
      height: cbSize,
      borderColor: COLOR_LIGHT,
      borderWidth: 1,
    });

    page.drawLine({
      start: { x: MARGIN, y: rowY },
      end: { x: A4_WIDTH - MARGIN, y: rowY },
      thickness: 0.5,
      color: COLOR_BORDER,
    });

    y = rowY;
  }

  drawFooter(page, fonts, "R.S. Electronique Inc.", `${p.jobNumber} — Production Traveller`, 1, 1);

  return doc.save();
}

// ---------------------------------------------------------------------------
// Print BOM
// ---------------------------------------------------------------------------

interface BomLine {
  lineNumber: number;
  quantity: number;
  referenceDesignator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  mCode: string | null;
}

interface PrintBomParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  bomFileName: string;
  bomRevision: string;
  lines: BomLine[];
}

async function generatePrintBom(p: PrintBomParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const today = new Date().toLocaleDateString("en-CA");

  const sorted = [...p.lines].sort((a, b) => b.quantity - a.quantity);

  // Column positions (landscape-like fit on A4 portrait with small font)
  const COL = {
    num:   { x: MARGIN + 2,   w: 22 },
    qty:   { x: MARGIN + 24,  w: 28 },
    ref:   { x: MARGIN + 52,  w: 72 },
    cpc:   { x: MARGIN + 124, w: 68 },
    desc:  { x: MARGIN + 192, w: 112 },
    mpn:   { x: MARGIN + 304, w: 82 },
    mfr:   { x: MARGIN + 386, w: 72 },
    mCode: { x: MARGIN + 458, w: 52 },
  };

  const rowH = 14;
  const headerAreaH = 80; // space for page header + summary strip + table header
  const footerAreaH = 50;
  const usableH = A4_HEIGHT - MARGIN - footerAreaH;
  const dataStartY = A4_HEIGHT - MARGIN - headerAreaH;

  const rowsPerPage = Math.floor((dataStartY - footerAreaH) / rowH);
  const totalPages = Math.ceil(sorted.length / rowsPerPage) || 1;

  const tableColumns = [
    { label: "#",           x: COL.num.x,   width: COL.num.w,   align: "center" as const },
    { label: "Qty",         x: COL.qty.x,   width: COL.qty.w,   align: "center" as const },
    { label: "Ref Des",     x: COL.ref.x,   width: COL.ref.w,   align: "left" as const },
    { label: "CPC",         x: COL.cpc.x,   width: COL.cpc.w,   align: "left" as const },
    { label: "Description", x: COL.desc.x,  width: COL.desc.w,  align: "left" as const },
    { label: "MPN",         x: COL.mpn.x,   width: COL.mpn.w,   align: "left" as const },
    { label: "Manufacturer",x: COL.mfr.x,   width: COL.mfr.w,   align: "left" as const },
    { label: "M-Code",      x: COL.mCode.x, width: COL.mCode.w, align: "center" as const },
  ];

  let lineIdx = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);

    // Header
    let y = A4_HEIGHT - MARGIN;
    page.drawText("R.S. ELECTRONIQUE INC.", { x: MARGIN, y, size: 11, font: fonts.bold, color: COLOR_DARK });
    page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: MARGIN, y: y - 12, size: 7, font: fonts.regular, color: COLOR_MUTED });

    const titleText = "PRINT COPY BOM";
    let tw = fonts.bold.widthOfTextAtSize(titleText, 14);
    page.drawText(titleText, { x: A4_WIDTH - MARGIN - tw, y, size: 14, font: fonts.bold, color: COLOR_DARK });
    tw = fonts.regular.widthOfTextAtSize(p.jobNumber, 9);
    page.drawText(p.jobNumber, { x: A4_WIDTH - MARGIN - tw, y: y - 14, size: 9, font: fonts.regular, color: COLOR_MUTED });
    const printDate = `Printed: ${today}`;
    tw = fonts.regular.widthOfTextAtSize(printDate, 8);
    page.drawText(printDate, { x: A4_WIDTH - MARGIN - tw, y: y - 26, size: 8, font: fonts.regular, color: COLOR_MUTED });

    y -= 28;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 2, color: COLOR_DARK });
    y -= 6;

    // Summary strip
    const stripH = 22;
    page.drawRectangle({ x: MARGIN, y: y - stripH, width: CONTENT_WIDTH, height: stripH, color: COLOR_BG_STRIP });
    const summaryItems = [
      { l: "Customer", v: `${p.customerCode} — ${p.customerName}` },
      { l: "GMP", v: `${p.gmpNumber}${p.boardName ? ` (${p.boardName})` : ""}` },
      { l: "Qty", v: String(p.quantity) },
      { l: "BOM", v: `${p.bomFileName} Rev ${p.bomRevision}` },
      { l: "Lines", v: String(p.lines.length) },
    ];
    let sx = MARGIN + 6;
    for (const s of summaryItems) {
      page.drawText(s.l.toUpperCase(), { x: sx, y: y - 8, size: 6, font: fonts.bold, color: COLOR_LIGHT });
      page.drawText(s.v, { x: sx, y: y - 17, size: 8, font: fonts.regular, color: COLOR_DARK });
      sx += Math.max(fonts.regular.widthOfTextAtSize(s.v, 8), 30) + 16;
    }
    y -= stripH + 4;

    // Table header
    y = drawTableHeaderRow(page, fonts, y, tableColumns);

    // Data rows for this page
    while (lineIdx < sorted.length) {
      const rowY = y - rowH;
      if (rowY < footerAreaH) break; // need new page

      const line = sorted[lineIdx];
      const displayIdx = lineIdx + 1;

      if (lineIdx % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_WIDTH, height: rowH, color: COLOR_BG_ALT });
      }

      const textY = rowY + 4;
      const sz = 7;

      // #
      const numT = String(displayIdx);
      const numW = fonts.regular.widthOfTextAtSize(numT, sz);
      page.drawText(numT, { x: COL.num.x + (COL.num.w - numW) / 2, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // Qty
      const qtyT = String(line.quantity);
      const qtyW = fonts.bold.widthOfTextAtSize(qtyT, sz);
      page.drawText(qtyT, { x: COL.qty.x + (COL.qty.w - qtyW) / 2, y: textY, size: sz, font: fonts.bold, color: COLOR_DARK });

      // Ref Des
      page.drawText(truncate(line.referenceDesignator ?? "", COL.ref.w - 4, fonts.regular, sz), { x: COL.ref.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // CPC
      page.drawText(truncate(line.cpc ?? "", COL.cpc.w - 4, fonts.regular, sz), { x: COL.cpc.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // Description
      page.drawText(truncate(line.description ?? "", COL.desc.w - 4, fonts.regular, sz), { x: COL.desc.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // MPN
      page.drawText(truncate(line.mpn ?? "", COL.mpn.w - 4, fonts.regular, sz), { x: COL.mpn.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // Manufacturer
      page.drawText(truncate(line.manufacturer ?? "", COL.mfr.w - 4, fonts.regular, sz), { x: COL.mfr.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // M-Code
      const mcT = line.mCode ?? "—";
      const mcW = fonts.bold.widthOfTextAtSize(mcT, sz);
      page.drawText(mcT, { x: COL.mCode.x + (COL.mCode.w - mcW) / 2, y: textY, size: sz, font: fonts.bold, color: COLOR_DARK });

      page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: A4_WIDTH - MARGIN, y: rowY }, thickness: 0.5, color: COLOR_BORDER });

      y = rowY;
      lineIdx++;
    }

    // Total row on last page
    if (lineIdx >= sorted.length) {
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 1, color: COLOR_LIGHT });
      y -= 14;
      page.drawText(`Total: ${p.lines.length} component lines`, { x: MARGIN + 4, y, size: 8, font: fonts.bold, color: COLOR_DARK });
    }

    drawFooter(page, fonts, "R.S. Electronique Inc.", `${p.jobNumber} — Print Copy BOM`, pageNum, totalPages);
  }

  return doc.save();
}

// ---------------------------------------------------------------------------
// Reception
// ---------------------------------------------------------------------------

interface ReceptionLine {
  lineNumber: number;
  mpn: string | null;
  description: string | null;
  manufacturer: string | null;
  mCode: string | null;
  qtyNeeded: number;
  qtyExtra: number;
  totalExpected: number;
}

interface ReceptionParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  procBatchCode: string | null;
  lines: ReceptionLine[];
}

async function generateReception(p: ReceptionParams): Promise<Uint8Array> {
  const { doc, fonts } = await createPdfDoc();
  const today = new Date().toLocaleDateString("en-CA");

  const COL = {
    num:      { x: MARGIN + 2,   w: 22 },
    mpn:      { x: MARGIN + 24,  w: 92 },
    desc:     { x: MARGIN + 116, w: 110 },
    mfr:      { x: MARGIN + 226, w: 62 },
    mCode:    { x: MARGIN + 288, w: 38 },
    expected: { x: MARGIN + 326, w: 44 },
    received: { x: MARGIN + 370, w: 44 },
    ok:       { x: MARGIN + 414, w: 36 },
    notes:    { x: MARGIN + 450, w: 65 },
  };

  const rowH = 18;
  const footerAreaH = 50;
  const headerAreaH = 80;
  const dataStartY = A4_HEIGHT - MARGIN - headerAreaH;
  const rowsPerPage = Math.floor((dataStartY - footerAreaH - 80) / rowH); // 80 for signature area on last page
  const totalPages = Math.ceil(p.lines.length / rowsPerPage) || 1;

  const tableColumns = [
    { label: "#",           x: COL.num.x,      width: COL.num.w,      align: "center" as const },
    { label: "MPN",         x: COL.mpn.x,      width: COL.mpn.w,      align: "left" as const },
    { label: "Description", x: COL.desc.x,     width: COL.desc.w,     align: "left" as const },
    { label: "Manufacturer",x: COL.mfr.x,      width: COL.mfr.w,      align: "left" as const },
    { label: "M-Code",      x: COL.mCode.x,    width: COL.mCode.w,    align: "center" as const },
    { label: "Expected",    x: COL.expected.x,  width: COL.expected.w,  align: "center" as const },
    { label: "Received",    x: COL.received.x,  width: COL.received.w,  align: "center" as const },
    { label: "OK",          x: COL.ok.x,        width: COL.ok.w,        align: "center" as const },
    { label: "Notes",       x: COL.notes.x,     width: COL.notes.w,     align: "left" as const },
  ];

  let lineIdx = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);

    // Header
    let y = A4_HEIGHT - MARGIN;
    page.drawText("R.S. ELECTRONIQUE INC.", { x: MARGIN, y, size: 11, font: fonts.bold, color: COLOR_DARK });
    page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: MARGIN, y: y - 12, size: 7, font: fonts.regular, color: COLOR_MUTED });

    const titleText = "RECEPTION FILE";
    let tw = fonts.bold.widthOfTextAtSize(titleText, 14);
    page.drawText(titleText, { x: A4_WIDTH - MARGIN - tw, y, size: 14, font: fonts.bold, color: COLOR_DARK });
    tw = fonts.regular.widthOfTextAtSize(p.jobNumber, 9);
    page.drawText(p.jobNumber, { x: A4_WIDTH - MARGIN - tw, y: y - 14, size: 9, font: fonts.regular, color: COLOR_MUTED });
    const printDate = `Printed: ${today}`;
    tw = fonts.regular.widthOfTextAtSize(printDate, 8);
    page.drawText(printDate, { x: A4_WIDTH - MARGIN - tw, y: y - 26, size: 8, font: fonts.regular, color: COLOR_MUTED });

    y -= 28;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 2, color: COLOR_DARK });
    y -= 6;

    // Summary strip
    const stripH = 22;
    page.drawRectangle({ x: MARGIN, y: y - stripH, width: CONTENT_WIDTH, height: stripH, color: COLOR_BG_STRIP });
    const summaryItems = [
      { l: "Customer", v: `${p.customerCode} — ${p.customerName}` },
      { l: "GMP", v: `${p.gmpNumber}${p.boardName ? ` (${p.boardName})` : ""}` },
      { l: "Board Qty", v: String(p.quantity) },
      ...(p.procBatchCode ? [{ l: "PROC Batch", v: p.procBatchCode }] : []),
      { l: "Lines", v: String(p.lines.length) },
    ];
    let sx = MARGIN + 6;
    for (const s of summaryItems) {
      page.drawText(s.l.toUpperCase(), { x: sx, y: y - 8, size: 6, font: fonts.bold, color: COLOR_LIGHT });
      page.drawText(s.v, { x: sx, y: y - 17, size: 8, font: fonts.regular, color: COLOR_DARK });
      sx += Math.max(fonts.regular.widthOfTextAtSize(s.v, 8), 30) + 16;
    }
    y -= stripH + 4;

    // Table header
    y = drawTableHeaderRow(page, fonts, y, tableColumns);

    // Data rows
    while (lineIdx < p.lines.length) {
      const rowY = y - rowH;
      if (rowY < footerAreaH + (lineIdx >= p.lines.length - 1 ? 80 : 0)) break;

      const line = p.lines[lineIdx];
      const displayIdx = lineIdx + 1;

      if (lineIdx % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_WIDTH, height: rowH, color: COLOR_BG_ALT });
      }

      const textY = rowY + 5;
      const sz = 7;

      // #
      const numT = String(displayIdx);
      const numW = fonts.regular.widthOfTextAtSize(numT, sz);
      page.drawText(numT, { x: COL.num.x + (COL.num.w - numW) / 2, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // MPN
      page.drawText(truncate(line.mpn ?? "—", COL.mpn.w - 4, fonts.bold, sz), { x: COL.mpn.x, y: textY, size: sz, font: fonts.bold, color: COLOR_DARK });

      // Description
      page.drawText(truncate(line.description ?? "", COL.desc.w - 4, fonts.regular, sz), { x: COL.desc.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // Manufacturer
      page.drawText(truncate(line.manufacturer ?? "", COL.mfr.w - 4, fonts.regular, sz), { x: COL.mfr.x, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // M-Code
      const mcT = line.mCode ?? "—";
      const mcW = fonts.regular.widthOfTextAtSize(mcT, sz);
      page.drawText(mcT, { x: COL.mCode.x + (COL.mCode.w - mcW) / 2, y: textY, size: sz, font: fonts.regular, color: COLOR_TEXT });

      // Expected
      const expT = String(line.totalExpected);
      const expW = fonts.bold.widthOfTextAtSize(expT, sz);
      page.drawText(expT, { x: COL.expected.x + (COL.expected.w - expW) / 2, y: textY, size: sz, font: fonts.bold, color: COLOR_DARK });

      // Received (blank for manual fill)
      // OK checkbox
      const cbSize = 10;
      page.drawRectangle({
        x: COL.ok.x + (COL.ok.w - cbSize) / 2,
        y: textY - 1,
        width: cbSize,
        height: cbSize,
        borderColor: COLOR_LIGHT,
        borderWidth: 1,
      });

      page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: A4_WIDTH - MARGIN, y: rowY }, thickness: 0.5, color: COLOR_BORDER });

      y = rowY;
      lineIdx++;
    }

    // Total + signature on last page
    if (lineIdx >= p.lines.length) {
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 1, color: COLOR_LIGHT });
      y -= 14;
      const totalParts = p.lines.reduce((s, l) => s + l.totalExpected, 0);
      page.drawText(`Total: ${p.lines.length} component lines — ${totalParts} parts expected`, {
        x: MARGIN + 4, y, size: 8, font: fonts.bold, color: COLOR_DARK,
      });
      y -= 10;
      drawSignatureBlock(page, fonts, y, "Received By (Signature / Date)", "Verified By (Signature / Date)");
    }

    drawFooter(page, fonts, "R.S. Electronique Inc.", `${p.jobNumber} — Reception File`, pageNum, totalPages);
  }

  return doc.save();
}
