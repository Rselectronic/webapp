import type { ClassificationInput, ClassificationResult } from "./types";
import { classifyByRules } from "./rules";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 3-Layer M-Code classification pipeline.
 * Layer 1: Database lookup by MPN
 * Layer 2: Rule engine (PAR rules)
 * Layer 3: API lookup (deferred to Sprint 3)
 */
export async function classifyComponent(
  input: ClassificationInput,
  supabase: SupabaseClient
): Promise<ClassificationResult> {
  // Layer 1: Database lookup
  if (input.mpn) {
    const dbResult = await lookupInDatabase(input.mpn, supabase);
    if (dbResult) return dbResult;
  }

  // Layer 2: Rule engine
  const ruleResult = classifyByRules(input);
  if (ruleResult) {
    return {
      m_code: ruleResult.m_code,
      confidence: 0.85,
      source: "rules",
      rule_id: ruleResult.rule_id,
    };
  }

  // Layer 3: API — deferred
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
    .single();

  if (data?.m_code) {
    return { m_code: data.m_code, confidence: 0.95, source: "database" };
  }
  return null;
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
