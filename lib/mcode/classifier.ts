import type { ClassificationInput, ClassificationResult } from "./types";
import type { MCode } from "./types";
import { classifyByRules } from "./rules";
import { classifyWithAI } from "./ai-classifier";
import type { SupabaseClient } from "@supabase/supabase-js";

type KeywordRow = {
  keyword: string;
  assigned_m_code: string;
  match_field: string;
  match_type: string;
  priority: number;
};

type ComponentDetails = {
  mounting_type: string | null;
  package_case: string | null;
  category: string | null;
  length_mm: number | null;
  width_mm: number | null;
};

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
  supabase: SupabaseClient,
  cachedKeywords?: KeywordRow[] | null,
  componentDetails?: Map<string, ComponentDetails> | null
): Promise<ClassificationResult> {
  // Layer 1: Database lookup (components table — includes prior manual overrides)
  if (input.mpn) {
    const dbResult = await lookupInDatabase(input.mpn, supabase);
    if (dbResult) return dbResult;
  }

  // Enrich input with component details (dimensions, package, mounting type)
  // from the components table — populated by DigiKey/Mouser API responses
  let enrichedInput = input;
  if (input.mpn && componentDetails) {
    const details = componentDetails.get(input.mpn);
    if (details) {
      enrichedInput = {
        ...input,
        mounting_type: input.mounting_type ?? details.mounting_type ?? undefined,
        package_case: input.package_case ?? details.package_case ?? undefined,
        category: input.category ?? details.category ?? undefined,
        length_mm: input.length_mm ?? details.length_mm ?? undefined,
        width_mm: input.width_mm ?? details.width_mm ?? undefined,
      };
    }
  }

  // Layer 1b: Keyword lookup (240+ common terms from mcode_keyword_lookup table)
  // If no keywords were passed (e.g. single-component call), fetch them from DB
  const keywords = cachedKeywords !== undefined ? cachedKeywords : await fetchKeywords(supabase);
  const keywordResult = matchKeywords(enrichedInput, keywords ?? null);
  if (keywordResult) return keywordResult;

  // Layer 2: Rule engine (PAR rules) — now with enriched dimensions/package data
  const ruleResult = classifyByRules(enrichedInput);
  if (ruleResult && ruleResult.m_code) {
    return {
      m_code: ruleResult.m_code,
      confidence: 0.85,
      source: "rules",
      rule_id: ruleResult.rule_id,
    };
  }

  // All non-AI layers failed — return null (AI is handled separately in batch)
  return { m_code: null, confidence: 0, source: null };
}

/**
 * Full classification including AI fallback. Used for single-component classification.
 */
export async function classifyComponentFull(
  input: ClassificationInput,
  supabase: SupabaseClient
): Promise<ClassificationResult> {
  // Fetch enriched data for this component (dimensions, package from API lookups)
  const keywords = await fetchKeywords(supabase);
  const detailsMap = new Map<string, ComponentDetails>();
  if (input.mpn) {
    const { data } = await supabase
      .from("components")
      .select("mpn, mounting_type, package_case, category, length_mm, width_mm")
      .eq("mpn", input.mpn)
      .limit(1)
      .maybeSingle();
    if (data && (data.mounting_type || data.package_case || data.length_mm)) {
      detailsMap.set(input.mpn, {
        mounting_type: data.mounting_type,
        package_case: data.package_case,
        category: data.category,
        length_mm: data.length_mm,
        width_mm: data.width_mm,
      });
    }
  }

  // Try layers 1, 1b, 2 with enriched data
  const result = await classifyComponent(input, supabase, keywords, detailsMap);
  if (result.m_code) return result;

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

  return { m_code: null, confidence: 0, source: null };
}

/**
 * Fetch keywords once from database. Reuse across all components.
 */
export async function fetchKeywords(supabase: SupabaseClient): Promise<KeywordRow[]> {
  const { data } = await supabase
    .from("mcode_keyword_lookup")
    .select("keyword, assigned_m_code, match_field, match_type, priority")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  return (data ?? []) as KeywordRow[];
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
 * Layer 1b: Match against pre-fetched keywords (no DB query).
 * Keywords are fetched ONCE per BOM via fetchKeywords(), then passed here.
 */
function matchKeywords(
  input: ClassificationInput,
  keywords: KeywordRow[] | null
): ClassificationResult | null {
  if (!keywords || keywords.length === 0) return null;

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
      matched = Object.values(searchFields).some((v) => v === needle);
    } else if (kw.match_type === "word_boundary" || needle.length <= 4) {
      const re = new RegExp(`(^|[^a-zA-Z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zA-Z0-9])`, "i");
      matched = re.test(haystack);
    } else {
      matched = haystack.includes(needle);
    }

    if (matched) {
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

/**
 * Classify all BOM lines using layers 1-2 (DB, keywords, rules).
 * Optimized: keywords fetched ONCE, DB lookups batched, component details enriched.
 */
export async function classifyBomLines(
  lines: { mpn: string; description: string; cpc: string; manufacturer: string }[],
  supabase: SupabaseClient
): Promise<ClassificationResult[]> {
  // Fetch keywords ONCE for the entire BOM (was per-component before)
  const keywords = await fetchKeywords(supabase);

  // Batch DB lookup: fetch all known MPNs in one query
  const mpns = [...new Set(lines.map((l) => l.mpn).filter(Boolean))];
  const dbMap = new Map<string, { m_code: string; m_code_source: string }>();
  const detailsMap = new Map<string, ComponentDetails>();

  if (mpns.length > 0) {
    // Fetch M-codes AND component details (dimensions, package, mounting) in one query
    const { data } = await supabase
      .from("components")
      .select("mpn, m_code, m_code_source, mounting_type, package_case, category, length_mm, width_mm")
      .in("mpn", mpns);
    for (const row of data ?? []) {
      if (row.m_code) {
        dbMap.set(row.mpn, { m_code: row.m_code, m_code_source: row.m_code_source });
      }
      // Store details for enrichment even if no m_code (dimensions still useful for rules)
      if (row.mounting_type || row.package_case || row.length_mm || row.width_mm) {
        detailsMap.set(row.mpn, {
          mounting_type: row.mounting_type,
          package_case: row.package_case,
          category: row.category,
          length_mm: row.length_mm,
          width_mm: row.width_mm,
        });
      }
    }
  }

  // Classify each line using cached data (no per-component DB calls)
  const results: ClassificationResult[] = [];
  for (const line of lines) {
    // Layer 1: Check pre-fetched DB map
    const dbHit = line.mpn ? dbMap.get(line.mpn) : null;
    if (dbHit?.m_code) {
      const reason = dbHit.m_code_source === "manual"
        ? `Previously manually classified as ${dbHit.m_code} — MPN "${line.mpn}" found in components database`
        : `MPN "${line.mpn}" found in components database → ${dbHit.m_code}`;
      results.push({ m_code: dbHit.m_code as MCode, confidence: 0.95, source: "database", rule_id: reason });
      continue;
    }

    // Layer 1b + Layer 2: keywords + rules with enriched component details (dimensions, package)
    const result = await classifyComponent(
      { mpn: line.mpn, description: line.description, cpc: line.cpc, manufacturer: line.manufacturer },
      supabase,
      keywords,
      detailsMap
    );
    results.push(result);
  }
  return results;
}
