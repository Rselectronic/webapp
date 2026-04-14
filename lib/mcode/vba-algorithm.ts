/**
 * VBA M-code assignment algorithm.
 *
 * Source of truth: `All vba codes/DM Common File - Reel Pricing V11/mod_OthF_Digikey_Parameters.bas`
 *
 * The VBA algorithm runs in this order:
 *   1. If Mounting Type == "Through Hole"              → TH
 *   2. If Mounting Type == "Surface Mount, Through Hole" → MANSMT
 *   3. Package/Case lookup in MachineCodes table       (handled upstream by PAR rules)
 *   4. Keyword search in description                   (handled upstream)
 *   5. Size-based rank lookup with "higher rank wins"  → 0201 / 0402 / CP / CPEXP / IP
 *   6. Special cases:
 *        - Pin + Crimp in description                   → CABLE
 *        - category Connectors + "Surface Mount" in desc → MANSMT
 *        - category Connectors + no Surface Mount        → TH
 *        - "Connector Header position" + no SMT         → TH
 *        - "Connector Header" + mounting Surface Mount  → MANSMT
 *        - "End Launch Solder"                          → TH
 *        - child category Film Capacitors + chassis/TH  → TH
 *
 * This file encodes step 1, step 5 (size rank), and the special-case block.
 * The size rank is the clever bit: a 1.5mm × 0.5mm part has length rank 3 (CP)
 * and width rank 2 (0402). The VBA takes the HIGHER rank, so the part becomes CP.
 */

export type SizeRank = 1 | 2 | 3 | 4 | 5 | 6;

interface SizeTier {
  rank: SizeRank;
  m_code: string;
  // Length range is inclusive on both ends.
  lenMin: number;
  lenMax: number;
  // Width range is inclusive on both ends.
  widthMin: number;
  widthMax: number;
}

/**
 * Size Table (equivalent to the "Size Table" sheet in DM Common File V11).
 * Order matters: VBA walks top-to-bottom and uses the first range that contains
 * the value, so smaller tiers come first.
 */
export const SIZE_TIERS: SizeTier[] = [
  { rank: 1, m_code: "0201",  lenMin: 0.4,   lenMax: 0.99,  widthMin: 0.2,   widthMax: 0.59  },
  { rank: 2, m_code: "0402",  lenMin: 1.0,   lenMax: 1.09,  widthMin: 0.5,   widthMax: 0.59  },
  { rank: 3, m_code: "CP",    lenMin: 1.5,   lenMax: 3.79,  widthMin: 0.8,   widthMax: 3.59  },
  { rank: 4, m_code: "CPEXP", lenMin: 3.8,   lenMax: 4.29,  widthMin: 3.6,   widthMax: 3.99  },
  { rank: 5, m_code: "IP",    lenMin: 4.3,   lenMax: 25.0,  widthMin: 4.0,   widthMax: 25.0  },
  { rank: 6, m_code: "MEC",   lenMin: 25.01, lenMax: 9999,  widthMin: 25.01, widthMax: 9999  },
];

/**
 * Look up a single dimension (length OR width) in the Size Table and return
 * a rank. `dim` is which column to match against ("len" or "width").
 * Returns null if the value is not in any range (rank 0 in VBA terms).
 */
function sizeRank(value: number, dim: "len" | "width"): { rank: SizeRank; m_code: string } | null {
  if (value <= 0) return null;
  for (const tier of SIZE_TIERS) {
    const min = dim === "len" ? tier.lenMin : tier.widthMin;
    const max = dim === "len" ? tier.lenMax : tier.widthMax;
    if (value >= min && value <= max) {
      return { rank: tier.rank, m_code: tier.m_code };
    }
  }
  return null;
}

/**
 * Apply the size-rank portion of the VBA algorithm.
 * `lenRank >= widthRank` → use length's m-code, else width's.
 * This is why a 1.5mm × 0.5mm part becomes CP (len rank 3) not 0402 (width rank 2).
 */
export function classifyBySize(
  lengthMm: number | null,
  widthMm: number | null
): { m_code: string; reasoning: string } | null {
  if (lengthMm === null && widthMm === null) return null;

  const lenHit = lengthMm !== null ? sizeRank(lengthMm, "len") : null;
  const widthHit = widthMm !== null ? sizeRank(widthMm, "width") : null;

  // If neither dimension landed in a tier, we cannot size-classify.
  if (!lenHit && !widthHit) return null;

  // If only one side hit a tier, use that one.
  if (lenHit && !widthHit) {
    return {
      m_code: lenHit.m_code,
      reasoning: `size rank ${lenHit.rank} from length ${lengthMm}mm → ${lenHit.m_code}`,
    };
  }
  if (widthHit && !lenHit) {
    return {
      m_code: widthHit.m_code,
      reasoning: `size rank ${widthHit.rank} from width ${widthMm}mm → ${widthHit.m_code}`,
    };
  }

  // Both dimensions landed in a tier. "Higher rank wins."
  // (higher rank number = physically larger = more demanding placement)
  // lenRank >= widthRank → length wins.
  const lenRank = lenHit!.rank;
  const widthRank = widthHit!.rank;
  if (lenRank >= widthRank) {
    return {
      m_code: lenHit!.m_code,
      reasoning: `${lengthMm}mm × ${widthMm}mm → len rank ${lenRank} ≥ width rank ${widthRank} → ${lenHit!.m_code}`,
    };
  }
  return {
    m_code: widthHit!.m_code,
    reasoning: `${lengthMm}mm × ${widthMm}mm → width rank ${widthRank} > len rank ${lenRank} → ${widthHit!.m_code}`,
  };
}

