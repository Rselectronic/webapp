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

  const body = await req.json();
  const action: string = body.action ?? "receive_line"; // backward compat

  // ── action: order_line ──────────────────────────────────────────────
  if (action === "order_line") {
    const lineId: string | undefined = body.line_id;
    if (!lineId)
      return NextResponse.json(
        { error: "line_id is required for order_line" },
        { status: 400 }
      );

    const { data: line, error: lineError } = await supabase
      .from("procurement_lines")
      .select("id, procurement_id, qty_needed, qty_extra")
      .eq("id", lineId)
      .eq("procurement_id", id)
      .single();

    if (lineError || !line)
      return NextResponse.json(
        { error: "Procurement line not found" },
        { status: 404 }
      );

    const orderQty = (line.qty_needed ?? 0) + (line.qty_extra ?? 0);

    const { error: updateError } = await supabase
      .from("procurement_lines")
      .update({
        qty_ordered: orderQty,
        order_status: "ordered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lineId);

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
  }

  // ── action: order_all ───────────────────────────────────────────────
  else if (action === "order_all") {
    const { data: pendingLines, error: fetchError } = await supabase
      .from("procurement_lines")
      .select("id, qty_needed, qty_extra")
      .eq("procurement_id", id)
      .eq("order_status", "pending");

    if (fetchError)
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );

    for (const pl of pendingLines ?? []) {
      const orderQty = (pl.qty_needed ?? 0) + (pl.qty_extra ?? 0);
      await supabase
        .from("procurement_lines")
        .update({
          qty_ordered: orderQty,
          order_status: "ordered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pl.id);
    }
  }

  // ── action: receive_line (original behavior) ───────────────────────
  else if (action === "receive_line") {
    const lineId: string | undefined = body.line_id;
    const qtyReceived: number | undefined = body.qty_received;

    if (!lineId || qtyReceived == null)
      return NextResponse.json(
        { error: "line_id and qty_received are required for receive_line" },
        { status: 400 }
      );

    const { data: line, error: lineError } = await supabase
      .from("procurement_lines")
      .select("id, procurement_id, qty_ordered, qty_needed, qty_extra")
      .eq("id", lineId)
      .eq("procurement_id", id)
      .single();

    if (lineError || !line)
      return NextResponse.json(
        { error: "Procurement line not found" },
        { status: 404 }
      );

    const totalQty =
      line.qty_ordered > 0
        ? line.qty_ordered
        : (line.qty_needed ?? 0) + (line.qty_extra ?? 0);
    const newStatus = qtyReceived >= totalQty ? "received" : "ordered";

    const { error: updateError } = await supabase
      .from("procurement_lines")
      .update({
        qty_received: qtyReceived,
        order_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lineId);

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
  }

  // ── action: update_status ──────────────────────────────────────────
  else if (action === "update_status") {
    const newStatus: string | undefined = body.status;
    if (!newStatus)
      return NextResponse.json(
        { error: "status is required for update_status" },
        { status: 400 }
      );

    const validStatuses = [
      "draft",
      "ordering",
      "partial_received",
      "fully_received",
      "completed",
    ];
    if (!validStatuses.includes(newStatus))
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );

    const { data: updated, error: updateError } = await supabase
      .from("procurements")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        "id, proc_code, status, total_lines, lines_ordered, lines_received"
      )
      .single();

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );

    return NextResponse.json(updated);
  }

  // ── unknown action ─────────────────────────────────────────────────
  else {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  }

  // ── Recalculate procurement-level counts (shared by order/receive) ─
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
