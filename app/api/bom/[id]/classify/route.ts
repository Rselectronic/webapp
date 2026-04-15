import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyBomLines } from "@/lib/mcode/classifier";
import { classifyBatchWithAI } from "@/lib/mcode/ai-classifier";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode as string | undefined;

  const { data: lines, error } = await supabase
    .from("bom_lines")
    .select(
      "id, mpn, description, cpc, manufacturer, m_code, m_code_source, is_pcb, is_dni"
    )
    .eq("bom_id", bomId)
    .order("line_number", { ascending: true });

  if (error || !lines) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }

  // -----------------------------------------------------------
  // AI batch mode: classify unclassified lines using Claude AI
  // 10 components in parallel per batch instead of sequential
  // -----------------------------------------------------------
  if (mode === "ai-batch") {
    const unclassified = lines.filter(
      (l) => !l.m_code && !l.is_pcb && !l.is_dni && l.mpn
    );

    // Parallel AI classification (10 at a time)
    const aiResults = await classifyBatchWithAI(
      unclassified.map((l) => ({
        mpn: l.mpn ?? "",
        description: l.description ?? "",
        manufacturer: l.manufacturer ?? "",
      }))
    );

    // Incremental DB updates: update each component immediately as it's classified
    // This allows the polling frontend to see real progress
    let classifiedCount = 0;
    const results: { mpn: string; m_code: string | null; confidence: number }[] = [];

    for (let i = 0; i < unclassified.length; i++) {
      const result = aiResults[i];
      if (result?.m_code && result.confidence >= 0.7) {
        await supabase
          .from("bom_lines")
          .update({
            m_code: result.m_code,
            m_code_source: "ai",
            m_code_confidence: result.confidence,
            m_code_reasoning: `AI: ${result.reasoning}`,
          })
          .eq("id", unclassified[i].id);
        classifiedCount++;
        results.push({ mpn: unclassified[i].mpn ?? "", m_code: result.m_code, confidence: result.confidence });
      } else {
        results.push({ mpn: unclassified[i].mpn ?? "", m_code: null, confidence: result?.confidence ?? 0 });
      }
    }

    return NextResponse.json({
      total_unclassified: unclassified.length,
      classified_count: classifiedCount,
      still_needs_review: unclassified.length - classifiedCount,
      results,
    });
  }

  // -----------------------------------------------------------
  // Default mode: rule-based classification (already fast with batched lookups)
  // -----------------------------------------------------------
  const toClassify = lines.filter((l) => l.m_code_source !== "manual");

  const ruleResults = await classifyBomLines(
    toClassify.map((l) => ({
      mpn: l.mpn ?? "",
      description: l.description ?? "",
      cpc: l.cpc ?? "",
      manufacturer: l.manufacturer ?? "",
    })),
    supabase
  );

  let classified = 0;
  let unclassified = 0;

  // Incremental DB updates: update each component immediately as it's classified
  // This allows the polling frontend to see real progress in the progress bar
  for (let i = 0; i < toClassify.length; i++) {
    const result = ruleResults[i];
    await supabase
      .from("bom_lines")
      .update({
        m_code: result.m_code,
        m_code_confidence: result.confidence,
        m_code_source: result.source,
        m_code_reasoning: result.rule_id ?? null,
      })
      .eq("id", toClassify[i].id);
    if (result.m_code) classified++;
    else unclassified++;
  }

  const manual = lines.length - toClassify.length;

  return NextResponse.json({
    total: lines.length,
    classified: classified + manual,
    unclassified,
    manual_kept: manual,
  });
}
