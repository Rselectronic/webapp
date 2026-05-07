import type { ClassificationInput, ClassificationResult } from "./types";
import type { MCode } from "./types";
import { classifyByRules } from "./rules";
import { fetchComponentParams, fetchComponentParamsBatch } from "./ai-classifier";
import { applyVbaAlgorithm, classifyBySpecialCaseDescription } from "./vba-algorithm";
import { enrichComponentFromAPI } from "@/lib/pricing/enrich-components";
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
 *   Layer 1: Database lookup by CPC (components table — includes manual overrides)
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
  // Layer 1: Database lookup by CPC (components table — includes prior manual
  // overrides). CPC is the customer-facing key; when the BOM has no CPC column
  // the importer falls back to the MPN, so we try CPC first then MPN.
  const lookupKey = input.cpc || input.mpn;
  // When cachedKeywords is provided, the caller is classifyBomLines — which
  // has already batch-fetched the components cache into a Map and checked it
  // before invoking us. Repeating the DB lookup here adds one round-trip per
  // unclassified line, which for a 60-line BOM meant ~6s of pre-classify wait
  // before the progress bar could move. Skip it in batch mode.
  if (lookupKey && cachedKeywords === undefined) {
    const dbResult = await lookupInDatabase(lookupKey, supabase);
    if (dbResult) return dbResult;
  }

  // Enrich input with component details (dimensions, package, mounting type)
  // from the components table — populated by DigiKey/Mouser API responses
  let enrichedInput = input;
  if (lookupKey && componentDetails) {
    const details = componentDetails.get(lookupKey);
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

  // Layer 1c: VBA special-case description checks — free wins, no AI needed.
  // These mirror the VBA block at lines 345-380 of mod_OthF_Digikey_Parameters.bas:
  //   - description has "Pin" AND "Crimp" → CABLE
  //   - description has "End Launch Solder" → TH
  //   - description has "Connector Header position" AND no SMT/SMD → TH
  const specialCase = classifyBySpecialCaseDescription(enrichedInput.description);
  if (specialCase) {
    return {
      m_code: specialCase.m_code as MCode,
      confidence: 0.90,
      source: "rules",
      rule_id: specialCase.reasoning,
    };
  }

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
  const singleLookupKey = input.cpc || input.mpn;
  if (singleLookupKey) {
    const { data } = await supabase
      .from("components")
      .select("cpc, mounting_type, package_case, category, length_mm, width_mm")
      .eq("cpc", singleLookupKey)
      .limit(1)
      .maybeSingle();
    if (data && (data.mounting_type || data.package_case || data.length_mm)) {
      detailsMap.set(singleLookupKey, {
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

  // Layer 3 (AI parameter fetch + VBA algorithm).
  // Piyush's rule: the AI must NOT do generic M-code classification. Ask Claude
  // for the physical parameters only (mounting_type, length_mm, width_mm,
  // package, category) and then let the VBA algorithm decide the M-code.
  const params = await fetchComponentParams(input.mpn, input.description, input.manufacturer);
  if (!params) return { m_code: null, confidence: 0, source: null };

  // Save the fetched parameters to the components table so Layer 1 hits them
  // instantly on the next classification. Fire-and-forget the enrichment —
  // classifier result is the same whether enrichment succeeds or not.
  void enrichComponentFromAPI(supabase, {
    cpc: input.cpc || input.mpn,
    manufacturer: input.manufacturer || "Unknown",
    description: input.description,
    mounting_type: params.mounting_type ?? undefined,
    length_mm: params.length_mm ?? undefined,
    width_mm: params.width_mm ?? undefined,
    package_case: params.package_case ?? undefined,
    category: params.category ?? undefined,
  }).catch((err) => console.error("[classifier] enrichComponentFromAPI failed", err));

  const verdict = applyVbaAlgorithm({
    description: input.description,
    mounting_type: params.mounting_type,
    length_mm: params.length_mm,
    width_mm: params.width_mm,
    package_case: params.package_case,
    category: params.category,
    sub_category: params.sub_category,
    features: params.features,
    attachment_method: params.attachment_method,
  });
  if (!verdict) return { m_code: null, confidence: 0, source: null };

  return {
    m_code: verdict.m_code as MCode,
    confidence: verdict.confidence,
    source: "api",
    rule_id: `AI: ${params.reasoning} → ${verdict.reasoning}`,
  };
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
  cpc: string,
  supabase: SupabaseClient
): Promise<ClassificationResult | null> {
  const { data } = await supabase
    .from("components")
    .select("m_code, m_code_source")
    .eq("cpc", cpc)
    .not("m_code", "is", null)
    .limit(1)
    .maybeSingle();

  if (data?.m_code) {
    const reason = data.m_code_source === "manual"
      ? `Previously manually classified as ${data.m_code} — CPC "${cpc}" found in components database`
      : `CPC "${cpc}" found in components database → ${data.m_code}`;
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
  cpc: string,
  mCode: string,
  description: string | null,
  manufacturer: string | null,
  supabase: SupabaseClient
): Promise<void> {
  // Upsert into components table — if CPC already exists, update the M-code
  await supabase
    .from("components")
    .upsert(
      {
        cpc,
        m_code: mCode,
        m_code_source: "manual",
        description: description ?? undefined,
        manufacturer: manufacturer ?? undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cpc,manufacturer" }
    );
}

/**
 * AI-batch classification: fetch component parameters from Claude for many
 * components in parallel, run the VBA algorithm on each, and enrich the
 * components table so Layer 1 catches them next time.
 *
 * This is the "second pass" called after classifyBomLines returns no m_code
 * for some lines. The calling route picks the lines that still need review
 * and sends them through here.
 */
export async function classifyBomLinesWithAI(
  lines: { mpn: string; description: string; manufacturer: string }[],
  supabase: SupabaseClient
): Promise<ClassificationResult[]> {
  if (lines.length === 0) return [];

  const params = await fetchComponentParamsBatch(
    lines.map((l) => ({ mpn: l.mpn, description: l.description, manufacturer: l.manufacturer }))
  );

  // Fire enrichment writes in parallel — don't block the return.
  const enrichPromises: Promise<unknown>[] = [];
  const results: ClassificationResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const p = params[i];
    if (!p) {
      results.push({ m_code: null, confidence: 0, source: null });
      continue;
    }

    // Save parameters to components table for Layer 1 re-use.
    enrichPromises.push(
      enrichComponentFromAPI(supabase, {
        cpc: lines[i].mpn,
        manufacturer: lines[i].manufacturer || "Unknown",
        description: lines[i].description,
        mounting_type: p.mounting_type ?? undefined,
        length_mm: p.length_mm ?? undefined,
        width_mm: p.width_mm ?? undefined,
        package_case: p.package_case ?? undefined,
        category: p.category ?? undefined,
      }).catch((err) => console.error("[classifyBomLinesWithAI] enrich failed", err))
    );

    const verdict = applyVbaAlgorithm({
      description: lines[i].description,
      mounting_type: p.mounting_type,
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      package_case: p.package_case,
      category: p.category,
      sub_category: p.sub_category,
      features: p.features,
      attachment_method: p.attachment_method,
    });
    if (!verdict) {
      results.push({ m_code: null, confidence: 0, source: null });
      continue;
    }
    results.push({
      m_code: verdict.m_code as MCode,
      confidence: verdict.confidence,
      source: "api",
      rule_id: `AI: ${p.reasoning} → ${verdict.reasoning}`,
    });
  }

  // Wait for enrichment to finish so the DB is up to date when we return.
  await Promise.all(enrichPromises);
  return results;
}

/**
 * Classify all BOM lines using layers 1-2 (DB, keywords, rules).
 * Optimized: keywords fetched ONCE, DB lookups batched, component details enriched.
 */
export async function classifyBomLines(
  lines: { mpn: string; description: string; cpc: string; manufacturer: string }[],
  supabase: SupabaseClient,
  /**
   * When provided, the classifier consults `customer_parts.m_code_manual` for
   * this customer BEFORE any other data source. That's the per-customer
   * procurement log — an operator's correction for TLAN's CPC "C1001" stays
   * TLAN-only. Omit for classification calls that aren't tied to a customer
   * (rare — mostly testing).
   */
  customerId?: string
): Promise<ClassificationResult[]> {
  // Fetch keywords ONCE for the entire BOM (was per-component before)
  const keywords = await fetchKeywords(supabase);

  // Batch DB lookup: fetch all known CPCs in one query. CPC is the customer
  // part code on the BOM line; when the BOM has no CPC column the importer
  // falls back to the MPN, so we use (cpc || mpn) as the key.
  const lookupKeys = [
    ...new Set(lines.map((l) => l.cpc || l.mpn).filter(Boolean)),
  ];
  // customer_parts.m_code_manual is the sole source of manual classification
  // truth. Migration 056 folded the flat manual_m_code_overrides sheet into
  // customer_parts by matching on CPC across every customer that uses it, so
  // a single per-customer lookup now covers both cases that used to be
  // separate tables.
  const customerManualMap = new Map<string, string>();
  const dbMap = new Map<string, { m_code: string; m_code_source: string }>();
  const detailsMap = new Map<string, ComponentDetails>();

  if (lookupKeys.length > 0) {
    // Supabase's query builder is a `PromiseLike` (thenable), not a full
    // `Promise` — typing the array as `Promise<unknown>[]` was rejected
    // under stricter type-checking in newer @supabase/* releases.
    const queries: PromiseLike<unknown>[] = [];

    if (customerId) {
      queries.push(
        supabase
          .from("customer_parts")
          .select("cpc, m_code_manual")
          .eq("customer_id", customerId)
          .in("cpc", lookupKeys)
          .then(({ data }) => {
            for (const row of data ?? []) {
              if (row.m_code_manual) {
                customerManualMap.set(row.cpc, row.m_code_manual);
              }
            }
          })
      );
    }

    queries.push(
      supabase
        .from("components")
        .select(
          "cpc, m_code, m_code_source, mounting_type, package_case, category, length_mm, width_mm"
        )
        .in("cpc", lookupKeys)
        .then(({ data }) => {
          for (const row of data ?? []) {
            if (row.m_code) {
              dbMap.set(row.cpc, {
                m_code: row.m_code,
                m_code_source: row.m_code_source,
              });
            }
            if (
              row.mounting_type ||
              row.package_case ||
              row.length_mm ||
              row.width_mm
            ) {
              detailsMap.set(row.cpc, {
                mounting_type: row.mounting_type,
                package_case: row.package_case,
                category: row.category,
                length_mm: row.length_mm,
                width_mm: row.width_mm,
              });
            }
          }
        })
    );

    await Promise.all(queries);
  }

  // Classify each line using cached data (no per-component DB calls)
  const results: ClassificationResult[] = [];
  for (const line of lines) {
    const key = line.cpc || line.mpn;
    // Layer 1a: per-customer manual override from customer_parts.
    if (key && customerManualMap.has(key)) {
      const m = customerManualMap.get(key)!;
      results.push({
        m_code: m as MCode,
        confidence: 0.99,
        source: "manual",
        rule_id: `Manual override for CPC "${key}" → ${m}`,
      });
      continue;
    }
    // Layer 1b: components cache.
    const dbHit = key ? dbMap.get(key) : null;
    if (dbHit?.m_code) {
      const reason = dbHit.m_code_source === "manual"
        ? `Previously manually classified as ${dbHit.m_code} — CPC "${key}" found in components database`
        : `CPC "${key}" found in components database → ${dbHit.m_code}`;
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
