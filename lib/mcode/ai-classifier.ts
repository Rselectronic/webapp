import Anthropic from "@anthropic-ai/sdk";
import type { MCode } from "./types";
import { recordAiCall } from "@/lib/ai/telemetry";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

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
  sub_category: string | null;
  features: string | null;
  attachment_method: string | null;
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

  const startedAt = Date.now();
  try {
    const anthropic = getClient();
    const prompt = `You are an electronics component database. For the given component, return ONLY these parameters in JSON format (use null for unknown values):
- mounting_type: one of "Through Hole", "Surface Mount", "Surface Mount, Through Hole", "PCB, Through Hole", "PCB, Surface Mount", "Chassis Mount", "Chassis, Stud Mount", "Panel Mount", "Panel, PCB Through Hole", or null
- length_mm: package length in millimeters (number), or null
- width_mm: package width in millimeters (number), or null
- package_case: package name (e.g. "0402", "SOIC-8", "TO-220", "SOT-23"), or null
- category: DigiKey top-level category (e.g. "Resistors", "Capacitors", "Integrated Circuits (ICs)", "Connectors, Interconnects", "Discrete Semiconductor Products", "Inductors, Coils, Chokes", "Crystals, Oscillators, Resonators", "Hardware, Fasteners, Accessories", "Cables, Wires - Management", "Development Boards, Kits, Programmers", "Switches", "RF/IF and RFID"), or null
- sub_category: DigiKey sub-category (e.g. "Chip Resistor - Surface Mount", "Tactile Switches", "Slide Switches", "Film Capacitors", "RF Shields", "Ferrite Cores", "Card Guides", "Board Supports", "Aluminum Electrolytic Capacitors"), or null
- features: component features if any (e.g. "Surface Mount", "Automotive AEC-Q200"), or null
- attachment_method: how the part attaches mechanically (e.g. "Bolt On", "Clip On", "Adhesive", "Solder"), or null

Component:
- MPN: ${mpn}
- Description: ${description}
- Manufacturer: ${manufacturer}

Respond with JSON only, no markdown, no backticks:
{"mounting_type": "...", "length_mm": 1.0, "width_mm": 0.5, "package_case": "0402", "category": "Resistors", "sub_category": "Chip Resistor - Surface Mount", "features": null, "attachment_method": null}`;

    const response = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    void recordAiCall({
      purpose: "mcode_classifier",
      model: CLASSIFIER_MODEL,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      latency_ms: Date.now() - startedAt,
      success: true,
      mpn,
      metadata: { description, manufacturer },
    });

    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(text);

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    const num = (v: unknown): number | null =>
      typeof v === "number" && isFinite(v) ? v : null;

    const mounting = str(parsed.mounting_type);
    const length = num(parsed.length_mm);
    const width = num(parsed.width_mm);
    const pkg = str(parsed.package_case);
    const cat = str(parsed.category);
    const subCat = str(parsed.sub_category);
    const features = str(parsed.features);
    const attachMethod = str(parsed.attachment_method);

    const reasoningBits: string[] = [];
    if (mounting) reasoningBits.push(`mounting=${mounting}`);
    if (length !== null && width !== null) reasoningBits.push(`${length}mm x ${width}mm`);
    if (pkg) reasoningBits.push(`pkg=${pkg}`);
    if (subCat) reasoningBits.push(`sub=${subCat}`);
    else if (cat) reasoningBits.push(`category=${cat}`);
    const reasoning = reasoningBits.length > 0 ? reasoningBits.join(", ") : "no parameters";

    return {
      mounting_type: mounting,
      length_mm: length,
      width_mm: width,
      package_case: pkg,
      category: cat,
      sub_category: subCat,
      features,
      attachment_method: attachMethod,
      reasoning,
    };
  } catch (err) {
    void recordAiCall({
      purpose: "mcode_classifier",
      model: CLASSIFIER_MODEL,
      latency_ms: Date.now() - startedAt,
      success: false,
      error_message: err instanceof Error ? err.message : String(err),
      mpn,
      metadata: { description, manufacturer },
    });
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
    sub_category: params.sub_category,
    features: params.features,
    attachment_method: params.attachment_method,
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
