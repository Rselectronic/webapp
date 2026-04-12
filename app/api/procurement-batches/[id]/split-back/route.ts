import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/procurement-batches/[id]/split-back
 *
 * The SPLIT phase of the procurement merge-split pattern.
 *
 * Distributes received quantities and supplier info back to the individual
 * procurement lines that contributed to each merged batch line.
 *
 * For each batch line:
 *   1. Look up source_line_ids (the original procurement_lines)
 *   2. Distribute the ordered/received quantities proportionally
 *   3. Update each procurement_line with supplier, unit_price, order_status
 *   4. Recalculate procurement-level counts
 *
 * This is the "Send Data to BOM" equivalent for procurement —
 * a trust transfer (BUILD_PROMPT.md §2.5).
 *
 * Input: Batch must be in status "pos_created" or "receiving"
 * Output: Batch moves to "split_back", individual procurement lines updated
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Validate batch
  const { data: batch } = await admin
    .from("procurement_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (!["pos_created", "receiving"].includes(batch.status)) {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Split back requires "pos_created" or "receiving".` },
      { status: 400 }
    );
  }

  // Fetch all batch lines
  const { data: batchLines } = await admin
    .from("procurement_batch_lines")
    .select("id, mpn, supplier, supplier_pn, unit_price, order_qty, qty_ordered, qty_received, order_status, source_line_ids, procurement_refs")
    .eq("batch_id", batchId)
    .order("line_number", { ascending: true });

  if (!batchLines || batchLines.length === 0) {
    return NextResponse.json({ error: "No batch lines found" }, { status: 400 });
  }

  // Get batch items to know which procurements are involved
  const { data: batchItems } = await admin
    .from("procurement_batch_items")
    .select("procurement_id, board_letter")
    .eq("batch_id", batchId)
    .order("board_letter", { ascending: true });

  const boardToProcId = new Map<string, string>();
  for (const bi of batchItems ?? []) {
    boardToProcId.set(bi.board_letter, bi.procurement_id);
  }

  let linesUpdated = 0;

  for (const batchLine of batchLines) {
    const sourceLineIds: string[] = (batchLine.source_line_ids as string[]) ?? [];
    if (sourceLineIds.length === 0) continue;

    // Parse procurement_refs to get per-procurement quantities: "A:50, B:100"
    const procRefs = new Map<string, number>();
    if (batchLine.procurement_refs) {
      for (const ref of batchLine.procurement_refs.split(",")) {
        const [letter, qtyStr] = ref.trim().split(":");
        if (letter && qtyStr) {
          procRefs.set(letter.trim(), parseInt(qtyStr.trim(), 10) || 0);
        }
      }
    }

    // Calculate total qty for proportional distribution of ordered/received
    const totalIndividualQty = Array.from(procRefs.values()).reduce((s, q) => s + q, 0);

    // Fetch the actual source procurement lines
    const { data: sourceLines } = await admin
      .from("procurement_lines")
      .select("id, procurement_id, qty_needed")
      .in("id", sourceLineIds);

    if (!sourceLines) continue;

    // Build procurement_id → board_letter reverse map
    const procIdToBoard = new Map<string, string>();
    for (const [letter, procId] of boardToProcId) {
      procIdToBoard.set(procId, letter);
    }

    for (const sourceLine of sourceLines) {
      const boardLetter = procIdToBoard.get(sourceLine.procurement_id);
      const lineQty = boardLetter ? (procRefs.get(boardLetter) ?? sourceLine.qty_needed ?? 0) : (sourceLine.qty_needed ?? 0);
      const proportion = totalIndividualQty > 0 ? lineQty / totalIndividualQty : 0;

      // Proportional distribution of received quantity
      const proportionalReceived = Math.round((batchLine.qty_received ?? 0) * proportion);
      const proportionalOrdered = Math.round((batchLine.qty_ordered ?? 0) * proportion);

      // Determine line status
      let lineStatus = "pending";
      if (proportionalReceived > 0 && proportionalReceived >= proportionalOrdered) {
        lineStatus = "received";
      } else if (proportionalOrdered > 0) {
        lineStatus = "ordered";
      }

      await admin
        .from("procurement_lines")
        .update({
          supplier: batchLine.supplier,
          supplier_pn: batchLine.supplier_pn,
          unit_price: batchLine.unit_price,
          qty_ordered: proportionalOrdered,
          qty_received: proportionalReceived,
          order_status: lineStatus,
          extended_price: batchLine.unit_price ? +(Number(batchLine.unit_price) * proportionalOrdered).toFixed(2) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceLine.id);

      linesUpdated++;
    }
  }

  // Recalculate procurement-level counts for all procurements in the batch
  const procurementsUpdated: string[] = [];
  for (const bi of batchItems ?? []) {
    const { data: allLines } = await admin
      .from("procurement_lines")
      .select("qty_ordered, qty_received, order_status")
      .eq("procurement_id", bi.procurement_id);

    const linesOrdered = (allLines ?? []).filter((l) => (l.qty_ordered ?? 0) > 0).length;
    const linesReceived = (allLines ?? []).filter((l) => l.order_status === "received").length;
    const totalLines = (allLines ?? []).length;

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

    await admin
      .from("procurements")
      .update({
        lines_ordered: linesOrdered,
        lines_received: linesReceived,
        status: procStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bi.procurement_id);

    procurementsUpdated.push(bi.procurement_id);
  }

  // Update batch status
  await admin
    .from("procurement_batches")
    .update({
      status: "split_back",
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batchId,
    action: "split_back",
    old_status: batch.status,
    new_status: "split_back",
    details: {
      batch_lines: batchLines.length,
      procurement_lines_updated: linesUpdated,
      procurements_updated: procurementsUpdated.length,
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "split_back",
    batch_lines: batchLines.length,
    procurement_lines_updated: linesUpdated,
    procurements_updated: procurementsUpdated.length,
    message: `Split back complete. ${linesUpdated} procurement lines updated across ${procurementsUpdated.length} procurements. Individual procurement pages now show supplier info and order status.`,
  });
}
