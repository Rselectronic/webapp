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
    const prompt = `Classify this electronic component into one M-Code for PCB assembly.

Component:
- MPN: ${mpn}
- Description: ${description}
- Manufacturer: ${manufacturer}
${packageCase ? `- Package/Case: ${packageCase}` : ""}

${MCODE_DEFINITIONS}

Respond with ONLY a JSON object (no markdown, no backticks):
{"m_code": "XX", "confidence": 0.XX, "reasoning": "one sentence why"}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());

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
    console.error(
      "[AI CLASSIFIER]",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
