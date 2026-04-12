import Anthropic from "@anthropic-ai/sdk";
import type { MCode } from "./types";

const MCODE_DEFINITIONS = `M-Code types for PCB assembly:
- 0201: Ultra-tiny passives (0.4-0.99mm L x 0.2-0.48mm W)
- 0402: Small passives (1.0-1.49mm L x 0.49-0.79mm W)
- CP: Chip Package - standard SMT passives like resistors, capacitors, LEDs, diodes (1.5-3.79mm). ~59% of components.
- CPEXP: Expanded SMT - larger SMT like SO8, SOT-89, 8-pin packages (3.8-4.29mm)
- IP: IC Package - large SMT ICs like QFP, BGA, TSSOP, LQFP (4.3-25mm). ~15% of components.
- TH: Through-Hole - components with legs that go through PCB holes. Connectors, headers, large capacitors.
- MANSMT: Manual SMT - surface mount that needs hand soldering (DPAK, large thermal pads)
- MEC: Mechanical - standoffs, heatsinks, brackets, screws
- Accs: Accessories - labels, tapes, clips
- CABLE: Cables/wiring
- DEV B: Development/evaluation boards`;

const VALID_MCODES = new Set<string>([
  "0201", "0402", "CP", "CPEXP", "IP", "TH",
  "MANSMT", "MEC", "Accs", "CABLE", "DEV B",
]);

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export async function classifyWithAI(
  mpn: string,
  description: string,
  manufacturer: string,
  packageCase?: string
): Promise<{ m_code: MCode; confidence: number; reasoning: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = getClient();
    const prompt = `You are an electronics manufacturing expert. Classify this component into exactly ONE M-Code.

Component:
- MPN: ${mpn}
- Description: ${description}
- Manufacturer: ${manufacturer}
${packageCase ? `- Package/Case: ${packageCase}` : ""}

VALID M-Codes (you MUST use one of these exact strings):
- "CP" = Chip Package: standard SMT passives — resistors, capacitors, LEDs, diodes, small transistors in packages like 0603, 0805, 1206, SOD-323, SOT-23
- "0402" = 0402-size passives only
- "0201" = 0201-size passives only
- "CPEXP" = Expanded Chip: larger SMT like SO8, SOT-89, MSOP-8, SSOP
- "IP" = IC Package: large ICs — QFP, BGA, TSSOP-48, LQFP, microcontrollers, FPGAs, voltage regulators in large packages
- "TH" = Through-Hole: connectors, headers, DIP packages, electrolytic caps, transformers
- "MANSMT" = Manual SMT: DPAK, D2PAK, large thermal pads, RF modules
- "MEC" = Mechanical: standoffs, heatsinks, brackets, screws, spacers
- "Accs" = Accessories: labels, tapes, clips
- "CABLE" = Cables and wiring
- "DEV B" = Development boards

Respond with ONLY a raw JSON object, NO markdown, NO backticks:
{"m_code": "CP", "confidence": 0.95, "reasoning": "one sentence"}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(text);

    if (
      parsed.m_code &&
      VALID_MCODES.has(parsed.m_code) &&
      typeof parsed.confidence === "number"
    ) {
      return {
        m_code: parsed.m_code as MCode,
        confidence: Math.min(parsed.confidence, 0.95),
        reasoning: parsed.reasoning ?? "",
      };
    }
    return null;
  } catch (err) {
    console.error("[AI CLASSIFIER]", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Classify multiple components in parallel batches.
 * Processes BATCH_SIZE components concurrently instead of one at a time.
 * 10 parallel calls × 1.5s each = ~1.5s per batch instead of 15s sequential.
 */
const BATCH_SIZE = 10;

export async function classifyBatchWithAI(
  components: { mpn: string; description: string; manufacturer: string; packageCase?: string }[]
): Promise<({ m_code: MCode; confidence: number; reasoning: string } | null)[]> {
  const results: ({ m_code: MCode; confidence: number; reasoning: string } | null)[] = [];

  for (let i = 0; i < components.length; i += BATCH_SIZE) {
    const batch = components.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((c) => classifyWithAI(c.mpn, c.description, c.manufacturer, c.packageCase))
    );
    results.push(...batchResults);
  }

  return results;
}
