import type { ClassificationInput, ClassificationResult } from "./types";
import type { MCode } from "./types";
import { classifyByRules } from "./rules";
import { classifyWithAI } from "./ai-classifier";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 4-Layer M-Code classification pipeline.
 *
 * Priority order (from Anas, 2026-04-08):
 *   Layer 1: Database lookup by MPN (components table — includes manual overrides)
 *   Layer 1b: Keyword lookup (240+ common terms — package names, mounting types)
 *   Layer 2: Rule engine (PAR rules)
 *   Layer 3: Claude AI classification
 *
 * Manual overrides save to components table, so Layer 1 catches them next time.
 */
export async function classifyComponent(
  input: ClassificationInput,
  supabase: SupabaseClient
): Promise<ClassificationResult> {
  // Layer 1: Database lookup (components table — includes prior manual overrides)
  if (input.mpn) {
    const dbResult = await lookupInDatabase(input.mpn, supabase);
    if (dbResult) return dbResult;
  }

  // Layer 1b: Keyword lookup (240+ common terms from mcode_keyword_lookup table)
  const keywordResult = await lookupByKeyword(input, supabase);
  if (keywordResult) return keywordResult;

  // Layer 2: Rule engine (PAR rules)
  const ruleResult = classifyByRules(input);
  if (ruleResult && ruleResult.m_code) {
    return {
      m_code: ruleResult.m_code,
      confidence: 0.85,
      source: "rules",
      rule_id: ruleResult.rule_id,
    };
  }

  // Layer 3: AI classification (Claude)
  const aiResult = await classifyWithAI(
    input.mpn,
    input.description,
    input.manufacturer,
    input.package_case
  );
  if (aiResult && aiResult.confidence >= 0.80) {
    return {
      m_code: aiResult.m_code as MCode,
      confidence: aiResult.confidence,
      source: "api",
      rule_id: `AI: ${aiResult.reasoning}`,
    };
  }

  // All layers failed
  return { m_code: null, confidence: 0, source: null };
}

async function lookupInDatabase(
  mpn: string,
  supabase: SupabaseClient
): Promise<ClassificationResult | null> {
  const { data } = await supabase
    .from("components")
    .select("m_code, m_code_source")
    .eq("mpn", mpn)
    .not("m_code", "is", null)
    .limit(1)
    .maybeSingle();

  if (data?.m_code) {
    const reason = data.m_code_source === "manual"
      ? `Previously manually classified as ${data.m_code} — MPN "${mpn}" found in components database`
      : `MPN "${mpn}" found in components database → ${data.m_code}`;
    return { m_code: data.m_code, confidence: 0.95, source: "database", rule_id: reason };
  }
  return null;
}

/**
 * Layer 1b: Keyword lookup against the 240+ common terms table.
 * Checks CPC, description, and package_case against known keywords.
 * Case-insensitive matching.
 */
async function lookupByKeyword(
  input: ClassificationInput,
  supabase: SupabaseClient
): Promise<ClassificationResult | null> {
  // Fetch all active keywords (cached per-request by Supabase client)
  const { data: keywords } = await supabase
    .from("mcode_keyword_lookup")
    .select("keyword, assigned_m_code, match_field, match_type, priority")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (!keywords || keywords.length === 0) return null;

  // Build search text from all available fields
  const searchFields: Record<string, string> = {
    cpc: (input.cpc ?? "").toLowerCase(),
    description: (input.description ?? "").toLowerCase(),
    package_case: (input.package_case ?? "").toLowerCase(),
  };
  const allText = Object.values(searchFields).join(" ");

  for (const kw of keywords) {
    const needle = kw.keyword.toLowerCase();
    let haystack: string;

    if (kw.match_field === "any") {
      haystack = allText;
    } else {
      haystack = searchFields[kw.match_field] ?? "";
    }

    if (!haystack) continue;

    let matched = false;
    if (kw.match_type === "exact") {
      // Check each field individually for exact match
      matched = Object.values(searchFields).some((v) => v === needle);
    } else if (kw.match_type === "word_boundary" || needle.length <= 4) {
      // Short keywords (like "0402", "0603", "DIP", "SMA") must match as word boundaries
      // to avoid false positives like "LPC2468" matching "0402"
      const re = new RegExp(`(^|[^a-zA-Z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zA-Z0-9])`, "i");
      matched = re.test(haystack);
    } else {
      // Longer keywords can safely use substring matching
      matched = haystack.includes(needle);
    }

    if (matched) {
      // Build human-readable reasoning
      const mCodeNames: Record<string, string> = {
        "0201": "ultra-tiny passive (0201)",
        "0402": "small passive (0402)",
        "CP": "chip package (standard SMT)",
        "CPEXP": "expanded SMT package",
        "IP": "IC package (large SMT)",
        "TH": "through-hole",
        "MANSMT": "manual SMT (odd-form)",
        "MEC": "mechanical",
        "Accs": "accessory",
        "CABLE": "cable/wiring",
        "DEV B": "development board",
        "PCB": "printed circuit board",
      };
      const mCodeDesc = mCodeNames[kw.assigned_m_code] ?? kw.assigned_m_code;
      const matchedIn = kw.match_field === "any" ? "component data" : kw.match_field;
      const reason = `Found "${kw.keyword}" in ${matchedIn} → ${mCodeDesc}`;

      return {
        m_code: kw.assigned_m_code as MCode,
        confidence: 0.90,
        source: "database",
        rule_id: reason,
      };
    }
  }

  return null;
}

/**
 * Save a manual M-code override to the components table.
 * This is the learning loop — once a human assigns an M-code to an MPN,
 * Layer 1 (database lookup) catches it automatically for all future BOMs.
 */
export async function saveManualOverride(
  mpn: string,
  mCode: string,
  description: string | null,
  manufacturer: string | null,
  supabase: SupabaseClient
): Promise<void> {
  // Upsert into components table — if MPN already exists, update the M-code
  await supabase
    .from("components")
    .upsert(
      {
        mpn,
        m_code: mCode,
        m_code_source: "manual",
        description: description ?? undefined,
        manufacturer: manufacturer ?? undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mpn,manufacturer" }
    );
}

export async function classifyBomLines(
  lines: { mpn: string; description: string; cpc: string; manufacturer: string }[],
  supabase: SupabaseClient
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];
  for (const line of lines) {
    const result = await classifyComponent(
      { mpn: line.mpn, description: line.description, cpc: line.cpc, manufacturer: line.manufacturer },
      supabase
    );
    results.push(result);
  }
  return results;
}
