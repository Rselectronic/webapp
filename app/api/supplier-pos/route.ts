import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const procurementId = req.nextUrl.searchParams.get("procurement_id");

  let query = supabase
    .from("supplier_pos")
    .select("*")
    .order("created_at", { ascending: false });

  if (procurementId) {
    query = query.eq("procurement_id", procurementId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Build lines JSONB
  interface POLine {
    mpn: string;
    description: string | null;
    qty: number;
    unit_price: number;
    line_total: number;
  }

  const poLines: POLine[] = procLines.map((pl) => {
    const qty = (pl.qty_needed ?? 0) + (pl.qty_extra ?? 0);
    const unitPrice = Number(pl.unit_price) || 0;
    return {
      mpn: pl.mpn,
      description: pl.description ?? null,
      qty,
      unit_price: unitPrice,
      line_total: Math.round(qty * unitPrice * 100) / 100,
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
      })
      .eq("id", pl.id);
  }

  return NextResponse.json(po, { status: 201 });
}
