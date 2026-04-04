import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: procurement, error } = await supabase
    .from("procurements")
    .select(
      "id, proc_code, job_id, status, total_lines, lines_ordered, lines_received, notes, created_at, updated_at, jobs(job_number, status, quantity, customers(code, company_name), gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: lines, error: linesError } = await supabase
    .from("procurement_lines")
    .select(
      "id, bom_line_id, mpn, description, m_code, qty_needed, qty_extra, qty_ordered, qty_received, supplier, supplier_pn, unit_price, extended_price, is_bg, order_status, notes"
    )
    .eq("procurement_id", id)
    .order("created_at", { ascending: true });

  if (linesError)
    return NextResponse.json({ error: linesError.message }, { status: 500 });

  return NextResponse.json({ ...procurement, lines: lines ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    line_id: string;
    qty_received: number;
  };

  if (!body.line_id || body.qty_received == null) {
    return NextResponse.json(
      { error: "line_id and qty_received are required" },
      { status: 400 }
    );
  }

  // Verify the line belongs to this procurement
  const { data: line, error: lineError } = await supabase
    .from("procurement_lines")
    .select("id, procurement_id, qty_ordered")
    .eq("id", body.line_id)
    .eq("procurement_id", id)
    .single();

  if (lineError || !line)
    return NextResponse.json(
      { error: "Procurement line not found" },
      { status: 404 }
    );

  // Update the line's received quantity
  const newStatus =
    body.qty_received >= (line.qty_ordered || 0) ? "received" : "ordered";

  const { error: updateError } = await supabase
    .from("procurement_lines")
    .update({
      qty_received: body.qty_received,
      order_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.line_id);

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Recalculate procurement-level counts
  const { data: allLines } = await supabase
    .from("procurement_lines")
    .select("qty_ordered, qty_received, order_status")
    .eq("procurement_id", id);

  const linesOrdered = (allLines ?? []).filter(
    (l) => l.qty_ordered > 0
  ).length;
  const linesReceived = (allLines ?? []).filter(
    (l) => l.order_status === "received"
  ).length;
  const totalLines = (allLines ?? []).length;

  // Determine procurement status
  let procStatus: string;
  if (linesReceived === totalLines && totalLines > 0) {
    procStatus = "fully_received";
  } else if (linesReceived > 0) {
    procStatus = "partial_received";
  } else if (linesOrdered > 0) {
    procStatus = "ordering";
  } else {
    procStatus = "draft";
  }

  const { data: updated, error: procUpdateError } = await supabase
    .from("procurements")
    .update({
      lines_ordered: linesOrdered,
      lines_received: linesReceived,
      status: procStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, proc_code, status, total_lines, lines_ordered, lines_received")
    .single();

  if (procUpdateError)
    return NextResponse.json(
      { error: procUpdateError.message },
      { status: 500 }
    );

  return NextResponse.json(updated);
}
