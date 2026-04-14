import Anthropic from "@anthropic-ai/sdk";
import type { ColumnMapping } from "./types";

/**
 * AI fallback for column mapping when keyword detection fails.
 *
 * Ask Claude to look at the headers and a few sample rows, then return a
 * column mapping in the shape our parser expects. This lets us parse BOMs
 * with weird column names ("P/N", "Ref", "Qté", "成本") without forcing the
 * user to write a BOM config.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export async function aiMapColumns(
  headers: string[],
  sampleRows: unknown[][]
): Promise<ColumnMapping | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (headers.length === 0) return null;

  // Build a compact preview: headers + up to 5 data rows
  const preview = [
    headers.join(" | "),
    ...sampleRows.slice(0, 5).map((r) =>
      r.slice(0, headers.length).map((v) => String(v ?? "").slice(0, 40)).join(" | ")
    ),
  ].join("\n");

  const prompt = `You are an electronics BOM parser. Look at this BOM table and map its columns to the standard CP/IP BOM format. Return ONLY a JSON object with field → exact header name mappings.

Standard fields (return exact header name or null):
- "qty": quantity per board (e.g. "Qty", "Quantity", "Qté", "Count")
- "designator": reference designators (e.g. "Designator", "Ref Des", "RefDes", "Position", "Index")
- "mpn": manufacturer part number (e.g. "MPN", "Manufacturer PN", "Part Number", "Mfr P/N")
- "manufacturer": manufacturer name (e.g. "Manufacturer", "Mfr", "Brand", "Vendor")
- "description": component description (e.g. "Description", "Part Description", "Comment")
- "cpc": customer part code (e.g. "CPC", "Internal PN", "ERP PN", "Customer #")

BOM table preview (first line is headers, rest are data):
${preview}

Rules:
- Return the EXACT header name, not a renamed version
- If a column doesn't clearly map to a field, return null for that field
- Prefer "Description" over "Value" for the description field
- Never use the MPN column as the CPC fallback — they must be different columns
- If the BOM has no CPC column, return null for cpc

Respond with JSON only, no markdown:
{"qty": "...", "designator": "...", "mpn": "...", "manufacturer": "...", "description": "...", "cpc": null}`;

  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(text) as Record<string, string | null>;

    // Validate: every non-null mapping must reference an actual header
    const headerSet = new Set(headers);
    const pick = (k: string): string | undefined => {
      const v = parsed[k];
      if (typeof v !== "string" || !v) return undefined;
      if (!headerSet.has(v)) return undefined;
      return v;
    };

    const qty = pick("qty");
    const designator = pick("designator");
    const mpn = pick("mpn");
    const description = pick("description");

    // Require at least qty + designator + (mpn OR description) — otherwise
    // there's nothing useful to parse. ColumnMapping needs qty/designator/mpn
    // to be present; if mpn is missing we fill it with the description column
    // so the parser reads the right cells (ParsedLine.mpn is just a string).
    if (!qty || !designator || (!mpn && !description)) {
      return null;
    }

    const mapping: ColumnMapping = {
      qty,
      designator,
      mpn: mpn ?? description!,
    };
    const mfr = pick("manufacturer");
    if (mfr) mapping.manufacturer = mfr;
    if (description) mapping.description = description;
    const cpc = pick("cpc");
    if (cpc) mapping.cpc = cpc;

    return mapping;
  } catch (err) {
    console.error("[AI COLUMN MAPPER]", err instanceof Error ? err.message : err);
    return null;
  }
}
