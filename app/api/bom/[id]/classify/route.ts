import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyBomLines } from "@/lib/mcode/classifier";

export async function POST(
  _request: Request,
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

  const { data: lines, error } = await supabase
    .from("bom_lines")
    .select("id, mpn, description, cpc, manufacturer, m_code_source")
    .eq("bom_id", bomId)
    .order("line_number", { ascending: true });

  if (error || !lines) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }

  // Only reclassify non-manually-set lines
  const toClassify = lines.filter((l) => l.m_code_source !== "manual");

  const results = await classifyBomLines(
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
    const result = results[i];
    await supabase
      .from("bom_lines")
      .update({
        m_code: result.m_code,
        m_code_confidence: result.confidence,
        m_code_source: result.source,
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
