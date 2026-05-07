import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // procurements â†” jobs has TWO FKs (procurements.job_id and jobs.procurement_id),
  // so PostgREST can't disambiguate. Hint with the constraint name; without
  // the hint PostgREST returns a 300 ambiguity error and `procurement` ends
  // up null, which the page then treats as a "not found".
  const { data: procurement, error } = await supabase
    .from("procurements")
    .select(
      "id, proc_code, job_id, status, total_lines, lines_ordered, lines_received, notes, created_at, updated_at, jobs!procurements_job_id_fkey(job_number, status, quantity, customers(code, company_name), gmps(gmp_number, board_name))"
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

  // Admin-only â€” receive/order/status mutations all touch sourcing state.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const action: string = body.action ?? "receive_line"; // backward compat

  // â”€â”€ action: order_line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ action: order_all â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ action: receive_line (original behavior) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ action: update_status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ unknown action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  else {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  }

  // â”€â”€ Recalculate procurement-level counts (shared by order/receive) â”€
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: procId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if procurement exists
  const { data: proc } = await admin.from("procurements").select("id").eq("id", procId).single();
  if (!proc) return NextResponse.json({ error: "Procurement not found" }, { status: 404 });

  // Check if any supplier POs reference this procurement
  const { data: blockingPOs } = await admin
    .from("supplier_pos")
    .select("id, po_number")
    .eq("procurement_id", procId)
    .limit(5);

  if ((blockingPOs ?? []).length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete â€” ${blockingPOs!.length} supplier PO(s) reference this procurement. Delete the POs first.`,
        blocking: {
          supplier_pos: blockingPOs,
        },
      },
      { status: 409 }
    );
  }

  // P7 cascade: block delete if any inventory_movements reference this PROC
  // (consume_proc / buy_for_proc movements). Those FKs are NO ACTION, so
  // letting the delete attempt fall through would surface a raw constraint
  // violation. Operators should release / void the PROC's stock impact first.
  const { count: movementCount } = await admin
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("proc_id", procId);
  if ((movementCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete â€” ${movementCount} inventory movement(s) reference this PROC. The stock effect (consumption / buys) needs to be undone before the PROC can be removed.`,
      },
      { status: 409 }
    );
  }

  // P7 cascade: explicitly release any reserved inventory_allocations before
  // the FK CASCADE wipes them. The CASCADE alone leaves no trace; releasing
  // first means available_qty rebounds correctly even if a downstream observer
  // (audit log, telemetry) reads the row before it's deleted.
  const nowIso = new Date().toISOString();
  await admin
    .from("inventory_allocations")
    .update({ status: "released", released_at: nowIso })
    .eq("procurement_id", procId)
    .eq("status", "reserved");

  // procurement_lines / procurement_line_selections / inventory_allocations /
  // pcb_orders / stencil_orders / supplier_quotes all CASCADE off procurements.id,
  // so the single DELETE below is enough â€” no manual fan-out needed.

  // Delete the procurement record
  const { error } = await admin.from("procurements").delete().eq("id", procId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: procId });
}
