import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createPdfDoc,
  drawHeader,
  drawFooter,
  sanitizeForPdf,
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
  COLOR_BG_STRIP,
  COLOR_BORDER,
} from "@/lib/pdf/helpers";
import { buildProcOrderingRows } from "@/lib/proc/ordering-rollup";

export const dynamic = "force-dynamic";

function fmtCAD(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

function todayStampYYMMDD(): string {
  const d = new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// POST /api/proc/[id]/purchase-order-pdf  body: { supplier: string }
// Generates a PO PDF, uploads it to Supabase Storage, inserts a supplier_pos
// row and returns { po_number, pdf_url }.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { supplier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const supplier = (body.supplier ?? "").trim();
  if (!supplier) {
    return NextResponse.json({ error: "Missing supplier" }, { status: 400 });
  }
  const supplierLower = supplier.toLowerCase();
  const supplierUpper = supplier.toUpperCase();

  const ctx = await buildProcOrderingRows(supabase, id);
  if (!ctx.proc) return NextResponse.json({ error: "PROC not found" }, { status: 404 });
  const proc = ctx.proc;
  const rows = ctx.rows;

  const picked = rows.filter((r) => {
    if (r.is_customer_supplied) return false;
    const sel = r.selection;
    if (!sel) return false;
    return (sel.chosen_supplier ?? "").toLowerCase() === supplierLower;
  });
  if (picked.length === 0) {
    return NextResponse.json(
      { error: "No selected lines for this supplier" },
      { status: 400 }
    );
  }

  // Build line objects + totals.
  interface POLine {
    s_no: number;
    customer_ref: string;
    distributor_pn: string;
    mpn: string;
    description: string;
    qty: number;
    unit_price_cad: number;
    extended_cad: number;
  }
  const poLines: POLine[] = picked.map((r, idx) => {
    const sel = r.selection!;
    const unit =
      sel.manual_unit_price_cad != null
        ? Number(sel.manual_unit_price_cad)
        : Number(sel.chosen_unit_price_cad ?? 0);
    const qty = sel.chosen_effective_qty ?? r.total_with_extras;
    // Phase 3: ordering rows are CPC-keyed. The supplier-facing MPN is the
    // winning MPN within the CPC group; fall back to CPC if neither MPN nor
    // distributor PN is available so the PO never shows a blank cell.
    const displayMpn = r.winning_mpn ?? r.cpc;
    return {
      s_no: idx + 1,
      customer_ref: r.customer_ref,
      distributor_pn: sel.chosen_supplier_pn ?? displayMpn,
      mpn: displayMpn,
      description: r.description ?? "",
      qty,
      unit_price_cad: unit,
      extended_cad: unit * qty,
    };
  });
  const totalAmount = poLines.reduce((s, l) => s + l.extended_cad, 0);

  // Generate PO number: PO-YYMMDD-SUPPLIER-NNN (retry once on collision).
  const datePrefix = todayStampYYMMDD();
  const poPrefix = `PO-${datePrefix}-${supplierUpper}-`;

  async function nextPoNumber(): Promise<string> {
    const { data: existing } = await supabase
      .from("supplier_pos")
      .select("po_number")
      .like("po_number", `${poPrefix}%`);
    const count = (existing ?? []).length;
    return `${poPrefix}${String(count + 1).padStart(3, "0")}`;
  }

  let poNumber = await nextPoNumber();

  // ---- Build PDF ----
  const { doc, fonts, logo } = await createPdfDoc();
  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = drawHeader(
    page,
    fonts,
    "PURCHASE ORDER",
    [poNumber, fmtDate(new Date().toISOString()), `PROC: ${proc.proc_code}`],
    logo
  );

  // Supplier + Ship-to block
  const colW = CONTENT_WIDTH / 2;
  page.drawText("SUPPLIER", { x: MARGIN, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  page.drawText("SHIP TO", { x: MARGIN + colW, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  let ly = y - 14;
  const supplierLines = [supplier, "Contact: TBD"];
  const shipLines = [
    "R.S. Electronique Inc.",
    "5580 Vanden Abeele",
    "Saint-Laurent, QC H4S 1P9",
    "Canada",
  ];
  const maxL = Math.max(supplierLines.length, shipLines.length);
  for (let i = 0; i < maxL; i++) {
    if (supplierLines[i]) {
      page.drawText(sanitizeForPdf(supplierLines[i]), {
        x: MARGIN,
        y: ly,
        size: 9,
        font: i === 0 ? fonts.bold : fonts.regular,
        color: i === 0 ? COLOR_TEXT : COLOR_MUTED,
      });
    }
    if (shipLines[i]) {
      page.drawText(sanitizeForPdf(shipLines[i]), {
        x: MARGIN + colW,
        y: ly,
        size: 9,
        font: i === 0 ? fonts.bold : fonts.regular,
        color: i === 0 ? COLOR_TEXT : COLOR_MUTED,
      });
    }
    ly -= 12;
  }
  y = ly - 10;

  // Table header
  // Columns: S.No | Customer Ref | MPN | Desc | Qty | Unit | Ext
  // Column widths recomputed so the Ext column fits inside CONTENT_WIDTH.
  // # + CustRef + MPN + Desc + Qty + Unit + Ext must sum to CONTENT_WIDTH.
  const W_SNO = 24;
  const W_CREF = 95;
  const W_MPN = 110;
  const W_QTY = 32;
  const W_UNIT = 55;
  const W_EXT = 60;
  const W_DESC = CONTENT_WIDTH - (W_SNO + W_CREF + W_MPN + W_QTY + W_UNIT + W_EXT);
  let cx = MARGIN;
  const cols = [
    { label: "#", x: cx, w: W_SNO, align: "left" as const },
    { label: "Customer Ref", x: (cx += W_SNO), w: W_CREF, align: "left" as const },
    { label: "MPN", x: (cx += W_CREF), w: W_MPN, align: "left" as const },
    { label: "Description", x: (cx += W_MPN), w: W_DESC, align: "left" as const },
    { label: "Qty", x: (cx += W_DESC), w: W_QTY, align: "right" as const },
    { label: "Unit $", x: (cx += W_QTY), w: W_UNIT, align: "right" as const },
    { label: "Ext $", x: (cx += W_UNIT), w: W_EXT, align: "right" as const },
  ];
  const rowH = 16;
  page.drawRectangle({
    x: MARGIN, y: y - rowH, width: CONTENT_WIDTH, height: rowH, color: COLOR_DARK,
  });
  for (const c of cols) {
    const lw = fonts.bold.widthOfTextAtSize(c.label, 7);
    const tx = c.align === "right" ? c.x + c.w - lw - 2 : c.x + 2;
    page.drawText(c.label, { x: tx, y: y - 11, size: 7, font: fonts.bold, color: COLOR_WHITE });
  }
  y -= rowH;

  const FOOTER_Y = 70;
  for (let i = 0; i < poLines.length; i++) {
    if (y < FOOTER_Y + 40) {
      drawFooter(page, fonts, "R.S. Electronique Inc.", poNumber);
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = drawHeader(page, fonts, "PURCHASE ORDER (cont.)", [poNumber], logo);
    }
    const ln = poLines[i];
    const alt = i % 2 === 1;
    if (alt) {
      page.drawRectangle({
        x: MARGIN, y: y - rowH, width: CONTENT_WIDTH, height: rowH, color: COLOR_BG_STRIP,
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: y - rowH }, end: { x: MARGIN + CONTENT_WIDTH, y: y - rowH },
      thickness: 0.3, color: COLOR_BORDER,
    });

    const vals: [string, (typeof cols)[number]][] = [
      [String(ln.s_no), cols[0]],
      [truncate(ln.customer_ref, cols[1].w - 4, fonts.regular, 7.5), cols[1]],
      [truncate(ln.mpn, cols[2].w - 4, fonts.regular, 7.5), cols[2]],
      [truncate(ln.description, cols[3].w - 4, fonts.regular, 7.5), cols[3]],
      [String(ln.qty), cols[4]],
      [fmtCAD(ln.unit_price_cad), cols[5]],
      [fmtCAD(ln.extended_cad), cols[6]],
    ];
    for (const [text, col] of vals) {
      const safe = sanitizeForPdf(text);
      const tw = fonts.regular.widthOfTextAtSize(safe, 7.5);
      const tx = col.align === "right" ? col.x + col.w - tw - 2 : col.x + 2;
      page.drawText(safe, { x: tx, y: y - 11, size: 7.5, font: fonts.regular, color: COLOR_TEXT });
    }
    y -= rowH;
  }

  // Totals
  y -= 6;
  page.drawLine({
    start: { x: MARGIN + CONTENT_WIDTH / 2, y },
    end: { x: MARGIN + CONTENT_WIDTH, y },
    thickness: 0.8, color: COLOR_DARK,
  });
  y -= 14;
  const subLabel = "Subtotal (CAD)";
  const subVal = fmtCAD(totalAmount);
  page.drawText(subLabel, { x: MARGIN + CONTENT_WIDTH / 2 + 10, y, size: 9, font: fonts.bold, color: COLOR_DARK });
  const svW = fonts.bold.widthOfTextAtSize(subVal, 10);
  page.drawText(subVal, { x: MARGIN + CONTENT_WIDTH - svW - 2, y, size: 10, font: fonts.bold, color: COLOR_DARK });
  y -= 30;

  // Payment + signature
  page.drawText("Payment Terms: Net 30", { x: MARGIN, y, size: 8, font: fonts.regular, color: COLOR_MUTED });
  y -= 40;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: MARGIN + 180, y },
    thickness: 0.5, color: COLOR_BORDER,
  });
  page.drawText("Authorized Signature", { x: MARGIN, y: y - 10, size: 7, font: fonts.regular, color: COLOR_MUTED });

  drawFooter(page, fonts, "R.S. Electronique Inc.", poNumber);

  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Upload to procurement bucket
  const storagePath = `${proc.id}/${poNumber}.pdf`;

  async function uploadAndInsert(poNum: string, path: string) {
    const upload = await supabase.storage
      .from("procurement")
      .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw upload.error;

    const insertRes = await supabase.from("supplier_pos").insert({
      po_number: poNum,
      procurement_id: proc.id,
      supplier_name: supplier,
      lines: poLines,
      total_amount: totalAmount,
      pdf_path: path,
      status: "draft",
    });
    return insertRes;
  }

  let insertRes = await uploadAndInsert(poNumber, storagePath);
  if (insertRes.error) {
    // Retry once (race on po_number uniqueness)
    const code = (insertRes.error as unknown as { code?: string }).code;
    if (code === "23505") {
      poNumber = await nextPoNumber();
      const retryPath = `${proc.id}/${poNumber}.pdf`;
      insertRes = await uploadAndInsert(poNumber, retryPath);
    }
    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }
  }

  // Signed URL
  const { data: signed } = await supabase.storage
    .from("procurement")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  return NextResponse.json({
    po_number: poNumber,
    pdf_url: signed?.signedUrl ?? null,
  });
}
