import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/quote-batches/[id]/send-back
 *
 * Steps 10-11 of the 11-button sequence: "Send Data to BOM" + quote generation
 *
 * This is the SPLIT phase of the merge-split pattern:
 *   1. Writes M-codes back to individual bom_lines (so each BOM has its classifications)
 *   2. Creates individual quote records for each GMP in the batch
 *   3. Each quote gets per-tier pricing calculated from the batch lines
 *
 * This is a trust transfer (BUILD_PROMPT.md §2.5) — the user is saying:
 * "I have verified the pricing. Push it back to individual boards."
 *
 * Input: Batch must be in status "priced"
 * Output: Batch moves to "sent_back", bom_lines updated, quotes created
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
    .from("quote_batches")
    .select("*, customers(code)")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "priced") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Send back requires "priced".` },
      { status: 400 }
    );
  }

  // Get batch BOMs and batch lines
  const { data: batchBoms } = await admin
    .from("quote_batch_boms")
    .select("bom_id, gmp_id, board_letter, pcb_cost_per_unit")
    .eq("batch_id", batchId)
    .eq("is_active", true)
    .order("board_letter", { ascending: true });

  const { data: batchLines } = await admin
    .from("quote_batch_lines")
    .select("*")
    .eq("batch_id", batchId)
    .order("line_number", { ascending: true });

  if (!batchBoms?.length || !batchLines?.length) {
    return NextResponse.json({ error: "Missing batch data" }, { status: 500 });
  }

  // --- STEP 1: Write M-codes back to individual bom_lines ---
  // For each batch line, find the corresponding bom_lines (by MPN) and update them
  for (const batchLine of batchLines) {
    if (batchLine.is_pcb) continue;

    const bomIds = batchBoms.map((bb) => bb.bom_id);
    await admin
      .from("bom_lines")
      .update({
        m_code: batchLine.m_code_final,
        m_code_confidence: batchLine.m_code_confidence,
        m_code_source: batchLine.m_code_override ? "manual" : batchLine.m_code_source,
      })
      .in("bom_id", bomIds)
      .eq("mpn", batchLine.mpn);
  }

  // --- STEP 2: Generate individual quotes per GMP ---
  // Generate quote number: QT-YYMM-NNN
  const now = new Date();
  const prefix = `QT-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { count: existingCount } = await admin
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .like("quote_number", `${prefix}-%`);
  let seqNum = (existingCount ?? 0) + 1;

  const createdQuotes: { quote_number: string; gmp_id: string; board_letter: string }[] = [];

  for (const bb of batchBoms) {
    const quoteNumber = `${prefix}-${String(seqNum++).padStart(3, "0")}`;

    // Calculate per-tier totals for THIS board
    // Filter batch lines to only those that appear on this board
    const boardLetter = bb.board_letter;
    let componentTotal1 = 0, componentTotal2 = 0, componentTotal3 = 0, componentTotal4 = 0;
    let smtPlacements = 0, thPlacements = 0, mansmtPlacements = 0;
    let cpFeederCount = 0, ipFeederCount = 0;
    let cpPlacementSum = 0, ipPlacementSum = 0;
    let totalUniqueLines = 0;

    for (const line of batchLines) {
      if (line.is_pcb || !line.board_refs) continue;

      // Parse board_refs "A:4, B:2, C:4" to check if this board uses this component
      const refs = line.board_refs.split(",").map((r: string) => r.trim());
      const boardRef = refs.find((r: string) => r.startsWith(`${boardLetter}:`));
      if (!boardRef) continue; // This component isn't on this board

      const qtyOnBoard = parseInt(boardRef.split(":")[1], 10) || 0;
      if (qtyOnBoard > 0) totalUniqueLines++;

      // Accumulate extended prices (proportional to this board's share)
      const proportion = line.bom_qty > 0 ? qtyOnBoard / line.bom_qty : 0;
      if (line.extended_price_1) componentTotal1 += line.extended_price_1 * proportion;
      if (line.extended_price_2) componentTotal2 += line.extended_price_2 * proportion;
      if (line.extended_price_3) componentTotal3 += line.extended_price_3 * proportion;
      if (line.extended_price_4) componentTotal4 += line.extended_price_4 * proportion;

      // Count placements for assembly cost
      const mCode = line.m_code_final ?? "";
      if (mCode === "MANSMT") {
        mansmtPlacements += qtyOnBoard;
      } else if (mCode === "TH") {
        thPlacements += qtyOnBoard;
      } else if (["CP", "CPEXP", "0402", "0201"].includes(mCode)) {
        smtPlacements += qtyOnBoard;
        cpFeederCount++;
        cpPlacementSum += qtyOnBoard;
      } else if (mCode === "IP") {
        smtPlacements += qtyOnBoard;
        ipFeederCount++;
        ipPlacementSum += qtyOnBoard;
      }
    }

    const pcbCost = bb.pcb_cost_per_unit ?? 0;
    const smtRate = batch.smt_cost_per_placement ?? 0.35;
    const thRate = batch.th_cost_per_placement ?? 0.75;
    const mansmtRate = 1.25; // MANSMT default rate
    const assemblyCostPerBoard = (smtPlacements * smtRate) + (thPlacements * thRate) + (mansmtPlacements * mansmtRate);
    const nre = batch.nre_charge ?? 350;
    const totalSmtPlacements = cpPlacementSum + ipPlacementSum + mansmtPlacements;

    // Build per-tier pricing in the standard PricingTier[] format
    // so the PDF generator and quote detail page work without normalization
    const tierData = [
      { qty: batch.qty_1, components: componentTotal1 },
      { qty: batch.qty_2, components: componentTotal2 },
      { qty: batch.qty_3, components: componentTotal3 },
      { qty: batch.qty_4, components: componentTotal4 },
    ];

    const tiers = [];
    for (const tier of tierData) {
      if (!tier.qty) continue;
      const pcbTotal = pcbCost * tier.qty;
      const assemblyTotal = assemblyCostPerBoard * tier.qty;
      const smtPlacementCost = +(smtPlacements * smtRate * tier.qty).toFixed(2);
      const thPlacementCost = +(thPlacements * thRate * tier.qty).toFixed(2);
      const mansmtPlacementCost = +(mansmtPlacements * mansmtRate * tier.qty).toFixed(2);
      const totalPlacementCost = +(smtPlacementCost + thPlacementCost + mansmtPlacementCost).toFixed(2);
      const total = tier.components + pcbTotal + assemblyTotal + nre;
      tiers.push({
        board_qty: tier.qty,
        component_cost: +tier.components.toFixed(2),
        pcb_cost: +pcbTotal.toFixed(2),
        assembly_cost: +assemblyTotal.toFixed(2),
        nre_charge: nre,
        shipping: 0,
        subtotal: +total.toFixed(2),
        per_unit: +(total / tier.qty).toFixed(2),
        smt_placements: smtPlacements,
        th_placements: thPlacements,
        mansmt_placements: mansmtPlacements,
        components_with_price: 0,
        components_missing_price: 0,
        labour: {
          smt_placement_cost: smtPlacementCost,
          th_placement_cost: thPlacementCost,
          mansmt_placement_cost: mansmtPlacementCost,
          total_placement_cost: totalPlacementCost,
          setup_cost: 0,
          programming_cost: 0,
          total_labour_cost: totalPlacementCost,
          nre_programming: 0,
          nre_stencil: 0,
          nre_setup: 0,
          nre_pcb_fab: 0,
          nre_misc: 0,
          nre_total: nre,
          total_unique_lines: totalUniqueLines,
          total_smt_placements: totalSmtPlacements,
          cp_feeder_count: cpFeederCount,
          ip_feeder_count: ipFeederCount,
          cp_placement_sum: cpPlacementSum,
          ip_placement_sum: ipPlacementSum,
          mansmt_count: mansmtPlacements,
          th_placement_sum: thPlacements,
          time_model_used: false,
          assembly_time_hours: 0,
          smt_time_hours: 0,
          th_time_hours: 0,
          mansmt_time_hours: 0,
          setup_time_hours_computed: 0,
          labour_cost: totalPlacementCost,
          machine_cost: 0,
        },
      });
    }
    const pricing = { tiers, warnings: [] as string[] };

    // Create the quote
    const { error: quoteError } = await admin.from("quotes").insert({
      quote_number: quoteNumber,
      customer_id: batch.customer_id,
      gmp_id: bb.gmp_id,
      bom_id: bb.bom_id,
      quote_batch_id: batchId,
      status: "draft",
      quantities: { qty_1: batch.qty_1, qty_2: batch.qty_2, qty_3: batch.qty_3, qty_4: batch.qty_4 },
      pricing,
      component_markup: batch.component_markup_pct,
      pcb_cost_per_unit: pcbCost,
      assembly_cost: assemblyCostPerBoard,
      nre_charge: nre,
      smt_rate: smtRate,
      labour_rate: thRate,
      validity_days: 30,
      created_by: user.id,
    });

    if (quoteError) {
      console.error(`[SEND-BACK] Failed to create quote ${quoteNumber}:`, quoteError);
    } else {
      createdQuotes.push({ quote_number: quoteNumber, gmp_id: bb.gmp_id, board_letter: boardLetter });
    }
  }

  // Update batch status
  await admin
    .from("quote_batches")
    .update({ status: "sent_back", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  // Log
  await admin.from("quote_batch_log").insert({
    batch_id: batchId,
    action: "sent_back",
    old_status: "priced",
    new_status: "sent_back",
    details: {
      quotes_created: createdQuotes.length,
      quotes: createdQuotes,
      mcodes_written_back: batchLines.filter((l) => !l.is_pcb).length,
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "sent_back",
    quotes_created: createdQuotes.length,
    quotes: createdQuotes,
    message: `${createdQuotes.length} quote(s) created as drafts. Review each quote, generate PDFs, and send to customer.`,
  });
}