// ---------------------------------------------------------------------------
// Special-case checks (VBA lines 345-393)
// ---------------------------------------------------------------------------

/**
 * Word-boundary "contains" check. VBA wraps the description in leading/trailing
 * spaces and looks for " keyword " — this emulates that.
 */
function hasWord(text: string, word: string): boolean {
  const re = new RegExp(`(^|[^a-zA-Z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-zA-Z0-9])`, "i");
  return re.test(text);
}

/**
 * Cheap, AI-free special cases that can run in the rules layer BEFORE any
 * AI call. If this matches, we skip the AI entirely.
 *
 * These are the "free" wins from the VBA algorithm that only need the
 * description string — no dimensions, no Claude.
 */
export function classifyBySpecialCaseDescription(
  description: string
): { m_code: string; reasoning: string } | null {
  const desc = description ?? "";
  if (!desc) return null;

  // VBA line 345: description has "Pin" AND "Crimp" → CABLE
  if (hasWord(desc, "Pin") && hasWord(desc, "Crimp")) {
    return { m_code: "CABLE", reasoning: `VBA special case: description has "Pin" + "Crimp" → CABLE` };
  }

  // VBA line 377: "End Launch Solder" → TH
  if (/end\s+launch\s+solder/i.test(desc)) {
    return { m_code: "TH", reasoning: `VBA special case: description has "End Launch Solder" → TH` };
  }

  // VBA line 362: "Connector Header position" + no SMT/SMD/SURFACE MOUNT → TH
  if (/connector\s+header\s+position/i.test(desc)) {
    const hasSmt = /SMT|SMD|SURFACE\s+MOUNT/i.test(desc);
    if (!hasSmt) {
      return { m_code: "TH", reasoning: `VBA special case: "Connector Header position" with no SMT/SMD → TH` };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Full algorithm — used on the AI layer once we have params in hand
// ---------------------------------------------------------------------------

export interface VbaAlgoInput {
  description: string;
  mounting_type: string | null;
  length_mm: number | null;
  width_mm: number | null;
  package_case: string | null;
  category: string | null;
}

export interface VbaAlgoResult {
  m_code: string;
  confidence: number;
  reasoning: string;
}

/**
 * Run the full VBA algorithm given a set of component parameters.
 * Returns null if the algorithm cannot reach a verdict (e.g. no mounting type,
 * no dimensions, no special-case match). The caller should route to human review.
 */
export function applyVbaAlgorithm(input: VbaAlgoInput): VbaAlgoResult | null {
  const desc = input.description ?? "";
  const mounting = (input.mounting_type ?? "").trim();
  const category = (input.category ?? "").trim();

  // 1. Mounting type short-circuits (VBA lines 195-202)
  if (mounting === "Through Hole") {
    return {
      m_code: "TH",
      confidence: 0.92,
      reasoning: `VBA rule: mounting_type = Through Hole → TH`,
    };
  }
  if (mounting === "Surface Mount, Through Hole") {
    return {
      m_code: "MANSMT",
      confidence: 0.92,
      reasoning: `VBA rule: mounting_type = Surface Mount, Through Hole → MANSMT`,
    };
  }

  // Special cases that don't need size (VBA lines 345-393)
  const specialDesc = classifyBySpecialCaseDescription(desc);
  if (specialDesc) {
    return { m_code: specialDesc.m_code, confidence: 0.90, reasoning: specialDesc.reasoning };
  }

  // Connectors category branches (VBA lines 351-360)
  if (/^connectors,\s*interconnects$/i.test(category) || /^connectors$/i.test(category) || /^connector$/i.test(category)) {
    const descHasSmt = /\bsurface\s+mount\b/i.test(desc);
    const mountHasSmt = /\bsurface\s+mount\b/i.test(mounting);
    if (descHasSmt || mountHasSmt) {
      return {
        m_code: "MANSMT",
        confidence: 0.88,
        reasoning: `VBA rule: category=Connectors + Surface Mount → MANSMT`,
      };
    }
    return {
      m_code: "TH",
      confidence: 0.88,
      reasoning: `VBA rule: category=Connectors with no Surface Mount → TH`,
    };
  }

  // "Connector Header" + mounting=Surface Mount → MANSMT (VBA line 371)
  if (/connector\s+header/i.test(desc) && /\bsurface\s+mount\b/i.test(mounting)) {
    return {
      m_code: "MANSMT",
      confidence: 0.88,
      reasoning: `VBA rule: "Connector Header" + mounting Surface Mount → MANSMT`,
    };
  }

  // Size-based classification (VBA lines 247-342)
  const sizeResult = classifyBySize(input.length_mm, input.width_mm);
  if (sizeResult) {
    return {
      m_code: sizeResult.m_code,
      confidence: 0.85,
      reasoning: `VBA size rule: ${sizeResult.reasoning}`,
    };
  }

  // Nothing matched — caller routes to human review
  return null;
}
