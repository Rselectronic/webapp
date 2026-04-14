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

export type SizeRank = 1 | 2 | 3 | 4 | 5;

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
 * Size Table — EXACT values from DM Common File V11 "Size Table" sheet.
 * Extracted from /supabase/seed-data/dm-file/size_table.csv on 2026-04-14.
 *
 * Note: the DM file has NO MEC row — MEC is assigned via PAR rules (HEATSINK,
 * Standoff, etc.) not size. A component whose dimensions don't fall in any
 * range returns null and falls through to the PAR rule layer.
 */
export const SIZE_TIERS: SizeTier[] = [
  { rank: 1, m_code: "0201",  lenMin: 0.40, lenMax: 0.99, widthMin: 0.20, widthMax: 0.48 },
  { rank: 2, m_code: "0402",  lenMin: 1.00, lenMax: 1.49, widthMin: 0.49, widthMax: 0.79 },
  { rank: 3, m_code: "CP",    lenMin: 1.50, lenMax: 3.79, widthMin: 0.80, widthMax: 3.59 },
  { rank: 4, m_code: "CPEXP", lenMin: 3.80, lenMax: 4.29, widthMin: 3.60, widthMax: 3.99 },
  { rank: 5, m_code: "IP",    lenMin: 4.30, lenMax: 25.0, widthMin: 4.00, widthMax: 25.0 },
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
  sub_category?: string | null;
  features?: string | null;
  attachment_method?: string | null;
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

  // Sub-category rules (DM Admin sheet PAR-04 through PAR-12, PAR-30 through PAR-34, PAR-38, PAR-42)
  // Run these BEFORE size lookup because they take precedence.
  const subCat = (input.sub_category ?? "").trim();
  if (subCat) {
    const smt = /\bsurface\s+mount\b/i.test(mounting);
    if (subCat === "Slide Switches" && smt) return { m_code: "IP", confidence: 0.92, reasoning: `Sub-Category = Slide Switches + SMT → IP` };
    if (subCat === "Tactile Switches" && smt) return { m_code: "IP", confidence: 0.92, reasoning: `Sub-Category = Tactile Switches + SMT → IP` };
    if (subCat === "Tactile Switches" && /surface\s+mount,\s*right\s+angle/i.test(mounting)) return { m_code: "IP", confidence: 0.92, reasoning: `Sub-Category = Tactile Switches + Right Angle SMT → IP` };
    if (subCat === "Slide Switches") return { m_code: "TH", confidence: 0.88, reasoning: `Sub-Category = Slide Switches → TH` };
    if (subCat === "Tactile Switches") return { m_code: "TH", confidence: 0.88, reasoning: `Sub-Category = Tactile Switches → TH` };
    if (/RFI and EMI/i.test(subCat)) return { m_code: "Accs", confidence: 0.90, reasoning: `Sub-Category = RFI/EMI gaskets → Accs` };
    if (subCat === "RF Shields" && /\bsurface\s+mount\b/i.test(desc)) return { m_code: "MANSMT", confidence: 0.90, reasoning: `Sub-Category = RF Shields + SMT desc → MANSMT` };
    if (subCat === "RF Shields") return { m_code: "MEC", confidence: 0.88, reasoning: `Sub-Category = RF Shields → MEC` };
    if (subCat === "Ferrite Cores") return { m_code: "MEC", confidence: 0.90, reasoning: `Sub-Category = Ferrite Cores → MEC` };
    if (subCat === "Film Capacitors") {
      if (/chassis\s+mount/i.test(mounting) || /requires\s+holder/i.test(mounting) || /stud\s+mount/i.test(mounting) || /through\s+hole/i.test(mounting)) {
        return { m_code: "TH", confidence: 0.90, reasoning: `Sub-Category = Film Capacitors + chassis/stud/holder/TH mounting → TH` };
      }
    }
    if (subCat === "Card Guides") return { m_code: "Accs", confidence: 0.90, reasoning: `Sub-Category = Card Guides → Accs` };
    if (subCat === "Board Supports") return { m_code: "MEC", confidence: 0.90, reasoning: `Sub-Category = Board Supports → MEC` };
  }

  // Description keyword rules (PAR-13 through PAR-17, PAR-37, PAR-41, PAR-43, PAR-44)
  const features = (input.features ?? "").trim();
  const attachMethod = (input.attachment_method ?? "").trim();
  if (/\bstandoff\b/i.test(desc)) {
    if (/\bsurface\s+mount\b/i.test(features)) return { m_code: "MANSMT", confidence: 0.90, reasoning: `description has "Standoff" + features SMT → MANSMT` };
    return { m_code: "MEC", confidence: 0.88, reasoning: `description has "Standoff" → MEC` };
  }
  if (/\bHEATSINK\b/i.test(desc)) {
    if (/bolt\s+on/i.test(attachMethod)) return { m_code: "MEC", confidence: 0.90, reasoning: `description has "HEATSINK" + Bolt On → MEC` };
    return { m_code: "MANSMT", confidence: 0.88, reasoning: `description has "HEATSINK" → MANSMT` };
  }
  if (/DPAK\s+TO-252/i.test(desc)) return { m_code: "MANSMT", confidence: 0.90, reasoning: `description has "DPAK TO-252" → MANSMT` };
  if (/battery\s+insulator/i.test(desc)) return { m_code: "Accs", confidence: 0.90, reasoning: `description has "Battery Insulator" → Accs` };
  if (/\bspacer\b/i.test(desc)) return { m_code: "Accs", confidence: 0.88, reasoning: `description has "Spacer" → Accs` };
  if (/\bclip\b/i.test(desc)) return { m_code: "Accs", confidence: 0.85, reasoning: `description has "Clip" → Accs` };
  if (/\bclamp\b/i.test(desc)) return { m_code: "Accs", confidence: 0.85, reasoning: `description has "Clamp" → Accs` };
  if (/\brelay\b/i.test(desc) && /\bsurface\s+mount\b/i.test(desc)) return { m_code: "IP", confidence: 0.90, reasoning: `description has "Relay" + SMT → IP` };

  // Category rules (PAR-23 through PAR-29, PAR-39, PAR-40)
  if (/^cables,\s*wires\s*-\s*management$/i.test(category)) return { m_code: "CABLE", confidence: 0.92, reasoning: `Category = Cables, Wires - Management → CABLE` };
  if (/^development\s+boards/i.test(category)) return { m_code: "DEV B", confidence: 0.92, reasoning: `Category = Development Boards → DEV B` };

  // Connectors category branches (VBA lines 351-360, PAR-23 to PAR-29)
  if (/^connectors,\s*interconnects$/i.test(category) || /^connectors$/i.test(category) || /^connector$/i.test(category)) {
    const descHasSmt = /\b(surface\s+mount|SMD|SMT)\b/i.test(desc);
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

  // Additional mounting type branches (PAR-35, PAR-36, PAR-46, PAR-47)
  if (/^pcb,\s*through\s+hole$/i.test(mounting)) return { m_code: "TH", confidence: 0.92, reasoning: `mounting = PCB, Through Hole → TH` };
  if (/^pcb,\s*surface\s+mount$/i.test(mounting)) return { m_code: "MANSMT", confidence: 0.92, reasoning: `mounting = PCB, Surface Mount → MANSMT` };
  if (/^panel,\s*pcb\s+through\s+hole$/i.test(mounting)) return { m_code: "TH", confidence: 0.92, reasoning: `mounting = Panel, PCB Through Hole → TH` };
  if (/^panel\s+mount$/i.test(mounting)) return { m_code: "TH", confidence: 0.92, reasoning: `mounting = Panel Mount → TH` };

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
