import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyBomLines } from "@/lib/mcode/classifier";
import { classifyWithAI } from "@/lib/mcode/ai-classifier";

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
  // -----------------------------------------------------------
  if (mode === "ai-batch") {
    const unclassified = lines.filter(
      (l) => !l.m_code && !l.is_pcb && !l.is_dni && l.mpn
    );

    let classifiedCount = 0;
    const results: {
      mpn: string;
      m_code: string | null;
      confidence: number;
    }[] = [];

    for (const line of unclassified) {
      const result = await classifyWithAI(
        line.mpn ?? "",
        line.description ?? "",
        line.manufacturer ?? ""
      );
      if (result?.m_code && result.confidence >= 0.7) {
        await supabase
          .from("bom_lines")
          .update({
            m_code: result.m_code,
            m_code_source: "ai",
            m_code_confidence: result.confidence,
          })
          .eq("id", line.id);
        classifiedCount++;
        results.push({
          mpn: line.mpn ?? "",
          m_code: result.m_code,
          confidence: result.confidence,
        });
      } else {
        results.push({
          mpn: line.mpn ?? "",
          m_code: null,
          confidence: result?.confidence ?? 0,
        });
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
  // Default mode: rule-based classification
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
