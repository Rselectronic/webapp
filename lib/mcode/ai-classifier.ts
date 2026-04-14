import Anthropic from "@anthropic-ai/sdk";
import type { MCode } from "./types";

/**
 * Component parameters as fetched from Claude (read from its training knowledge).
 *
 * Piyush's feedback (2026-04-14): the AI must NOT do generic M-code classification.
 * Its only job is to return physical parameters for a component (mounting_type,
 * dimensions, package, category). The actual M-code assignment is done by the
 * rules engine using the VBA algorithm in mod_OthF_Digikey_Parameters.bas.
 */
export interface ComponentParams {
  mounting_type: string | null;
  length_mm: number | null;
  width_mm: number | null;
  package_case: string | null;
  category: string | null;
  reasoning: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

/**
 * Ask Claude to return the physical parameters of a component.
 * Claude acts as a "components database lookup", not a classifier.
 */
export async function fetchComponentParams(
  mpn: string,
  description: string,
  manufacturer: string
): Promise<ComponentParams | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = getClient();
    const prompt = `You are an electronics component database. For the given component, return ONLY these parameters in JSON format:
- mounting_type: one of "Through Hole", "Surface Mount", "Surface Mount, Through Hole", or null if unknown
- length_mm: package length in millimeters (number), or null
- width_mm: package width in millimeters (number), or null
- package_case: package name (e.g. "0402", "SOIC-8", "TO-220", "SOT-23"), or null
- category: broad category ("Resistor", "Capacitor", "IC", "Connector", "Diode", "Inductor", "Crystal", "Transformer", "Fuse", "Mechanical", "Cable"), or null

Component:
- MPN: ${mpn}
- Description: ${description}
- Manufacturer: ${manufacturer}

Respond with JSON only, no markdown, no backticks:
{"mounting_type": "...", "length_mm": 1.0, "width_mm": 0.5, "package_case": "0402", "category": "Resistor"}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(text);

    const mounting = typeof parsed.mounting_type === "string" && parsed.mounting_type.trim() !== ""
      ? parsed.mounting_type.trim()
      : null;
    const length = typeof parsed.length_mm === "number" && isFinite(parsed.length_mm) ? parsed.length_mm : null;
    const width = typeof parsed.width_mm === "number" && isFinite(parsed.width_mm) ? parsed.width_mm : null;
    const pkg = typeof parsed.package_case === "string" && parsed.package_case.trim() !== ""
      ? parsed.package_case.trim()
      : null;
    const cat = typeof parsed.category === "string" && parsed.category.trim() !== ""
      ? parsed.category.trim()
      : null;

    const reasoningBits: string[] = [];
    if (mounting) reasoningBits.push(`mounting=${mounting}`);
    if (length !== null && width !== null) reasoningBits.push(`${length}mm x ${width}mm`);
    if (pkg) reasoningBits.push(`pkg=${pkg}`);
    if (cat) reasoningBits.push(`category=${cat}`);
    const reasoning = reasoningBits.length > 0 ? reasoningBits.join(", ") : "no parameters";

    return {
      mounting_type: mounting,
      length_mm: length,
      width_mm: width,
      package_case: pkg,
      category: cat,
      reasoning,
    };
  } catch (err) {
    console.error("[AI PARAMS FETCH]", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch component params for many components in parallel batches.
 * 10 parallel calls × ~1.5s each = ~1.5s per batch instead of 15s sequential.
 */
const BATCH_SIZE = 10;

export async function fetchComponentParamsBatch(
  components: { mpn: string; description: string; manufacturer: string }[]
): Promise<(ComponentParams | null)[]> {
  const results: (ComponentParams | null)[] = [];
  for (let i = 0; i < components.length; i += BATCH_SIZE) {
    const batch = components.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((c) => fetchComponentParams(c.mpn, c.description, c.manufacturer))
    );
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Backwards-compatible wrappers
// ---------------------------------------------------------------------------
//
// Callers in app/api/bom/[id]/classify/route.ts and app/api/chat/route.ts still
// use classifyWithAI / classifyBatchWithAI and expect { m_code, confidence,
// reasoning }. Under the hood these now call fetchComponentParams and run the
// VBA algorithm (via applyVbaAlgorithm in lib/mcode/classifier.ts).
//
// To avoid a circular dependency between this file and classifier.ts we accept
// the algorithm as an injected callback at call time in classifier.ts. Here we
// just export the thin facade that the rest of the app imports.
// ---------------------------------------------------------------------------

import { applyVbaAlgorithm } from "./vba-algorithm";

export async function classifyWithAI(
  mpn: string,
  description: string,
  manufacturer: string,
  _packageCase?: string
): Promise<{ m_code: MCode; confidence: number; reasoning: string } | null> {
  const params = await fetchComponentParams(mpn, description, manufacturer);
  if (!params) return null;

  const verdict = applyVbaAlgorithm({
    description,
    mounting_type: params.mounting_type,
    length_mm: params.length_mm,
    width_mm: params.width_mm,
    package_case: params.package_case,
    category: params.category,
  });
  if (!verdict) return null;

  return {
    m_code: verdict.m_code as MCode,
    confidence: verdict.confidence,
    reasoning: `AI: ${params.reasoning} → ${verdict.reasoning}`,
  };
}

export async function classifyBatchWithAI(
  components: { mpn: string; description: string; manufacturer: string; packageCase?: string }[]
): Promise<({ m_code: MCode; confidence: number; reasoning: string } | null)[]> {
  const paramResults = await fetchComponentParamsBatch(
    components.map((c) => ({ mpn: c.mpn, description: c.description, manufacturer: c.manufacturer }))
  );

  return paramResults.map((params, i) => {
    if (!params) return null;
    const verdict = applyVbaAlgorithm({
      description: components[i].description,
      mounting_type: params.mounting_type,
      length_mm: params.length_mm,
      width_mm: params.width_mm,
      package_case: params.package_case,
      category: params.category,
    });
    if (!verdict) return null;
    return {
      m_code: verdict.m_code as MCode,
      confidence: verdict.confidence,
      reasoning: `AI: ${params.reasoning} → ${verdict.reasoning}`,
    };
  });
}
