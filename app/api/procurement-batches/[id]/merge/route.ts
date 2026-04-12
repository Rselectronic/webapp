import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/procurement-batches/[id]/merge
 *
 * Merge components across all procurements in the batch.
 * Same MPN from different procurements → combined into one line with summed quantities.
 *
 * This is the equivalent of the MasterSheet merge in the DM File,
 * but for ORDERING (cycle 2) rather than QUOTING (cycle 1).
 *
 * Input: Batch must be in status "created"
 * Output: Batch moves to "merged", procurement_batch_lines populated
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
    .from("procurement_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.status !== "created") {
    return NextResponse.json(
      { error: `Batch is in status "${batch.status}". Merge requires status "created".` },
      { status: 400 }
    );
  }

  // Get all procurement items in this batch
  const { data: batchItems } = await admin
    .from("procurement_batch_items")
    .select("procurement_id, board_letter")
    .eq("batch_id", batchId)
    .order("board_letter", { ascending: true });

  if (!batchItems || batchItems.length === 0) {
    return NextResponse.json({ error: "No procurements in this batch" }, { status: 400 });
  }

  // Fetch ALL procurement_lines for all procurements in the batch
  const procIds = batchItems.map((bi) => bi.procurement_id);
  const { data: allLines, error: linesError } = await admin
    .from("procurement_lines")
    .select("id, procurement_id, mpn, description, m_code, qty_needed, qty_extra, supplier, supplier_pn, unit_price, is_bg, order_status")
    .in("procurement_id", procIds)
    .order("created_at", { ascending: true });

  if (linesError) {
    return NextResponse.json({ error: "Failed to fetch procurement lines", details: linesError.message }, { status: 500 });
  }

  // Build a map from procurement_id → board_letter
  const procToBoard = new Map<string, string>();
  for (const bi of batchItems) {
    procToBoard.set(bi.procurement_id, bi.board_letter);
  }

  // --- MERGE: Deduplicate by MPN across all procurements ---
  const mergedMap = new Map<string, {
    mpn: string;
    cpc: string;
    description: string;
    manufacturer: string;
    m_code: string;
    individual_qty: number;
    original_extras: number;
    procurement_refs: Map<string, number>; // board_letter → qty_needed
    source_line_ids: string[];
    supplier: string | null;
    supplier_pn: string | null;
    unit_price: number | null;
    is_bg: boolean;
  }>();

  for (const line of allLines ?? []) {
    const boardLetter = procToBoard.get(line.procurement_id) ?? "?";
    const mpnKey = (line.mpn ?? "").toUpperCase();
    if (!mpnKey) continue;

    const existing = mergedMap.get(mpnKey);
    if (existing) {
      existing.individual_qty += line.qty_needed ?? 0;
      existing.original_extras += line.qty_extra ?? 0;
      const currentRef = existing.procurement_refs.get(boardLetter) ?? 0;
      existing.procurement_refs.set(boardLetter, currentRef + (line.qty_needed ?? 0));
      existing.source_line_ids.push(line.id);
      // Keep cheapest supplier price
      if (line.unit_price != null) {
        if (existing.unit_price == null || line.unit_price < existing.unit_price) {
          existing.supplier = line.supplier;
          existing.supplier_pn = line.supplier_pn;
          existing.unit_price = line.unit_price;
        }
      }
      // If any source is BG, mark as BG
      if (line.is_bg) existing.is_bg = true;
    } else {
      mergedMap.set(mpnKey, {
        mpn: line.mpn ?? "",
        cpc: line.mpn ?? "",
        description: line.description ?? "",
        manufacturer: "",
        m_code: line.m_code ?? "",
        individual_qty: line.qty_needed ?? 0,
        original_extras: line.qty_extra ?? 0,
        procurement_refs: new Map([[boardLetter, line.qty_needed ?? 0]]),
        source_line_ids: [line.id],
        supplier: line.supplier ?? null,
        supplier_pn: line.supplier_pn ?? null,
        unit_price: line.unit_price != null ? Number(line.unit_price) : null,
        is_bg: line.is_bg ?? false,
      });
    }
  }

  // Clear any existing batch lines (in case of re-merge)
  await admin.from("procurement_batch_lines").delete().eq("batch_id", batchId);

  // Build procurement_batch_lines from merged data
  const batchLines: Record<string, unknown>[] = [];
  let lineNumber = 1;

  // Sort by individual_qty DESC, then MPN ASC
  const sortedEntries = Array.from(mergedMap.values()).sort((a, b) => {
    if (b.individual_qty !== a.individual_qty) return b.individual_qty - a.individual_qty;
    return a.mpn.localeCompare(b.mpn);
  });

  for (const entry of sortedEntries) {
    const procRefsStr = Array.from(entry.procurement_refs.entries())
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
      m_code: entry.m_code,
      individual_qty: entry.individual_qty,
      original_extras: entry.original_extras,
      combined_extras: 0,   // Calculated in next step
      extras_savings: 0,
      order_qty: entry.individual_qty, // Updated after extras calculation
      procurement_refs: procRefsStr,
      source_line_ids: entry.source_line_ids,
      supplier: entry.supplier,
      supplier_pn: entry.supplier_pn,
      unit_price: entry.unit_price,
      extended_price: entry.unit_price ? +(entry.unit_price * entry.individual_qty).toFixed(2) : null,
      is_bg: entry.is_bg,
    });
  }

  // Insert all lines
  const { error: insertError } = await admin.from("procurement_batch_lines").insert(batchLines);
  if (insertError) {
    return NextResponse.json(
      { error: "Failed to insert merged lines", details: insertError.message },
      { status: 500 }
    );
  }

  // Update batch status and stats
  await admin
    .from("procurement_batches")
    .update({
      status: "merged",
      total_unique_mpns: mergedMap.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batchId,
    action: "merged",
    old_status: "created",
    new_status: "merged",
    details: {
      total_procurement_lines: allLines?.length ?? 0,
      unique_mpns: mergedMap.size,
      procurements: batchItems.map((b) => b.board_letter),
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "merged",
    total_procurement_lines: allLines?.length ?? 0,
    unique_components: mergedMap.size,
    procurements: batchItems.map((b) => b.board_letter),
  });
}
