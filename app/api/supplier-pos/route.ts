import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// GET /api/supplier-pos â€” global list with filters.
// Query: ?supplier=&status=&from=YYYY-MM-DD&to=YYYY-MM-DD&search=&procurement_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const supplier = sp.get("supplier");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const search = sp.get("search");
  const procurementId = sp.get("procurement_id");

  let query = supabase
    .from("supplier_pos")
    .select(
      `id, po_number, supplier_name, supplier_email, total_amount, status, pdf_path,
       sent_at, expected_arrival, tracking_number, created_at, updated_at,
       procurement_id,
       procurements!inner(proc_code, customer_id, customers(code, company_name))`
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (supplier) query = query.eq("supplier_name", supplier);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (search) query = query.ilike("po_number", `%${search}%`);
  if (procurementId) query = query.eq("procurement_id", procurementId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const orders = await Promise.all(
    rows.map(async (r) => {
      let pdf_url: string | null = null;
      const pdfPath = (r as { pdf_path?: string | null }).pdf_path;
      if (pdfPath) {
        try {
          const { data: signed } = await supabase.storage
            .from("procurement")
            .createSignedUrl(pdfPath, 60 * 60 * 24);
          pdf_url = signed?.signedUrl ?? null;
        } catch {
          pdf_url = null;
        }
      }
      return { ...r, pdf_url };
    })
  );

  return NextResponse.json({ orders });
}

// POST /api/supplier-pos â€” programmatic PO creation from selected procurement
// lines and a free-text supplier_name. NOTE: as of the supplier-quotes feature
// (migration 077) this is no longer wired to a UI form â€” POs originate from
// (a) the merged-BOM "Create Purchase Order PDF" flow for online distributors
// and (b) accepted supplier_quotes for RFQ suppliers. The endpoint is
// preserved for backward compatibility / programmatic / Telegram-bot use.
// TODO: when a supplier_id is known, callers should prefer the supplier_quotes
// â†’ accept flow, which links the resulting PO to a quote record.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only â€” creating a supplier PO is a financial commitment.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    procurement_id,
    supplier_name,
    supplier_email,
    line_ids,
  }: {
    procurement_id: string;
    supplier_name: string;
    supplier_email?: string;
    line_ids: string[];
  } = body;

  if (!procurement_id || !supplier_name || !line_ids?.length) {
    return NextResponse.json(
      { error: "procurement_id, supplier_name, and line_ids are required" },
      { status: 400 }
    );
  }

  // Fetch the specified procurement lines
  const { data: procLines, error: linesError } = await supabase
    .from("procurement_lines")
    .select("*")
    .in("id", line_ids)
    .eq("procurement_id", procurement_id);

  if (linesError || !procLines?.length) {
    return NextResponse.json(
      { error: "Procurement lines not found" },
      { status: 404 }
    );
  }

  // Generate PO number: PO-YYMM-NNN
  const now = new Date();
  const yymm =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PO-${yymm}-`;

  const { data: existing } = await supabase
    .from("supplier_pos")
    .select("po_number")
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (existing?.length) {
    const last = existing[0].po_number as string;
    const lastSeq = parseInt(last.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }
  const poNumber = `${prefix}${String(seq).padStart(3, "0")}`;

  // Resolve customer_ref per line via the proc rollup so the supplier PO
  // PDF can show our internal RS reference (board letter + designator +
  // m-code + cpc).
  const refByMpn = new Map<string, string>();
  {
    const { buildProcOrderingRows } = await import("@/lib/proc/ordering-rollup");
    const ctx = await buildProcOrderingRows(supabase, procurement_id);
    for (const r of ctx.rows) {
      if (!r.customer_ref) continue;
      if (r.winning_mpn) refByMpn.set(r.winning_mpn.trim().toUpperCase(), r.customer_ref);
      if (r.cpc) refByMpn.set(r.cpc.trim().toUpperCase(), r.customer_ref);
    }
  }

  // Build lines JSONB
  interface POLine {
    mpn: string;
    description: string | null;
    qty: number;
    unit_price: number;
    line_total: number;
    customer_ref: string | null;
  }

  const poLines: POLine[] = procLines.map((pl) => {
    const qty = (pl.qty_needed ?? 0) + (pl.qty_extra ?? 0);
    const unitPrice = Number(pl.unit_price) || 0;
    const mpn = (pl.mpn ?? "").trim();
    return {
      mpn,
      description: pl.description ?? null,
      qty,
      unit_price: unitPrice,
      line_total: Math.round(qty * unitPrice * 100) / 100,
      customer_ref: mpn ? refByMpn.get(mpn.toUpperCase()) ?? null : null,
    };
  });

  const totalAmount = poLines.reduce((sum, l) => sum + l.line_total, 0);

  // Insert supplier PO
  const { data: po, error: insertError } = await supabase
    .from("supplier_pos")
    .insert({
      po_number: poNumber,
      procurement_id,
      supplier_name,
      supplier_email: supplier_email ?? null,
      lines: poLines,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "draft",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update procurement lines with supplier info and mark as ordered
  for (const pl of procLines) {
    const qty = (pl.qty_needed ?? 0) + (pl.qty_extra ?? 0);
    await supabase
      .from("procurement_lines")
      .update({
        supplier: supplier_name,
        qty_ordered: qty,
        order_status: "ordered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pl.id);
  }

  // Recalculate procurement-level counts
  const { data: allLines } = await supabase
    .from("procurement_lines")
    .select("qty_ordered, order_status")
    .eq("procurement_id", procurement_id);

  const linesOrdered = (allLines ?? []).filter(
    (l) => l.qty_ordered > 0
  ).length;
  const linesReceived = (allLines ?? []).filter(
    (l) => l.order_status === "received"
  ).length;
  const totalLinesCount = (allLines ?? []).length;

  let procStatus: string;
  if (linesReceived === totalLinesCount && totalLinesCount > 0) {
    procStatus = "fully_received";
  } else if (linesReceived > 0) {
    procStatus = "partial_received";
  } else if (linesOrdered > 0) {
    procStatus = "ordering";
  } else {
    procStatus = "draft";
  }

  await supabase
    .from("procurements")
    .update({
      lines_ordered: linesOrdered,
      lines_received: linesReceived,
      status: procStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", procurement_id);

  return NextResponse.json(po, { status: 201 });
}
