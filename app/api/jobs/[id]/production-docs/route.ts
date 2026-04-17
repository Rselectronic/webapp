import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";
import {
  createPdfDoc,
  drawHeader,
  drawFooter,
  truncate,
  sanitizeForPdf,
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
} from "@/lib/pdf/helpers";

const VALID_TYPES = ["job-card", "traveller", "print-bom", "reception"] as const;
type DocType = (typeof VALID_TYPES)[number];

// Accept underscore aliases too (chat route uses job_card / print_bom)
const TYPE_ALIASES: Record<string, DocType> = {
  "job-card": "job-card",
  job_card: "job-card",
  traveller: "traveller",
  "print-bom": "print-bom",
  print_bom: "print-bom",
  reception: "reception",
  reception_file: "reception",
};

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
  const rawType = req.nextUrl.searchParams.get("type") ?? "";
  const typeParam: DocType | undefined = TYPE_ALIASES[rawType];

  if (!typeParam) {
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
  const customerCode = customer?.code ?? "UNKNOWN";
  const customerName = customer?.company_name ?? "Unknown Customer";
  const gmpNumber = gmp?.gmp_number ?? "—";
  const boardName = gmp?.board_name;

  let procBatchCode: string | null = null;
  let procId: string | null = null;
  const { data: proc } = await supabase
    .from("procurements")
    .select("id, proc_code")
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proc) {
    procBatchCode = proc.proc_code;
    procId = proc.id;
  }

  let pdfBytes: Uint8Array;
  let fileName: string;

  switch (typeParam) {
    case "job-card": {
      // Job Card (landscape) — cover sheet for a procurement batch that
      // lists every job in the batch as one row. If no batch, list only
      // this job. Matches "Job Card.xlsx" template layout.
      type JobRow = {
        poNumber: string;
        productName: string;
        bl: string;
        qty: string;
        bomName: string;
        gerberName: string;
        stencilName: string;
        mCodeSummary: string;
      };

      let batchJobIds: string[] = [id];
      if (procBatchCode) {
        const { data: sameBatch } = await supabase
          .from("procurements")
          .select("job_id")
          .eq("proc_code", procBatchCode);
        const ids = Array.from(
          new Set([id, ...(sameBatch ?? []).map((r) => r.job_id)])
        );
        if (ids.length > 0) batchJobIds = ids;
      }

      const { data: jobsRows } = await supabase
        .from("jobs")
        .select(
          `id, job_number, quantity, assembly_type, po_number,
           customers(code, company_name),
           gmps(gmp_number, board_name),
           boms(id, file_name, revision, component_count)`
        )
        .in("id", batchJobIds);

      async function mCodeSummary(bomId: string | null): Promise<string> {
        if (!bomId) return "—";
        const { data: lines } = await supabase
          .from("bom_lines")
          .select("m_code, quantity")
          .eq("bom_id", bomId);
        if (!lines || lines.length === 0) return "—";
        const totals = new Map<string, number>();
        for (const l of lines) {
          const code = l.m_code ?? "—";
          totals.set(code, (totals.get(code) ?? 0) + (l.quantity ?? 0));
        }
        const order = [
          "CP", "CPEXP", "IP", "0402", "0201", "TH", "MANSMT",
          "MEC", "Accs", "CABLE", "DEV B", "—",
        ];
        const ordered = Array.from(totals.entries()).sort((a, b) => {
          const ia = order.indexOf(a[0]);
          const ib = order.indexOf(b[0]);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        return ordered.map(([k, v]) => `${k}:${v}`).join("   ");
      }

      const rows: JobRow[] = [];
      for (const jr of jobsRows ?? []) {
        const jCust = jr.customers as unknown as {
          code: string;
          company_name: string;
        } | null;
        const jGmp = jr.gmps as unknown as {
          gmp_number: string;
          board_name: string | null;
        } | null;
        const jBom = jr.boms as unknown as {
          id: string;
          file_name: string;
          revision: string;
        } | null;

        const bl = jr.assembly_type ?? "TB";
        const productName = jGmp?.board_name
          ? `${jGmp.gmp_number} — ${jGmp.board_name}`
          : jGmp?.gmp_number ?? jr.job_number;
        const bomName = jBom?.file_name ?? "—";
        // Gerber/Stencil names are not dedicated columns yet; the Excel
        // template leaves these as fill-in slots. Pre-fill Gerber with
        // the GMP number so shop floor can find the folder.
        const gerberName = jGmp?.gmp_number ?? "—";
        const stencilName = ""; // blank fill-in

        rows.push({
          poNumber: jr.po_number ?? "",
          productName,
          bl: `${bl}${jCust?.code ? ` / ${jCust.code}` : ""}`,
          qty: String(jr.quantity ?? ""),
          bomName,
          gerberName,
          stencilName,
          mCodeSummary: await mCodeSummary(jBom?.id ?? null),
        });
      }

      // Primary job first
      const primaryPo = job.po_number ?? "";
      rows.sort((a, b) => {
        if (a.poNumber === primaryPo && b.poNumber !== primaryPo) return -1;
        if (b.poNumber === primaryPo && a.poNumber !== primaryPo) return 1;
        return 0;
      });

      pdfBytes = await generateJobCard({
        procBatchCode: procBatchCode ? sanitizeForPdf(procBatchCode) : null,
        jobNumber: sanitizeForPdf(job.job_number),
        customerName: sanitizeForPdf(customerName),
        customerCode: sanitizeForPdf(customerCode),
        rows: rows.map((r) => ({
          poNumber: sanitizeForPdf(r.poNumber),
          productName: sanitizeForPdf(r.productName),
          bl: sanitizeForPdf(r.bl),
          qty: sanitizeForPdf(r.qty),
          bomName: sanitizeForPdf(r.bomName),
          gerberName: sanitizeForPdf(r.gerberName),
          stencilName: sanitizeForPdf(r.stencilName),
          mCodeSummary: sanitizeForPdf(r.mCodeSummary),
        })),
      });
      fileName = `${job.job_number}-Job-Card.pdf`;
      break;
    }

    case "traveller": {
      pdfBytes = await generateTraveller({
        jobNumber: sanitizeForPdf(job.job_number),
        customerName: sanitizeForPdf(customerName),
        customerCode: sanitizeForPdf(customerCode),
        gmpNumber: sanitizeForPdf(gmpNumber),
        boardName: boardName ? sanitizeForPdf(boardName) : boardName,
        boardQty: job.quantity,
        assemblyType: job.assembly_type ?? "TB",
        poNumber: job.po_number ? sanitizeForPdf(job.po_number) : null,
        procBatchCode: procBatchCode ? sanitizeForPdf(procBatchCode) : null,
        bomName: bom?.file_name ? sanitizeForPdf(bom.file_name) : "",
      });
      fileName = `${job.job_number}-Production-Traveller.pdf`;
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
          "line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, is_pcb, is_dni"
        )
        .eq("bom_id", bom.id)
        .order("line_number", { ascending: true });

      if (bomError) {
        return NextResponse.json(
          { error: "Failed to fetch BOM lines" },
          { status: 500 }
        );
      }

      // Fetch overage so the print BOM can show X-Qty / Order Qty
      // like the Excel BOM TEMPLATE V1 layout.
      const { data: overageRowsPB } = await supabase
        .from("overage_table")
        .select("m_code, qty_threshold, extras")
        .order("m_code")
        .order("qty_threshold", { ascending: true });

      const overageMapPB = new Map<
        string,
        { threshold: number; extras: number }[]
      >();
      for (const row of overageRowsPB ?? []) {
        const existing = overageMapPB.get(row.m_code) ?? [];
        existing.push({ threshold: row.qty_threshold, extras: row.extras });
        overageMapPB.set(row.m_code, existing);
      }
      function getOveragePB(mCode: string | null, qty: number): number {
        if (!mCode) return 0;
        const tiers = overageMapPB.get(mCode);
        if (!tiers) return 0;
        let extras = 0;
        for (const tier of tiers) {
          if (qty >= tier.threshold) extras = tier.extras;
        }
        return extras;
      }

      const boardQtyPB = job.quantity;

      pdfBytes = await generatePrintBom({
        jobNumber: sanitizeForPdf(job.job_number),
        customerName: sanitizeForPdf(customerName),
        customerCode: sanitizeForPdf(customerCode),
        gmpNumber: sanitizeForPdf(gmpNumber),
        boardName: boardName ? sanitizeForPdf(boardName) : boardName,
        quantity: boardQtyPB,
        bomFileName: sanitizeForPdf(bom.file_name),
        bomRevision: sanitizeForPdf(bom.revision),
        poNumber: job.po_number ? sanitizeForPdf(job.po_number) : null,
        procBatchCode: procBatchCode ? sanitizeForPdf(procBatchCode) : null,
        lines: (bomLines ?? []).map((l) => {
          const qtyPerBoard = l.quantity;
          const baseNeeded = qtyPerBoard * boardQtyPB;
          const extras = l.is_pcb ? 0 : getOveragePB(l.m_code, boardQtyPB);
          return {
            lineNumber: l.line_number,
            quantity: qtyPerBoard,
            extras,
            orderQty: baseNeeded + extras,
            referenceDesignator: sanitizeForPdf(l.reference_designator),
            cpc: sanitizeForPdf(l.cpc),
            description: sanitizeForPdf(l.description),
            mpn: sanitizeForPdf(l.mpn),
            manufacturer: sanitizeForPdf(l.manufacturer),
            mCode: l.m_code ? sanitizeForPdf(l.m_code) : null,
            isPcb: l.is_pcb ?? false,
            isDni: l.is_dni ?? false,
          };
        }),
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

      const boardQty = job.quantity;
      let receptionLines: ReceptionLine[] = [];

      // Prefer procurement_lines (real supplier/order data) when a PROC exists
      if (procId) {
        const { data: procLines, error: procLinesError } = await supabase
          .from("procurement_lines")
          .select(
            "id, mpn, description, m_code, qty_needed, qty_extra, qty_ordered, qty_received, supplier, supplier_pn, unit_price, is_bg, order_status, bom_line_id"
          )
          .eq("procurement_id", procId)
          .order("created_at", { ascending: true });

        if (procLinesError) {
          return NextResponse.json(
            { error: "Failed to fetch procurement lines" },
            { status: 500 }
          );
        }

        const bomLineIds = (procLines ?? [])
          .map((l) => l.bom_line_id)
          .filter((x): x is string => Boolean(x));
        const bomLineMap = new Map<
          string,
          { manufacturer: string | null; reference_designator: string | null }
        >();
        if (bomLineIds.length > 0) {
          const { data: bomLinesForProc } = await supabase
            .from("bom_lines")
            .select("id, manufacturer, reference_designator")
            .in("id", bomLineIds);
          for (const bl of bomLinesForProc ?? []) {
            bomLineMap.set(bl.id, {
              manufacturer: bl.manufacturer,
              reference_designator: bl.reference_designator,
            });
          }
        }

        receptionLines = (procLines ?? []).map((l, idx) => {
          const bl = l.bom_line_id ? bomLineMap.get(l.bom_line_id) : undefined;
          const qn = l.qty_needed ?? 0;
          const qe = l.qty_extra ?? 0;
          return {
            lineNumber: idx + 1,
            mpn: l.mpn,
            description: l.description,
            manufacturer: bl?.manufacturer ?? null,
            referenceDesignator: bl?.reference_designator ?? null,
            mCode: l.m_code,
            qtyNeeded: qn,
            qtyExtra: qe,
            totalExpected: qn + qe,
            qtyOrdered: l.qty_ordered ?? 0,
            qtyReceived: l.qty_received ?? 0,
            supplier: l.supplier,
            supplierPn: l.supplier_pn,
            unitPrice: l.unit_price ?? null,
            isBG: l.is_bg ?? false,
            orderStatus: l.order_status,
          };
        });
      } else {
        // Fallback: build lines directly from BOM + overage table
        const { data: bomLines2, error: bomError2 } = await supabase
          .from("bom_lines")
          .select(
            "line_number, quantity, reference_designator, mpn, description, manufacturer, m_code"
          )
          .eq("bom_id", bom.id)
          .order("line_number", { ascending: true });

        if (bomError2) {
          return NextResponse.json(
            { error: "Failed to fetch BOM lines" },
            { status: 500 }
          );
        }

        const { data: overageRows } = await supabase
          .from("overage_table")
          .select("m_code, qty_threshold, extras")
          .order("m_code")
          .order("qty_threshold", { ascending: true });

        const overageMap = new Map<
          string,
          { threshold: number; extras: number }[]
        >();
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

        receptionLines = (bomLines2 ?? []).map((l) => {
          const qtyNeeded = l.quantity * boardQty;
          const qtyExtra = getOverage(l.m_code, boardQty);
          return {
            lineNumber: l.line_number,
            mpn: l.mpn,
            description: l.description,
            manufacturer: l.manufacturer,
            referenceDesignator: l.reference_designator,
            mCode: l.m_code,
            qtyNeeded,
            qtyExtra,
            totalExpected: qtyNeeded + qtyExtra,
            qtyOrdered: 0,
            qtyReceived: 0,
            supplier: null,
            supplierPn: null,
            unitPrice: null,
            isBG: false,
            orderStatus: null,
          };
        });
      }

      // Sanitize all string fields for WinAnsi encoding (BOM descriptions
      // often contain Greek letters like Ω, μ that crash standard PDF fonts).
      const sanitizedReceptionLines = receptionLines.map((l) => ({
        ...l,
        mpn: l.mpn ? sanitizeForPdf(l.mpn) : null,
        description: l.description ? sanitizeForPdf(l.description) : null,
        manufacturer: l.manufacturer ? sanitizeForPdf(l.manufacturer) : null,
        referenceDesignator: l.referenceDesignator
          ? sanitizeForPdf(l.referenceDesignator)
          : l.referenceDesignator,
        mCode: l.mCode ? sanitizeForPdf(l.mCode) : null,
        supplier: l.supplier ? sanitizeForPdf(l.supplier) : l.supplier,
        supplierPn: l.supplierPn ? sanitizeForPdf(l.supplierPn) : l.supplierPn,
      }));

      pdfBytes = await generateReception({
        jobNumber: sanitizeForPdf(job.job_number),
        customerName: sanitizeForPdf(customerName),
        customerCode: sanitizeForPdf(customerCode),
        gmpNumber: sanitizeForPdf(gmpNumber),
        boardName: boardName ? sanitizeForPdf(boardName) : boardName,
        quantity: job.quantity,
        procBatchCode: procBatchCode ? sanitizeForPdf(procBatchCode) : null,
        poNumber: job.po_number ? sanitizeForPdf(job.po_number) : null,
        lines: sanitizedReceptionLines,
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
// Job Card (landscape) — matches Job Card.xlsx template
// Title "JOB CARD", proc batch code subtitle, and a table with columns:
// PO # | Product Name | BL | Qty | BOM Name | Gerber Name | Stencil Name |
// MCODE Summary — one row per job in the procurement batch.
// ---------------------------------------------------------------------------

interface JobCardRow {
  poNumber: string;
  productName: string;
  bl: string;
  qty: string;
  bomName: string;
  gerberName: string;
  stencilName: string;
  mCodeSummary: string;
}

interface JobCardParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  procBatchCode: string | null;
  rows: JobCardRow[];
}

async function generateJobCard(p: JobCardParams): Promise<Uint8Array> {
  const { doc, fonts, logo } = await createPdfDoc();
  // Landscape A4
  const PAGE_W = A4_HEIGHT; // 841.89
  const PAGE_H = A4_WIDTH;  // 595.28
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const today = new Date().toLocaleDateString("en-CA");

  const M = MARGIN;
  const contentW = PAGE_W - M * 2;

  // Company header (smaller so title block dominates like the Excel)
  let y = PAGE_H - M;
  let textStartX = M;
  if (logo) {
    const logoH = 28;
    const scale = logoH / logo.height;
    const logoW = logo.width * scale;
    page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
    textStartX = M + logoW + 6;
  }
  page.drawText("R.S. ELECTRONIQUE INC.", {
    x: textStartX, y, size: 10, font: fonts.bold, color: COLOR_DARK,
  });
  page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9  |  +1 (438) 833-8477  |  www.rspcbassembly.com", {
    x: textStartX, y: y - 12, size: 7, font: fonts.regular, color: COLOR_MUTED,
  });

  const printDate = `Printed: ${today}  |  Ref: ${p.jobNumber}  |  ${p.customerCode} — ${p.customerName}`;
  const pdW = fonts.regular.widthOfTextAtSize(printDate, 7);
  page.drawText(printDate, {
    x: PAGE_W - M - pdW, y: y - 12, size: 7, font: fonts.regular, color: COLOR_MUTED,
  });

  y -= 22;

  // Big "JOB CARD" title banner (merged B3:I4 in template)
  const titleH = 40;
  page.drawRectangle({
    x: M, y: y - titleH, width: contentW, height: titleH,
    color: COLOR_DARK,
  });
  const title = "JOB CARD";
  const titleW = fonts.bold.widthOfTextAtSize(title, 26);
  page.drawText(title, {
    x: M + (contentW - titleW) / 2,
    y: y - 28,
    size: 26,
    font: fonts.bold,
    color: COLOR_WHITE,
  });
  y -= titleH;

  // Proc Batch Code subtitle (merged B5:I5 in template)
  const subtitleH = 26;
  page.drawRectangle({
    x: M, y: y - subtitleH, width: contentW, height: subtitleH,
    borderColor: COLOR_DARK, borderWidth: 1,
  });
  const subtitle = p.procBatchCode ?? "<Proc Batch Code>";
  const subW = fonts.bold.widthOfTextAtSize(subtitle, 16);
  page.drawText(subtitle, {
    x: M + (contentW - subW) / 2,
    y: y - 18,
    size: 16,
    font: fonts.bold,
    color: COLOR_DARK,
  });
  y -= subtitleH + 14;

  // Table header — columns match the Excel template exactly
  // Widths chosen to fit landscape A4 content area.
  const col = {
    po:      { x: M,             w: 78 },
    product: { x: M + 78,        w: 150 },
    bl:      { x: M + 228,       w: 52 },
    qty:     { x: M + 280,       w: 40 },
    bom:     { x: M + 320,       w: 120 },
    gerber:  { x: M + 440,       w: 110 },
    stencil: { x: M + 550,       w: 80 },
    mcode:   { x: M + 630,       w: contentW - 630 },
  };

  const headerH = 22;
  page.drawRectangle({
    x: M, y: y - headerH, width: contentW, height: headerH,
    color: COLOR_DARK,
  });
  const headers: [string, { x: number; w: number }, "left" | "center"][] = [
    ["PO #",          col.po,      "center"],
    ["Product Name",  col.product, "left"],
    ["BL",            col.bl,      "center"],
    ["Qty",           col.qty,     "center"],
    ["BOM Name",      col.bom,     "left"],
    ["Gerber Name",   col.gerber,  "left"],
    ["Stencil Name",  col.stencil, "left"],
    ["MCODE Summary", col.mcode,   "left"],
  ];
  for (const [label, c, align] of headers) {
    const w = fonts.bold.widthOfTextAtSize(label, 9);
    const tx =
      align === "center" ? c.x + (c.w - w) / 2 : c.x + 6;
    page.drawText(label, {
      x: tx,
      y: y - 15,
      size: 9,
      font: fonts.bold,
      color: COLOR_WHITE,
    });
  }

  // Vertical column separators in header
  const colXs = [col.product.x, col.bl.x, col.qty.x, col.bom.x, col.gerber.x, col.stencil.x, col.mcode.x];
  for (const x of colXs) {
    page.drawLine({
      start: { x, y: y - headerH },
      end: { x, y: y },
      thickness: 0.5,
      color: COLOR_LIGHT,
    });
  }

  y -= headerH;

  // Data rows — 30pt row height to match Excel; ensure always at least
  // 18 rows so the printed sheet looks like the template even when the
  // batch has few jobs.
  const rowH = 30;
  const minRows = 18;
  const totalRows = Math.max(minRows, p.rows.length);
  const tableTopY = y;
  const tableBottomY = y - totalRows * rowH;

  // Outer border for full table body
  page.drawRectangle({
    x: M,
    y: tableBottomY,
    width: contentW,
    height: totalRows * rowH,
    borderColor: COLOR_DARK,
    borderWidth: 1,
  });

  // Vertical grid lines across body
  for (const x of colXs) {
    page.drawLine({
      start: { x, y: tableTopY },
      end: { x, y: tableBottomY },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
  }

  for (let i = 0; i < totalRows; i++) {
    const rowY = tableTopY - (i + 1) * rowH;
    // Horizontal divider
    if (i < totalRows - 1) {
      page.drawLine({
        start: { x: M, y: rowY },
        end: { x: M + contentW, y: rowY },
        thickness: 0.5,
        color: COLOR_BORDER,
      });
    }

    const row = p.rows[i];
    if (!row) continue;

    const tY = rowY + 11;
    const sz = 9;

    // PO #
    const poT = truncate(row.poNumber, col.po.w - 8, fonts.regular, sz);
    const poW = fonts.regular.widthOfTextAtSize(poT, sz);
    page.drawText(poT, {
      x: col.po.x + (col.po.w - poW) / 2, y: tY, size: sz,
      font: fonts.regular, color: COLOR_DARK,
    });

    // Product Name
    page.drawText(
      truncate(row.productName, col.product.w - 10, fonts.regular, sz),
      { x: col.product.x + 6, y: tY, size: sz, font: fonts.regular, color: COLOR_DARK }
    );

    // BL
    const blT = truncate(row.bl, col.bl.w - 6, fonts.bold, sz);
    const blW = fonts.bold.widthOfTextAtSize(blT, sz);
    page.drawText(blT, {
      x: col.bl.x + (col.bl.w - blW) / 2, y: tY, size: sz,
      font: fonts.bold, color: COLOR_DARK,
    });

    // Qty
    const qtyW = fonts.bold.widthOfTextAtSize(row.qty, sz);
    page.drawText(row.qty, {
      x: col.qty.x + (col.qty.w - qtyW) / 2, y: tY, size: sz,
      font: fonts.bold, color: COLOR_DARK,
    });

    // BOM Name
    page.drawText(
      truncate(row.bomName, col.bom.w - 10, fonts.regular, sz - 1),
      { x: col.bom.x + 6, y: tY, size: sz - 1, font: fonts.regular, color: COLOR_TEXT }
    );

    // Gerber Name
    page.drawText(
      truncate(row.gerberName, col.gerber.w - 10, fonts.regular, sz - 1),
      { x: col.gerber.x + 6, y: tY, size: sz - 1, font: fonts.regular, color: COLOR_TEXT }
    );

    // Stencil Name (fill-in)
    if (row.stencilName) {
      page.drawText(
        truncate(row.stencilName, col.stencil.w - 10, fonts.regular, sz - 1),
        { x: col.stencil.x + 6, y: tY, size: sz - 1, font: fonts.regular, color: COLOR_TEXT }
      );
    }

    // MCODE Summary
    page.drawText(
      truncate(row.mCodeSummary, col.mcode.w - 10, fonts.regular, sz - 1),
      { x: col.mcode.x + 6, y: tY, size: sz - 1, font: fonts.regular, color: COLOR_DARK }
    );
  }

  // Footer
  const fy = 24;
  page.drawLine({
    start: { x: M, y: fy + 10 },
    end: { x: PAGE_W - M, y: fy + 10 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  page.drawText("R.S. Electronique Inc.", {
    x: M, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT,
  });
  const centerText = `${p.procBatchCode ?? p.jobNumber} — Job Card`;
  const cw = fonts.regular.widthOfTextAtSize(centerText, 7);
  page.drawText(centerText, {
    x: (PAGE_W - cw) / 2, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT,
  });
  const right = `${p.rows.length} job${p.rows.length === 1 ? "" : "s"} in batch`;
  const rw = fonts.regular.widthOfTextAtSize(right, 7);
  page.drawText(right, {
    x: PAGE_W - M - rw, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT,
  });

  return doc.save();
}

// ---------------------------------------------------------------------------
// Production Traveller (portrait) — matches Production_Traveller V1.xlsx
// Multi-section checklist. Each step row has Name + Date fill-in slots on
// the right. Certain steps have Pass/Fail or Yes/No checkboxes.
// Sections are taken directly from the Excel template.
// ---------------------------------------------------------------------------

interface TravellerParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  boardQty: number;
  assemblyType: string;
  poNumber: string | null;
  procBatchCode: string | null;
  bomName: string;
}

// Step kinds determine which right-side inputs get drawn
type StepKind = "name_date" | "pass_fail" | "yes_no" | "header";

interface TravStep {
  label: string;
  kind?: StepKind; // default name_date
}

interface TravSection {
  title: string;
  steps: TravStep[];
}

const TRAVELLER_SECTIONS: TravSection[] = [
  {
    title: "Reception Folder Setup (reception file, BOMS)",
    steps: [
      { label: "Program (check revisions)" },
      { label: "Separating Parts" },
      { label: "View report" },
      { label: "If incomplete state the problem and go see manager", kind: "pass_fail" },
    ],
  },
  {
    title: "Printing",
    steps: [
      { label: "Double check special parts in tape orientation" },
      { label: "CP Feeder Setup" },
      { label: "Double Check program" },
    ],
  },
  {
    title: "Supports",
    steps: [
      { label: "Check boards (correct qty and condition)" },
      { label: "Magazines" },
      { label: "Solder Paste check" },
      { label: "Final board Count" },
      { label: "Double side support check with superior" },
    ],
  },
  {
    title: "CP",
    steps: [
      { label: "Setup check (feeder alignment)" },
      { label: "First Article Inspection by Operator", kind: "pass_fail" },
      { label: "First Article Inspection by Superior", kind: "pass_fail" },
      { label: "Final board Count" },
    ],
  },
  {
    title: "If Fail",
    steps: [
      { label: "Second Article Inspection by Superior", kind: "pass_fail" },
    ],
  },
  {
    title: "IP",
    steps: [
      { label: "Setup check (PITCH, NOZZLES)" },
      { label: "First Article Inspection by Technician", kind: "pass_fail" },
      { label: "First Article Inspection by Superior", kind: "pass_fail" },
      { label: "Final board Count" },
    ],
  },
  {
    title: "If Fail",
    steps: [
      { label: "Second Article Inspection by Superior", kind: "pass_fail" },
    ],
  },
  {
    title: "Manual Parts",
    steps: [
      { label: "Complimentary Check on alignment of SMT" },
      { label: "First Article Inspection by Operator", kind: "pass_fail" },
      { label: "First Article Inspection by Superior", kind: "pass_fail" },
      { label: "Final board Count" },
    ],
  },
  {
    title: "Final Check before Reflow",
    steps: [
      { label: "Oven" },
      { label: "Profile" },
      { label: "Speed" },
      { label: "Conveyor if needed" },
      { label: "Conveyor check by superior" },
      { label: "FULL SMT Inspection" },
      { label: "Xray if needed" },
      { label: "Mecanical", kind: "yes_no" },
      { label: "TH Setup (View Report of TH only)", kind: "yes_no" },
      { label: "Final Inspection" },
      { label: "Packing" },
    ],
  },
];

async function generateTraveller(p: TravellerParams): Promise<Uint8Array> {
  const { doc, fonts, logo } = await createPdfDoc();

  // We'll paginate as we go — keep a running y and start a new page when
  // the next section wouldn't fit.

  // Helpers -----------------------------------------------------------------
  const M = MARGIN;
  const contentW = CONTENT_WIDTH;
  // Column geometry
  const leftColEnd = M + contentW * 0.58; // text
  const nameColX = leftColEnd + 6;
  const nameColW = 90;
  const dateColX = nameColX + nameColW + 6;
  const dateColW = 80;

  const SECTION_HEADER_H = 18;
  const STEP_ROW_H = 18;
  const SECTION_GAP = 6;
  const FOOTER_H = 36;
  const MIN_Y = FOOTER_H + 20;

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let pageNum = 1;

  function drawPageTop(): number {
    const today = new Date().toLocaleDateString("en-CA");
    const y0 = drawHeader(page, fonts, "PRODUCTION TRAVELLER", [
      p.jobNumber,
      `Printed: ${today}`,
    ], logo);
    return y0;
  }

  function drawInfoBlock(y: number): number {
    // Info block — matches top area of Excel (rows 6-12)
    const rows: [string, string][] = [
      ["CUSTOMER NAME", `${p.customerCode} — ${p.customerName}`],
      ["PO", p.poNumber ?? ""],
      ["(GMP) BOARD NAME", `${p.gmpNumber}${p.boardName ? ` — ${p.boardName}` : ""}`],
      ["PROC NAME", p.procBatchCode ?? ""],
      ["BOM NAME", p.bomName],
      ["PCB NAME", ""],
      ["Solder Type", ""],
      ["IPC Class", ""],
      ["QTY to build", String(p.boardQty)],
      ["Stencil Name", ""],
      ["Assembly Type", `${p.assemblyType} — ${ASSEMBLY_TYPE_LABELS[p.assemblyType] ?? p.assemblyType}`],
    ];

    const blockH = rows.length * 14 + 10;
    page.drawRectangle({
      x: M, y: y - blockH, width: contentW, height: blockH,
      borderColor: COLOR_DARK, borderWidth: 1,
    });

    // Label column divider
    const labelW = 150;
    page.drawLine({
      start: { x: M + labelW, y },
      end: { x: M + labelW, y: y - blockH },
      thickness: 0.5, color: COLOR_BORDER,
    });

    let ry = y - 14;
    for (const [label, value] of rows) {
      page.drawText(label, {
        x: M + 8, y: ry, size: 8, font: fonts.bold, color: COLOR_MUTED,
      });
      page.drawText(value || "—", {
        x: M + labelW + 8, y: ry, size: 9, font: fonts.regular, color: COLOR_DARK,
      });
      ry -= 14;
    }
    return y - blockH - 10;
  }

  function drawStepRow(y: number, label: string, kind: StepKind): number {
    const rowY = y - STEP_ROW_H;

    // Light bottom divider
    page.drawLine({
      start: { x: M, y: rowY },
      end: { x: M + contentW, y: rowY },
      thickness: 0.3, color: COLOR_BORDER,
    });

    // Empty square/checkbox at start of row (like the Excel bullet)
    const bulletSize = 9;
    page.drawRectangle({
      x: M + 6, y: rowY + 4, width: bulletSize, height: bulletSize,
      borderColor: COLOR_LIGHT, borderWidth: 0.8,
    });

    // Label
    page.drawText(truncate(label, leftColEnd - (M + 22), fonts.regular, 9), {
      x: M + 22,
      y: rowY + 5,
      size: 9,
      font: fonts.regular,
      color: COLOR_DARK,
    });

    if (kind === "pass_fail" || kind === "yes_no") {
      // Two checkbox pairs above the Name/Date slots
      const [aLabel, bLabel] =
        kind === "pass_fail" ? ["Pass", "Fail"] : ["Yes", "No"];
      const cbSize = 9;
      const pairStart = leftColEnd - 120;
      // Pass/Yes
      page.drawRectangle({
        x: pairStart, y: rowY + 4, width: cbSize, height: cbSize,
        borderColor: COLOR_DARK, borderWidth: 0.8,
      });
      page.drawText(aLabel, {
        x: pairStart + cbSize + 3, y: rowY + 5, size: 8,
        font: fonts.regular, color: COLOR_DARK,
      });
      // Fail/No
      const bStart = pairStart + 48;
      page.drawRectangle({
        x: bStart, y: rowY + 4, width: cbSize, height: cbSize,
        borderColor: COLOR_DARK, borderWidth: 0.8,
      });
      page.drawText(bLabel, {
        x: bStart + cbSize + 3, y: rowY + 5, size: 8,
        font: fonts.regular, color: COLOR_DARK,
      });
    }

    // Name slot
    page.drawLine({
      start: { x: nameColX, y: rowY + 3 },
      end: { x: nameColX + nameColW, y: rowY + 3 },
      thickness: 0.5, color: COLOR_LIGHT,
    });
    // Date slot
    page.drawLine({
      start: { x: dateColX, y: rowY + 3 },
      end: { x: dateColX + dateColW, y: rowY + 3 },
      thickness: 0.5, color: COLOR_LIGHT,
    });

    return rowY;
  }

  function drawSectionHeader(y: number, title: string): number {
    const rowY = y - SECTION_HEADER_H;
    page.drawRectangle({
      x: M, y: rowY, width: contentW, height: SECTION_HEADER_H,
      color: COLOR_DARK,
    });
    page.drawText(title.toUpperCase(), {
      x: M + 8, y: rowY + 5, size: 10, font: fonts.bold, color: COLOR_WHITE,
    });
    // Name / Date sub-labels
    page.drawText("NAME", {
      x: nameColX, y: rowY + 5, size: 7, font: fonts.bold, color: COLOR_WHITE,
    });
    page.drawText("DATE", {
      x: dateColX, y: rowY + 5, size: 7, font: fonts.bold, color: COLOR_WHITE,
    });
    return rowY;
  }

  function drawPageFooter(pn: number, total: number) {
    drawFooter(
      page,
      fonts,
      "R.S. Electronique Inc.",
      `${p.jobNumber} — Production Traveller V1.0`,
      pn,
      total
    );
  }

  // Layout -----------------------------------------------------------------
  let y = drawPageTop();
  y = drawInfoBlock(y);

  // Free-text notes box (rows 20-24 in template): "If incomplete state
  // the problem and go see manager."
  const notesBoxH = 55;
  page.drawRectangle({
    x: M, y: y - notesBoxH, width: contentW, height: notesBoxH,
    borderColor: COLOR_DARK, borderWidth: 1,
  });
  page.drawText("NOTES / ISSUES (if incomplete state the problem and go see manager)", {
    x: M + 8, y: y - 12, size: 8, font: fonts.bold, color: COLOR_MUTED,
  });
  y -= notesBoxH + 10;

  // Track an estimate so we know when to break to new page
  function estimateSectionHeight(s: TravSection): number {
    return SECTION_HEADER_H + s.steps.length * STEP_ROW_H + SECTION_GAP;
  }

  // Precompute total pages for footer by doing a dry layout pass
  function dryLayoutTotalPages(startY: number, remainingBudget: number): number {
    let pages = 1;
    let budget = remainingBudget;
    for (const section of TRAVELLER_SECTIONS) {
      const needed = estimateSectionHeight(section);
      if (budget - needed < MIN_Y - startY + startY) {
        // insufficient — use budget compare
      }
      if (budget < needed) {
        pages += 1;
        budget = A4_HEIGHT - MARGIN - 60; // approx usable on a bare page
      }
      budget -= needed;
    }
    return pages;
  }

  const totalPages = dryLayoutTotalPages(y, y - MIN_Y);
  drawPageFooter(pageNum, totalPages);

  for (const section of TRAVELLER_SECTIONS) {
    const needed = estimateSectionHeight(section);
    if (y - needed < MIN_Y) {
      // New page
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      pageNum += 1;
      y = drawPageTop();
      drawPageFooter(pageNum, totalPages);
    }
    y = drawSectionHeader(y, section.title);
    for (const step of section.steps) {
      y = drawStepRow(y, step.label, step.kind ?? "name_date");
    }
    y -= SECTION_GAP;
  }

  return doc.save();
}

// ---------------------------------------------------------------------------
// Print BOM
// ---------------------------------------------------------------------------

interface BomLine {
  lineNumber: number;
  quantity: number;
  extras: number;
  orderQty: number;
  referenceDesignator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  mCode: string | null;
  isPcb: boolean;
  isDni: boolean;
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
  poNumber: string | null;
  procBatchCode: string | null;
  lines: BomLine[];
}

async function generatePrintBom(p: PrintBomParams): Promise<Uint8Array> {
  const { doc, fonts, logo } = await createPdfDoc();
  const today = new Date().toLocaleDateString("en-CA");

  // Landscape A4 (wide table, matches BOM TEMPLATE V1).
  const PAGE_W = A4_HEIGHT; // 841.89
  const PAGE_H = A4_WIDTH;  // 595.28
  const M = 28;
  const CW = PAGE_W - M * 2;

  // Sort matches CP IP BOM Rule 9 — PCB pinned top, DNI bottom,
  // otherwise qty desc then line# asc.
  const sorted = [...p.lines].sort((a, b) => {
    if (a.isPcb && !b.isPcb) return -1;
    if (!a.isPcb && b.isPcb) return 1;
    if (a.isDni && !b.isDni) return 1;
    if (!a.isDni && b.isDni) return -1;
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return a.lineNumber - b.lineNumber;
  });

  // Column layout mirrors BOM TEMPLATE V1 row-3 order:
  //   Serial | X-Qty | Order Qty | Qty | R Des. | CPC # | Description | MPN | Mfr | M-Code
  const C = {
    num:   { x: 0, w: 28 },
    xqty:  { x: 0, w: 38 },
    ordq:  { x: 0, w: 48 },
    qty:   { x: 0, w: 32 },
    ref:   { x: 0, w: 116 },
    cpc:   { x: 0, w: 80 },
    desc:  { x: 0, w: 176 },
    mpn:   { x: 0, w: 108 },
    mfr:   { x: 0, w: 96 },
    mCode: { x: 0, w: 63 },
  };
  {
    let cx = M;
    for (const k of Object.keys(C) as (keyof typeof C)[]) {
      C[k].x = cx;
      cx += C[k].w;
    }
  }

  const rowH = 13;
  const topHeaderH = 74;
  const tableHeaderH = 18;
  const footerAreaH = 28;
  const dataTopY = PAGE_H - M - topHeaderH - tableHeaderH;
  const rowsPerPage = Math.max(1, Math.floor((dataTopY - footerAreaH) / rowH));
  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));

  const tableCols = [
    { key: "num",   label: "Serial",      align: "center" as const },
    { key: "xqty",  label: "X-Qty",       align: "center" as const },
    { key: "ordq",  label: "Order Qty",   align: "center" as const },
    { key: "qty",   label: "Qty",         align: "center" as const },
    { key: "ref",   label: "R Des.",      align: "left"   as const },
    { key: "cpc",   label: "CPC #",       align: "left"   as const },
    { key: "desc",  label: "Description", align: "left"   as const },
    { key: "mpn",   label: "MPN",         align: "left"   as const },
    { key: "mfr",   label: "Mfr",         align: "left"   as const },
    { key: "mCode", label: "M-Code",      align: "center" as const },
  ] as const;

  // Aggregates (exclude PCB and DNI)
  const mCodeCounts = new Map<string, number>();
  let totalPlacements = 0;
  let dniCount = 0;
  let unclassified = 0;
  for (const l of p.lines) {
    if (l.isPcb) continue;
    if (l.isDni) {
      dniCount++;
      continue;
    }
    const key = l.mCode ?? "—";
    mCodeCounts.set(key, (mCodeCounts.get(key) ?? 0) + l.quantity);
    totalPlacements += l.quantity;
    if (!l.mCode) unclassified++;
  }

  const COLOR_PCB_BG = rgb(254 / 255, 243 / 255, 199 / 255); // amber-100
  const COLOR_DNI_BG = rgb(254 / 255, 226 / 255, 226 / 255); // red-100
  const COLOR_WARN = rgb(180 / 255, 83 / 255, 9 / 255);
  const COLOR_DNI_TXT = rgb(185 / 255, 28 / 255, 28 / 255);

  function drawPageChrome(page: PDFPage, pageNum: number) {
    let y = PAGE_H - M;
    let textX = M;
    if (logo) {
      const logoH = 34;
      const scale = logoH / logo.height;
      const logoW = logo.width * scale;
      page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
      textX = M + logoW + 8;
    }
    page.drawText("R.S. ELECTRONIQUE INC.", { x: textX, y, size: 12, font: fonts.bold, color: COLOR_DARK });
    y -= 11;
    page.drawText("5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9", { x: textX, y, size: 7, font: fonts.regular, color: COLOR_MUTED });
    y -= 9;
    page.drawText("+1 (438) 833-8477 | info@rspcbassembly.com", { x: textX, y, size: 7, font: fonts.regular, color: COLOR_MUTED });

    const titleText = "PRINT COPY BOM";
    const tw = fonts.bold.widthOfTextAtSize(titleText, 18);
    page.drawText(titleText, { x: PAGE_W - M - tw, y: PAGE_H - M, size: 18, font: fonts.bold, color: COLOR_DARK });
    const jw = fonts.bold.widthOfTextAtSize(p.jobNumber, 11);
    page.drawText(p.jobNumber, { x: PAGE_W - M - jw, y: PAGE_H - M - 19, size: 11, font: fonts.bold, color: COLOR_DARK });
    const printLine = `Printed: ${today}`;
    const pw = fonts.regular.widthOfTextAtSize(printLine, 8);
    page.drawText(printLine, { x: PAGE_W - M - pw, y: PAGE_H - M - 32, size: 8, font: fonts.regular, color: COLOR_MUTED });

    const sepY = PAGE_H - M - 43;
    page.drawLine({ start: { x: M, y: sepY }, end: { x: PAGE_W - M, y: sepY }, thickness: 2, color: COLOR_DARK });

    const boxY = sepY - 28;
    const boxH = 26;
    page.drawRectangle({ x: M, y: boxY, width: CW, height: boxH, color: COLOR_BG_STRIP });
    page.drawRectangle({ x: M, y: boxY, width: CW, height: boxH, borderColor: COLOR_BORDER, borderWidth: 0.5 });

    const fields: { label: string; value: string }[] = [
      { label: "CUSTOMER", value: `${p.customerCode} — ${p.customerName}` },
      { label: "GMP #",    value: `${p.gmpNumber}${p.boardName ? " — " + p.boardName : ""}` },
      { label: "BOARDS",   value: String(p.quantity) },
      { label: "PO #",     value: p.poNumber ?? "—" },
      { label: "PROC",     value: p.procBatchCode ?? "—" },
      { label: "BOM",      value: `${p.bomFileName} Rev ${p.bomRevision}` },
    ];
    const colW = CW / 3;
    const labelSize = 6;
    const valueSize = 8;
    for (let i = 0; i < fields.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = M + col * colW + 6;
      const cy = boxY + boxH - 9 - row * 12;
      page.drawText(fields[i].label, { x: cx, y: cy, size: labelSize, font: fonts.bold, color: COLOR_LIGHT });
      const labelW = fonts.bold.widthOfTextAtSize(fields[i].label, labelSize);
      page.drawText(
        truncate(fields[i].value, colW - labelW - 14, fonts.regular, valueSize),
        { x: cx + labelW + 4, y: cy, size: valueSize, font: fonts.regular, color: COLOR_DARK }
      );
    }

    const thTop = boxY - 4;
    const thBottom = thTop - tableHeaderH;
    page.drawRectangle({ x: M, y: thBottom, width: CW, height: tableHeaderH, color: COLOR_DARK });
    for (const col of tableCols) {
      const spec = C[col.key];
      const tW = fonts.bold.widthOfTextAtSize(col.label, 8);
      const tx =
        col.align === "center"
          ? spec.x + (spec.w - tW) / 2
          : spec.x + 4;
      page.drawText(col.label, { x: tx, y: thBottom + 6, size: 8, font: fonts.bold, color: COLOR_WHITE });
    }
    for (let i = 1; i < tableCols.length; i++) {
      const spec = C[tableCols[i].key];
      page.drawLine({
        start: { x: spec.x, y: thTop },
        end:   { x: spec.x, y: thBottom },
        thickness: 0.5, color: rgb(1, 1, 1),
      });
    }

    const fy = 14;
    page.drawLine({ start: { x: M, y: fy + 10 }, end: { x: PAGE_W - M, y: fy + 10 }, thickness: 0.5, color: COLOR_BORDER });
    page.drawText("R.S. Electronique Inc. — Shop Floor Print Copy BOM", { x: M, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT });
    const centerT = `${p.jobNumber} | ${p.customerCode} | ${p.gmpNumber}`;
    const cW2 = fonts.regular.widthOfTextAtSize(centerT, 7);
    page.drawText(centerT, { x: (PAGE_W - cW2) / 2, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT });
    const right = `Page ${pageNum} of ${totalPages}`;
    const rW = fonts.regular.widthOfTextAtSize(right, 7);
    page.drawText(right, { x: PAGE_W - M - rW, y: fy, size: 7, font: fonts.regular, color: COLOR_LIGHT });
  }

  function cellText(
    page: PDFPage,
    key: keyof typeof C,
    text: string,
    textY: number,
    align: "left" | "center" | "right",
    font: PDFFont,
    color = COLOR_TEXT
  ) {
    const sz = 7;
    const spec = C[key];
    const t = truncate(text, spec.w - 6, font, sz);
    const tW = font.widthOfTextAtSize(t, sz);
    let tx = spec.x + 3;
    if (align === "center") tx = spec.x + (spec.w - tW) / 2;
    else if (align === "right") tx = spec.x + spec.w - tW - 3;
    page.drawText(t, { x: tx, y: textY, size: sz, font, color });
  }

  let lineIdx = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawPageChrome(page, pageNum);

    let y = dataTopY;

    while (lineIdx < sorted.length) {
      if (y - rowH < footerAreaH) break;
      const line = sorted[lineIdx];
      const rowY = y - rowH;

      if (line.isPcb) {
        page.drawRectangle({ x: M, y: rowY, width: CW, height: rowH, color: COLOR_PCB_BG });
      } else if (line.isDni) {
        page.drawRectangle({ x: M, y: rowY, width: CW, height: rowH, color: COLOR_DNI_BG });
      } else if (lineIdx % 2 === 1) {
        page.drawRectangle({ x: M, y: rowY, width: CW, height: rowH, color: COLOR_BG_ALT });
      }

      const textY = rowY + 4;

      cellText(page, "num", String(line.lineNumber), textY, "center", fonts.regular, COLOR_MUTED);
      cellText(
        page, "xqty",
        line.isPcb || line.isDni ? "—" : String(line.extras),
        textY, "center", fonts.regular
      );
      cellText(
        page, "ordq",
        line.isDni ? "0" : String(line.orderQty),
        textY, "center", fonts.bold, COLOR_DARK
      );
      cellText(page, "qty", String(line.quantity), textY, "center", fonts.bold, COLOR_DARK);
      cellText(page, "ref", line.referenceDesignator ?? "", textY, "left", fonts.regular);
      cellText(page, "cpc", line.cpc ?? "", textY, "left", fonts.regular);
      cellText(page, "desc", line.description ?? "", textY, "left", fonts.regular);
      cellText(page, "mpn", line.mpn ?? "", textY, "left", fonts.regular);
      cellText(page, "mfr", line.manufacturer ?? "", textY, "left", fonts.regular);

      const mCodeLabel = line.isPcb
        ? "PCB"
        : line.isDni
        ? "DNI"
        : line.mCode ?? "—";
      const mCodeColor = line.isPcb
        ? COLOR_WARN
        : line.isDni
        ? COLOR_DNI_TXT
        : line.mCode
        ? COLOR_DARK
        : COLOR_WARN;
      cellText(page, "mCode", mCodeLabel, textY, "center", fonts.bold, mCodeColor);

      page.drawLine({
        start: { x: M, y: rowY }, end: { x: PAGE_W - M, y: rowY },
        thickness: 0.3, color: COLOR_BORDER,
      });
      for (let i = 1; i < tableCols.length; i++) {
        const spec = C[tableCols[i].key];
        page.drawLine({
          start: { x: spec.x, y: rowY },
          end:   { x: spec.x, y: rowY + rowH },
          thickness: 0.3, color: COLOR_BORDER,
        });
      }

      y = rowY;
      lineIdx++;
    }

    const tableBottom = Math.max(y, footerAreaH);
    page.drawRectangle({
      x: M, y: tableBottom, width: CW, height: dataTopY - tableBottom,
      borderColor: COLOR_BORDER, borderWidth: 0.5,
    });

    if (pageNum === totalPages && lineIdx >= sorted.length) {
      let ty = tableBottom - 10;
      if (ty > footerAreaH) {
        page.drawText("BOM SUMMARY", { x: M, y: ty, size: 8, font: fonts.bold, color: COLOR_DARK });
        ty -= 10;
        const summaryLine =
          `Total lines: ${p.lines.length}   |   ` +
          `Placements/board: ${totalPlacements}   |   ` +
          `Placements total: ${totalPlacements * p.quantity}` +
          (dniCount ? `   |   DNI: ${dniCount}` : "") +
          (unclassified ? `   |   Unclassified: ${unclassified}` : "");
        if (ty > footerAreaH) {
          page.drawText(
            truncate(summaryLine, CW, fonts.regular, 7),
            { x: M, y: ty, size: 7, font: fonts.regular, color: COLOR_MUTED }
          );
        }
        const codes = [...mCodeCounts.entries()].sort((a, b) => b[1] - a[1]);
        if (codes.length) {
          ty -= 10;
          if (ty > footerAreaH) {
            const parts = codes.map(([c, n]) => `${c}: ${n}`).join("   ");
            page.drawText(
              truncate(`By M-Code:  ${parts}`, CW, fonts.regular, 7),
              { x: M, y: ty, size: 7, font: fonts.regular, color: COLOR_MUTED }
            );
          }
        }
      }
    }
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
  referenceDesignator?: string | null;
  mCode: string | null;
  qtyNeeded: number;
  qtyExtra: number;
  totalExpected: number;
  qtyOrdered?: number;
  qtyReceived?: number;
  supplier?: string | null;
  supplierPn?: string | null;
  unitPrice?: number | null;
  isBG?: boolean;
  orderStatus?: string | null;
}

interface ReceptionParams {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  procBatchCode: string | null;
  poNumber?: string | null;
  lines: ReceptionLine[];
}

// Landscape A4 page dimensions for Reception File
const LAND_WIDTH = A4_HEIGHT; // 841.89
const LAND_HEIGHT = A4_WIDTH; // 595.28
const LAND_MARGIN = 24;

async function generateReception(p: ReceptionParams): Promise<Uint8Array> {
  const { doc, fonts, logo } = await createPdfDoc();
  const today = new Date().toLocaleDateString("en-CA");

  // Column layout mirrors PROC TEMPLATE V25 "Proc" sheet receiving columns
  const COL_SPECS: {
    key: string;
    label: string;
    w: number;
    align: "left" | "center" | "right";
  }[] = [
    { key: "num", label: "#", w: 22, align: "center" },
    { key: "rdes", label: "R.Des", w: 60, align: "left" },
    { key: "mpn", label: "MPN", w: 100, align: "left" },
    { key: "desc", label: "Description", w: 140, align: "left" },
    { key: "mfr", label: "MFR", w: 60, align: "left" },
    { key: "mcode", label: "M-Code", w: 36, align: "center" },
    { key: "sup", label: "Supplier", w: 50, align: "left" },
    { key: "supPn", label: "Supplier PN", w: 70, align: "left" },
    { key: "qtyPb", label: "Qty/Brd", w: 30, align: "right" },
    { key: "extra", label: "Extra", w: 26, align: "right" },
    { key: "need", label: "Needed", w: 32, align: "right" },
    { key: "ord", label: "Ordered", w: 36, align: "right" },
    { key: "rcv", label: "Rcvd", w: 30, align: "center" },
    { key: "rcvDt", label: "Recv Date", w: 50, align: "center" },
    { key: "chk", label: "Checked", w: 36, align: "center" },
    { key: "ok", label: "OK", w: 16, align: "center" },
  ];
  let accX = LAND_MARGIN;
  const col = COL_SPECS.map((c) => {
    const x = accX;
    accX += c.w;
    return { ...c, x };
  });
  const tableRight = accX;

  const rowH = 14;
  const headerBlockH = 82;
  const signatureBlockH = 70;
  const footerAreaH = 28;

  const dataTop = LAND_HEIGHT - LAND_MARGIN - headerBlockH;
  const rowsPerPageFirst = Math.max(
    1,
    Math.floor((dataTop - footerAreaH - signatureBlockH) / rowH)
  );
  const rowsPerPageMid = Math.max(
    1,
    Math.floor((dataTop - footerAreaH) / rowH)
  );

  const pageBreaks: number[] = [];
  {
    let idx = 0;
    const total = p.lines.length;
    if (total === 0) {
      pageBreaks.push(0);
    } else {
      while (idx < total) {
        const remaining = total - idx;
        if (remaining <= rowsPerPageFirst) {
          pageBreaks.push(idx + remaining);
          idx += remaining;
        } else {
          pageBreaks.push(idx + rowsPerPageMid);
          idx += rowsPerPageMid;
        }
      }
    }
  }
  const totalPages = pageBreaks.length;

  const drawLandscapeHeader = (page: PDFPage, pageNum: number): number => {
    let y = LAND_HEIGHT - LAND_MARGIN;
    let textX = LAND_MARGIN;
    if (logo) {
      const logoH = 34;
      const scale = logoH / logo.height;
      const logoW = logo.width * scale;
      page.drawImage(logo, { x: LAND_MARGIN, y: y - logoH, width: logoW, height: logoH });
      textX = LAND_MARGIN + logoW + 8;
    }
    page.drawText("R.S. ELECTRONIQUE INC.", {
      x: textX,
      y,
      size: 12,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    y -= 12;
    page.drawText(
      "5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9  |  +1 (438) 833-8477  |  info@rspcbassembly.com",
      { x: textX, y, size: 7, font: fonts.regular, color: COLOR_MUTED }
    );

    const title = "RECEPTION FILE";
    const titleSize = 16;
    const tw = fonts.bold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: tableRight - tw,
      y: LAND_HEIGHT - LAND_MARGIN,
      size: titleSize,
      font: fonts.bold,
      color: COLOR_DARK,
    });
    const printLbl = `Printed: ${today}`;
    const pw = fonts.regular.widthOfTextAtSize(printLbl, 8);
    page.drawText(printLbl, {
      x: tableRight - pw,
      y: LAND_HEIGHT - LAND_MARGIN - 18,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    const pageLbl = `Page ${pageNum} of ${totalPages}`;
    const pgw = fonts.regular.widthOfTextAtSize(pageLbl, 8);
    page.drawText(pageLbl, {
      x: tableRight - pgw,
      y: LAND_HEIGHT - LAND_MARGIN - 30,
      size: 8,
      font: fonts.regular,
      color: COLOR_MUTED,
    });

    y -= 8;
    page.drawLine({
      start: { x: LAND_MARGIN, y },
      end: { x: tableRight, y },
      thickness: 1.5,
      color: COLOR_DARK,
    });
    y -= 6;

    // Info strip (4 x 2 grid of key/value fields — mirrors the PROC header block)
    const infoH = 32;
    page.drawRectangle({
      x: LAND_MARGIN,
      y: y - infoH,
      width: tableRight - LAND_MARGIN,
      height: infoH,
      color: COLOR_BG_STRIP,
    });
    const fields: { l: string; v: string }[] = [
      { l: "PROC BATCH", v: p.procBatchCode ?? "—" },
      { l: "JOB NUMBER", v: p.jobNumber },
      { l: "CUSTOMER", v: `${p.customerCode} — ${p.customerName}` },
      { l: "GMP", v: `${p.gmpNumber}${p.boardName ? ` (${p.boardName})` : ""}` },
      { l: "BOARD QTY", v: String(p.quantity) },
      { l: "PO#", v: p.poNumber ?? "—" },
      { l: "LINES", v: String(p.lines.length) },
      { l: "DATE", v: today },
    ];
    const colWidth = (tableRight - LAND_MARGIN - 8) / 4;
    fields.forEach((f, i) => {
      const rowIdx = Math.floor(i / 4);
      const colIdx = i % 4;
      const fx = LAND_MARGIN + 6 + colIdx * colWidth;
      const fy = y - 10 - rowIdx * 15;
      page.drawText(f.l, {
        x: fx,
        y: fy,
        size: 6,
        font: fonts.bold,
        color: COLOR_LIGHT,
      });
      page.drawText(truncate(f.v, colWidth - 4, fonts.regular, 8), {
        x: fx,
        y: fy - 9,
        size: 8,
        font: fonts.regular,
        color: COLOR_DARK,
      });
    });
    y -= infoH + 4;

    // Table header row
    page.drawRectangle({
      x: LAND_MARGIN,
      y: y - 16,
      width: tableRight - LAND_MARGIN,
      height: 16,
      color: COLOR_DARK,
    });
    for (const c of col) {
      const lw = fonts.bold.widthOfTextAtSize(c.label, 7);
      let tx = c.x + 3;
      if (c.align === "center") tx = c.x + (c.w - lw) / 2;
      else if (c.align === "right") tx = c.x + c.w - lw - 3;
      page.drawText(c.label, {
        x: tx,
        y: y - 11,
        size: 7,
        font: fonts.bold,
        color: COLOR_WHITE,
      });
    }
    return y - 16;
  };

  const drawCell = (
    page: PDFPage,
    c: (typeof col)[number],
    rowY: number,
    text: string,
    boldFont = false,
    darkColor = false
  ) => {
    const font = boldFont ? fonts.bold : fonts.regular;
    const color = darkColor ? COLOR_DARK : COLOR_TEXT;
    const sz = 6.5;
    const padded = truncate(text, c.w - 4, font, sz);
    const tw = font.widthOfTextAtSize(padded, sz);
    let tx = c.x + 2;
    if (c.align === "center") tx = c.x + (c.w - tw) / 2;
    else if (c.align === "right") tx = c.x + c.w - tw - 2;
    page.drawText(padded, { x: tx, y: rowY + 4, size: sz, font, color });
  };

  const drawLandscapeFooter = (page: PDFPage, pageNum: number) => {
    const y = 14;
    page.drawLine({
      start: { x: LAND_MARGIN, y: y + 10 },
      end: { x: tableRight, y: y + 10 },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
    page.drawText("R.S. Electronique Inc.", {
      x: LAND_MARGIN,
      y,
      size: 7,
      font: fonts.regular,
      color: COLOR_LIGHT,
    });
    const center = `${p.jobNumber} — Reception File (PROC V25)`;
    const cw = fonts.regular.widthOfTextAtSize(center, 7);
    page.drawText(center, {
      x: (LAND_WIDTH - cw) / 2,
      y,
      size: 7,
      font: fonts.regular,
      color: COLOR_LIGHT,
    });
    const right = `Page ${pageNum} of ${totalPages}`;
    const rw = fonts.regular.widthOfTextAtSize(right, 7);
    page.drawText(right, {
      x: tableRight - rw,
      y,
      size: 7,
      font: fonts.regular,
      color: COLOR_LIGHT,
    });
  };

  let lineIdx = 0;
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = doc.addPage([LAND_WIDTH, LAND_HEIGHT]);
    const tableTopY = drawLandscapeHeader(page, pageNum);
    let y = tableTopY;
    const endIdx = pageBreaks[pageNum - 1];

    while (lineIdx < endIdx) {
      const rowY = y - rowH;
      const line = p.lines[lineIdx];
      const displayNum = lineIdx + 1;

      if (lineIdx % 2 === 1) {
        page.drawRectangle({
          x: LAND_MARGIN,
          y: rowY,
          width: tableRight - LAND_MARGIN,
          height: rowH,
          color: COLOR_BG_ALT,
        });
      }

      const qtyPb =
        p.quantity > 0 ? Math.round(line.qtyNeeded / p.quantity) : 0;
      drawCell(page, col[0], rowY, String(displayNum));
      drawCell(page, col[1], rowY, line.referenceDesignator ?? "");
      drawCell(page, col[2], rowY, line.mpn ?? "—", true, true);
      drawCell(page, col[3], rowY, line.description ?? "");
      drawCell(page, col[4], rowY, line.manufacturer ?? "");
      drawCell(page, col[5], rowY, line.mCode ?? "—");
      drawCell(page, col[6], rowY, line.isBG ? "BG" : line.supplier ?? "");
      drawCell(page, col[7], rowY, line.supplierPn ?? "");
      drawCell(page, col[8], rowY, String(qtyPb));
      drawCell(page, col[9], rowY, String(line.qtyExtra));
      drawCell(
        page,
        col[10],
        rowY,
        String(line.qtyNeeded + line.qtyExtra),
        true,
        true
      );
      drawCell(
        page,
        col[11],
        rowY,
        (line.qtyOrdered ?? 0) > 0 ? String(line.qtyOrdered) : ""
      );
      drawCell(
        page,
        col[12],
        rowY,
        (line.qtyReceived ?? 0) > 0 ? String(line.qtyReceived) : ""
      );
      // Recv Date, Checked — blank for manual fill

      const ok = col[15];
      const cb = 9;
      page.drawRectangle({
        x: ok.x + (ok.w - cb) / 2,
        y: rowY + (rowH - cb) / 2,
        width: cb,
        height: cb,
        borderColor: COLOR_LIGHT,
        borderWidth: 0.7,
      });

      page.drawLine({
        start: { x: LAND_MARGIN, y: rowY },
        end: { x: tableRight, y: rowY },
        thickness: 0.4,
        color: COLOR_BORDER,
      });

      y = rowY;
      lineIdx++;
    }

    // Outer table box + vertical separators
    const tableBottomY = y;
    page.drawRectangle({
      x: LAND_MARGIN,
      y: tableBottomY,
      width: tableRight - LAND_MARGIN,
      height: tableTopY - tableBottomY,
      borderColor: COLOR_BORDER,
      borderWidth: 0.6,
    });
    for (let i = 1; i < col.length; i++) {
      const vx = col[i].x;
      page.drawLine({
        start: { x: vx, y: tableBottomY },
        end: { x: vx, y: tableTopY },
        thickness: 0.4,
        color: COLOR_BORDER,
      });
    }

    // Signature + QC block on last page
    if (pageNum === totalPages) {
      const totalNeeded = p.lines.reduce(
        (s, l) => s + l.qtyNeeded + l.qtyExtra,
        0
      );
      const totalReceived = p.lines.reduce(
        (s, l) => s + (l.qtyReceived ?? 0),
        0
      );

      let sy = tableBottomY - 14;
      page.drawText(
        `Totals: ${p.lines.length} lines  |  Parts needed + overage: ${totalNeeded}  |  Parts received to date: ${totalReceived}`,
        {
          x: LAND_MARGIN,
          y: sy,
          size: 8,
          font: fonts.bold,
          color: COLOR_DARK,
        }
      );
      sy -= 18;

      const colW = (tableRight - LAND_MARGIN - 24) / 2;
      const leftX = LAND_MARGIN;
      const rightX = LAND_MARGIN + colW + 24;

      page.drawLine({
        start: { x: leftX, y: sy },
        end: { x: leftX + colW, y: sy },
        thickness: 0.6,
        color: COLOR_LIGHT,
      });
      page.drawLine({
        start: { x: rightX, y: sy },
        end: { x: rightX + colW, y: sy },
        thickness: 0.6,
        color: COLOR_LIGHT,
      });
      page.drawText("Received By — Name / Signature / Date", {
        x: leftX,
        y: sy - 10,
        size: 7,
        font: fonts.regular,
        color: COLOR_MUTED,
      });
      page.drawText("Verified By — Name / Signature / Date", {
        x: rightX,
        y: sy - 10,
        size: 7,
        font: fonts.regular,
        color: COLOR_MUTED,
      });

      sy -= 26;
      page.drawText("QC CHECKPOINTS:", {
        x: LAND_MARGIN,
        y: sy,
        size: 7,
        font: fonts.bold,
        color: COLOR_DARK,
      });
      const qcItems = [
        "All MPNs match BOM",
        "Quantities verified vs PROC",
        "Visual inspection (no damage)",
        "MSL parts bagged & dated",
        "ESD-sensitive parts handled",
      ];
      let qcX = LAND_MARGIN + 95;
      for (const item of qcItems) {
        page.drawRectangle({
          x: qcX,
          y: sy - 1,
          width: 8,
          height: 8,
          borderColor: COLOR_LIGHT,
          borderWidth: 0.6,
        });
        page.drawText(item, {
          x: qcX + 11,
          y: sy,
          size: 7,
          font: fonts.regular,
          color: COLOR_TEXT,
        });
        qcX += 11 + fonts.regular.widthOfTextAtSize(item, 7) + 14;
      }
    }

    drawLandscapeFooter(page, pageNum);
  }

  return doc.save();
}
