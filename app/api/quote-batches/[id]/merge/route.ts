import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/quote-batches/[id]/merge
 *
 * MasterSheet equivalent — Steps 1-3 of the 11-button sequence:
 *   1. Get Unique MPN — deduplicates components across all boards
 *   2. Update X Quantity — calculates cross-board quantities
 *   3. Get Qty and Board — maps components to boards
 *
 * Input: Batch must be in status "created"
 * Output: Batch moves to "merged", quote_batch_lines populated with deduplicated components
 *
 * This is an explicit user action — the user clicks "Merge" after reviewing which BOMs are in the batch.
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

  // Validate batch exists and is in correct status
  const { data: batch, error: batchError } = await admin
    .from("quote_batches")
    .select("id, status, customer_id")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.status !== "created") {
    return NextResponse.json(
      { error: `Batch is in status "${batch.status}". Merge requires status "created". To re-merge, reset the batch first.` },
      { status: 400 }
    );
  }

  // Get all active BOMs in this batch
  const { data: batchBoms } = await admin
    .from("quote_batch_boms")
    .select("bom_id, gmp_id, board_letter, is_active")
    .eq("batch_id", batchId)
    .eq("is_active", true)
    .order("board_letter", { ascending: true });

  if (!batchBoms || batchBoms.length === 0) {
    return NextResponse.json({ error: "No active BOMs in this batch" }, { status: 400 });
  }

  // Fetch ALL bom_lines for all active BOMs in the batch
  const bomIds = batchBoms.map((bb) => bb.bom_id);
  const { data: allLines, error: linesError } = await admin
    .from("bom_lines")
    .select("*")
    .in("bom_id", bomIds)
    .eq("is_dni", false)
    .order("line_number", { ascending: true });

  if (linesError) {
    return NextResponse.json({ error: "Failed to fetch BOM lines", details: linesError.message }, { status: 500 });
  }

  // Build a map from bom_id → board_letter
  const bomToBoard = new Map<string, string>();
  for (const bb of batchBoms) {
    bomToBoard.set(bb.bom_id, bb.board_letter);
  }

  // --- MERGE: Deduplicate by MPN across all boards ---
  // Key: uppercase MPN → merged line data
  const mergedMap = new Map<string, {
    mpn: string;
    cpc: string;
    description: string;
    manufacturer: string;
    bom_qty: number;
    board_refs: Map<string, number>;  // board_letter → qty on that board
    designators: string[];
    is_pcb: boolean;
  }>();

  let pcbLine: {
    mpn: string;
    cpc: string;
    description: string;
    manufacturer: string;
    bom_qty: number;
    board_refs: Map<string, number>;
    designators: string[];
    is_pcb: boolean;
  } | null = null;

  for (const line of allLines ?? []) {
    const boardLetter = bomToBoard.get(line.bom_id) ?? "?";

    // Handle PCB rows separately — don't merge across boards
    if (line.is_pcb) {
      if (!pcbLine) {
        pcbLine = {
          mpn: line.mpn ?? "",
          cpc: line.cpc ?? "",
          description: line.description ?? "Printed Circuit Board",
          manufacturer: line.manufacturer ?? "",
          bom_qty: line.quantity,
          board_refs: new Map([[boardLetter, line.quantity]]),
          designators: [line.reference_designator ?? "PCB1"],
          is_pcb: true,
        };
      }
      continue;
    }

    const mpnKey = (line.mpn ?? "").toUpperCase();
    if (!mpnKey) continue;

    const existing = mergedMap.get(mpnKey);
    if (existing) {
      existing.bom_qty += line.quantity;
      const currentBoardQty = existing.board_refs.get(boardLetter) ?? 0;
      existing.board_refs.set(boardLetter, currentBoardQty + line.quantity);
      if (line.reference_designator) {
        existing.designators.push(
          ...line.reference_designator.split(/,\s*/).filter(Boolean)
        );
      }
    } else {
      mergedMap.set(mpnKey, {
        mpn: line.mpn ?? "",
        cpc: line.cpc ?? "",
        description: line.description ?? "",
        manufacturer: line.manufacturer ?? "",
        bom_qty: line.quantity,
        board_refs: new Map([[boardLetter, line.quantity]]),
        designators: line.reference_designator
          ? line.reference_designator.split(/,\s*/).filter(Boolean)
          : [],
        is_pcb: false,
      });
    }
  }

  // Clear any existing batch lines (in case of re-merge)
  await admin.from("quote_batch_lines").delete().eq("batch_id", batchId);

  // Build quote_batch_lines from merged data
  const batchLines: Record<string, unknown>[] = [];
  let lineNumber = 1;

  // PCB row first (pinned at top)
  if (pcbLine) {
    const boardRefsStr = Array.from(pcbLine.board_refs.entries())
      .map(([letter, qty]) => `${letter}:${qty}`)
      .join(", ");
    batchLines.push({
      batch_id: batchId,
      line_number: 0,
      mpn: pcbLine.mpn,
      cpc: pcbLine.cpc,
      description: pcbLine.description,
      manufacturer: pcbLine.manufacturer,
      bom_qty: pcbLine.bom_qty,
      board_refs: boardRefsStr,
      reference_designators: pcbLine.designators.join(", "),
      is_pcb: true,
    });
  }

  // Sort by bom_qty DESC, then MPN ASC
  const sortedEntries = Array.from(mergedMap.values()).sort((a, b) => {
    if (b.bom_qty !== a.bom_qty) return b.bom_qty - a.bom_qty;
    return a.mpn.localeCompare(b.mpn);
  });

  for (const entry of sortedEntries) {
    // Natural sort designators
    const sortedDesignators = entry.designators.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    const boardRefsStr = Array.from(entry.board_refs.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, qty]) => `${letter}:${qty}`)
      .join(", ");

    batchLines.push({
      batch_id: batchId,
      line_number: lineNumber++,
      mpn: entry.mpn,
      cpc: entry.cpc,
      description: entry.description,
      manufacturer: entry.manufacturer,
      bom_qty: entry.bom_qty,
      board_refs: boardRefsStr,
      reference_designators: sortedDesignators.join(", "),
      is_pcb: false,
    });
  }

  // Insert all lines
  const { error: insertError } = await admin.from("quote_batch_lines").insert(batchLines);
  if (insertError) {
    return NextResponse.json(
      { error: "Failed to insert merged lines", details: insertError.message },
      { status: 500 }
    );
  }

  // Update batch status
  await admin
    .from("quote_batches")
    .update({ status: "merged", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  // Log
  await admin.from("quote_batch_log").insert({
    batch_id: batchId,
    action: "merged",
    old_status: "created",
    new_status: "merged",
    details: {
      total_bom_lines: allLines?.length ?? 0,
      unique_mpns: mergedMap.size,
      boards: batchBoms.map((b) => b.board_letter),
      has_pcb: pcbLine !== null,
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "merged",
    total_bom_lines: allLines?.length ?? 0,
    unique_components: mergedMap.size,
    boards: batchBoms.map((b) => b.board_letter),
    pcb_found: pcbLine !== null,
  });
}
