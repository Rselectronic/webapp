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
      "id, mpn, description, cpc, manufacturer, quantity, m_code, m_code_source, is_pcb, is_dni, pin_count"
    )
    .eq("bom_id", bomId)
    .order("line_number", { ascending: true });

  if (error || !lines) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }

  // Lookup the BOM's customer — the classifier uses it to consult that
  // customer's per-CPC manual M-Code overrides BEFORE falling through to the
  // global sheet and the components cache.
  const { data: bomRow } = await supabase
    .from("boms")
    .select("customer_id")
    .eq("id", bomId)
    .maybeSingle();
  const customerId = bomRow?.customer_id ?? undefined;

  // Qty-0 lines are effectively not-installed components. They stay in the
  // BOM so the production print-out shows the empty designators, but they
  // must not be M-coded (they don't go through any machine / manual step).
  // Also clear any stale m_code that was set before the line was zeroed out,
  // so the UI stays consistent.
  const zeroQtyLinesNeedingClear = lines.filter(
    (l) => l.quantity === 0 && l.m_code != null && !l.is_pcb
  );
  for (const l of zeroQtyLinesNeedingClear) {
    await supabase
      .from("bom_lines")
      .update({
        m_code: null,
        m_code_confidence: null,
        m_code_source: null,
        m_code_reasoning: null,
      })
      .eq("id", l.id);
  }

  // -----------------------------------------------------------
  // AI batch mode: classify unclassified lines using Claude AI
  // 10 components in parallel per batch instead of sequential
  // -----------------------------------------------------------
  if (mode === "ai-batch") {
    const unclassified = lines.filter(
      (l) => !l.m_code && !l.is_pcb && !l.is_dni && l.quantity > 0 && l.mpn
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
        // Auto-flip is_pcb when m_code=APCB so every "skip PCBs" filter in
        // the codebase can rely on a single predicate.
        const updates: Record<string, unknown> = {
          m_code: result.m_code,
          m_code_source: "ai",
          m_code_confidence: result.confidence,
          m_code_reasoning: `AI: ${result.reasoning}`,
        };
        if (result.m_code === "APCB") updates.is_pcb = true;
        await supabase
          .from("bom_lines")
          .update(updates)
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
  // Skip qty=0 lines: they're not-installed placeholders kept only for the
  // production print-out to show which designators stay empty.
  const toClassify = lines.filter(
    (l) => l.m_code_source !== "manual" && l.quantity > 0
  );

  const ruleResults = await classifyBomLines(
    toClassify.map((l) => ({
      mpn: l.mpn ?? "",
      description: l.description ?? "",
      cpc: l.cpc ?? "",
      manufacturer: l.manufacturer ?? "",
    })),
    supabase,
    customerId
  );

  let classified = 0;
  let unclassified = 0;

  // Batch-load through-hole pin counts for every CPC on this BOM that exists
  // in the per-customer procurement log. Lines that end up classified TH
  // will get their pin_count seeded from here, saving the operator the work
  // of re-typing what was already set on a previous BOM for the same CPC.
  const pinsByCpc = new Map<string, number>();
  if (customerId) {
    const cpcs = [
      ...new Set(
        toClassify
          .map((l) => l.cpc)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
      ),
    ];
    if (cpcs.length > 0) {
      const { data: partsRows } = await supabase
        .from("customer_parts")
        .select("cpc, through_hole_pins")
        .eq("customer_id", customerId)
        .in("cpc", cpcs);
      for (const row of partsRows ?? []) {
        if (row.through_hole_pins != null) {
          pinsByCpc.set(row.cpc, row.through_hole_pins);
        }
      }
    }
  }

  // Parallel DB updates. The old loop awaited each UPDATE sequentially, so a
  // 60-line BOM took 60 × one round-trip of latency (~6s on a typical
  // connection). Running them concurrently keeps total wall time at roughly
  // ONE round-trip for the whole batch — well under the 2–3s target.
  // Chunk size caps the in-flight count so we don't overwhelm the pool on
  // huge BOMs; 25 is conservatively under Supabase's default connection cap.
  const CHUNK = 25;
  for (let i = 0; i < toClassify.length; i += CHUNK) {
    const slice = toClassify.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((line, sliceIdx) => {
        const result = ruleResults[i + sliceIdx];
        const updates: Record<string, unknown> = {
          m_code: result.m_code,
          m_code_confidence: result.confidence,
          m_code_source: result.source,
          m_code_reasoning: result.rule_id ?? null,
        };
        if (result.m_code === "APCB") updates.is_pcb = true;
        if (
          result.m_code === "TH" &&
          line.cpc &&
          pinsByCpc.has(line.cpc)
        ) {
          const existingPin =
            (line as { pin_count?: number | null }).pin_count ?? null;
          if (existingPin == null) {
            updates.pin_count = pinsByCpc.get(line.cpc);
          }
        }
        if (result.m_code) classified++;
        else unclassified++;
        return supabase.from("bom_lines").update(updates).eq("id", line.id);
      })
    );
  }

  const manual = lines.length - toClassify.length;

  return NextResponse.json({
    total: lines.length,
    classified: classified + manual,
    unclassified,
    manual_kept: manual,
  });
}
