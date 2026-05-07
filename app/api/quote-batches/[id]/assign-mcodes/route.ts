import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { classifyComponent, fetchKeywords } from "@/lib/mcode/classifier";

/**
 * POST /api/quote-batches/[id]/assign-mcodes
 *
 * Step 4 of the 11-button sequence: "Update MCode"
 * Runs the 3-layer classification pipeline on the MERGED component list.
 *
 * Critical: This runs on the deduplicated set, NOT on individual BOMs.
 * If an MPN appears on 3 boards, it's classified ONCE here.
 *
 * After this step, Piyush reviews the results and can override any M-code
 * via PATCH on individual quote_batch_lines (Step 5: "Add Manual MCode").
 * The UI must show all lines with their assigned M-codes and allow editing
 * BEFORE proceeding to extras calculation.
 *
 * Input: Batch must be in status "merged"
 * Output: Batch moves to "mcodes_assigned", lines updated with m_code fields
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

  // Validate batch status
  const { data: batch } = await admin
    .from("quote_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "merged") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Assign M-codes requires "merged". Run merge first.` },
      { status: 400 }
    );
  }

  // Fetch all non-PCB lines
  const { data: lines, error: linesError } = await admin
    .from("quote_batch_lines")
    .select("id, mpn, cpc, description, manufacturer, is_pcb")
    .eq("batch_id", batchId)
    .eq("is_pcb", false)
    .order("line_number", { ascending: true });

  if (linesError || !lines) {
    return NextResponse.json({ error: "Failed to fetch lines" }, { status: 500 });
  }

  // Pre-fetch keywords and component details ONCE for the entire batch
  // (Without this, Layer 1b keyword lookup was skipped entirely — causing
  // components with "0402" in description to miss the 0402 M-code keyword)
  const keywords = await fetchKeywords(admin);

  // Batch-fetch component details (dimensions, package, mounting type) for enrichment.
  // The components table is CPC-keyed (UNIQUE on cpc, manufacturer) — looking up by
  // MPN here returned nothing, so Layer-2 rule classification ran without enrichment.
  // The classifier's detailsMap is keyed on the same lookup key it uses internally
  // (cpc when available, mpn fallback), so build the map with the same precedence.
  const lookupKeys = [
    ...new Set(
      lines
        .map((l) => (l.cpc && l.cpc.trim() ? l.cpc : l.mpn))
        .filter((v): v is string => Boolean(v))
    ),
  ];
  const detailsMap = new Map<string, { mounting_type: string | null; package_case: string | null; category: string | null; length_mm: number | null; width_mm: number | null }>();
  if (lookupKeys.length > 0) {
    const { data: compData } = await admin
      .from("components")
      .select("cpc, mounting_type, package_case, category, length_mm, width_mm")
      .in("cpc", lookupKeys);
    for (const row of compData ?? []) {
      if (row.mounting_type || row.package_case || row.length_mm || row.width_mm) {
        detailsMap.set(row.cpc, {
          mounting_type: row.mounting_type,
          package_case: row.package_case,
          category: row.category,
          length_mm: row.length_mm,
          width_mm: row.width_mm,
        });
      }
    }
  }

  // Classify each unique component through the 3-layer pipeline
  let classified = 0;
  let unclassified = 0;
  let fromDatabase = 0;
  let fromRules = 0;
  let fromApi = 0;

  for (const line of lines) {
    const result = await classifyComponent(
      {
        mpn: line.mpn,
        description: line.description ?? "",
        cpc: line.cpc ?? "",
        manufacturer: line.manufacturer ?? "",
      },
      admin,
      keywords,
      detailsMap
    );

    const needsReview = !result.m_code || (result.confidence !== undefined && result.confidence < 0.85);

    await admin
      .from("quote_batch_lines")
      .update({
        m_code: result.m_code,
        m_code_confidence: result.confidence ?? null,
        m_code_source: result.source,
        m_code_final: result.m_code, // Will be overridden if human sets m_code_override
        m_code_reasoning: result.rule_id ?? null,
        needs_review: needsReview,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);

    if (result.m_code) {
      classified++;
      if (result.source === "database") fromDatabase++;
      else if (result.source === "rules") fromRules++;
      else if (result.source === "api") fromApi++;
    } else {
      unclassified++;
    }
  }

  // Update batch status
  await admin
    .from("quote_batches")
    .update({ status: "mcodes_assigned", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  // Log
  await admin.from("quote_batch_log").insert({
    batch_id: batchId,
    action: "mcodes_assigned",
    old_status: "merged",
    new_status: "mcodes_assigned",
    details: {
      total: lines.length,
      classified,
      unclassified,
      from_database: fromDatabase,
      from_rules: fromRules,
      from_api: fromApi,
      needs_review: unclassified,
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "mcodes_assigned",
    total: lines.length,
    classified,
    unclassified,
    breakdown: { database: fromDatabase, rules: fromRules, api: fromApi },
    needs_review: unclassified,
    message: unclassified > 0
      ? `${unclassified} component(s) need manual M-code assignment. Review and override before proceeding.`
      : "All components classified. Review M-codes, then proceed to extras calculation.",
  });
}
