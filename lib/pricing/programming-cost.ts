/**
 * Programming cost lookup table.
 * Source: RS PCB Assembly pricing metric spreadsheet (Anas, April 2026).
 *
 * Based on BOM line count and board type (single-sided vs double-sided).
 * Double-sided price = Standard price + $100 always.
 *
 * Tiers:
 *   1-39 lines:  base $300, additional $50 per 10-line tier up to 60
 *   70+ lines:   additional $75 per 10-line tier
 */

const PROGRAMMING_TIERS: { min_lines: number; standard: number; double_side: number }[] = [
  { min_lines: 1,   standard: 300,  double_side: 400  },
  { min_lines: 40,  standard: 350,  double_side: 450  },
  { min_lines: 50,  standard: 400,  double_side: 500  },
  { min_lines: 60,  standard: 450,  double_side: 550  },
  { min_lines: 70,  standard: 525,  double_side: 625  },
  { min_lines: 80,  standard: 600,  double_side: 700  },
  { min_lines: 90,  standard: 675,  double_side: 775  },
  { min_lines: 100, standard: 750,  double_side: 850  },
  { min_lines: 110, standard: 825,  double_side: 925  },
  { min_lines: 120, standard: 900,  double_side: 1000 },
  { min_lines: 130, standard: 975,  double_side: 1075 },
  { min_lines: 140, standard: 1050, double_side: 1150 },
  { min_lines: 150, standard: 1125, double_side: 1225 },
  { min_lines: 160, standard: 1200, double_side: 1300 },
  { min_lines: 170, standard: 1275, double_side: 1375 },
  { min_lines: 180, standard: 1350, double_side: 1450 },
  { min_lines: 190, standard: 1425, double_side: 1525 },
  { min_lines: 200, standard: 1500, double_side: 1600 },
  { min_lines: 210, standard: 1575, double_side: 1675 },
  { min_lines: 220, standard: 1650, double_side: 1750 },
  { min_lines: 230, standard: 1725, double_side: 1825 },
  { min_lines: 240, standard: 1800, double_side: 1900 },
  { min_lines: 250, standard: 1875, double_side: 1975 },
  { min_lines: 260, standard: 1950, double_side: 2050 },
  { min_lines: 270, standard: 2025, double_side: 2125 },
  { min_lines: 280, standard: 2100, double_side: 2200 },
  { min_lines: 290, standard: 2175, double_side: 2275 },
  { min_lines: 300, standard: 2250, double_side: 2350 },
];

/**
 * Calculate programming cost based on BOM line count and board type.
 *
 * @param bomLineCount - Number of component lines in the BOM (non-PCB, non-DNI)
 * @param isDoubleSided - true for double-sided boards (gmps.board_side = 'double'),
 *                        false for single-sided (board_side = 'single')
 * @returns Programming cost in CAD
 */
export function calculateProgrammingCost(
  bomLineCount: number,
  isDoubleSided: boolean = true
): number {
  if (bomLineCount <= 0) return 0;

  // Find the matching tier (last tier where bomLineCount >= min_lines)
  let matched = PROGRAMMING_TIERS[0];
  for (const tier of PROGRAMMING_TIERS) {
    if (bomLineCount >= tier.min_lines) {
      matched = tier;
    } else {
      break;
    }
  }

  // For lines beyond 300, extrapolate at $75 per 10-line tier
  if (bomLineCount >= 300) {
    const extraTiers = Math.floor((bomLineCount - 300) / 10);
    return isDoubleSided
      ? matched.double_side + extraTiers * 75
      : matched.standard + extraTiers * 75;
  }

  return isDoubleSided ? matched.double_side : matched.standard;
}

/**
 * Convert a `gmps.board_side` value into the boolean shape the programming
 * cost table expects. `'double'` (top + bottom SMT) is the most common board
 * style at RS, so it's the safe default when the GMP record hasn't been
 * filled in yet.
 */
export function isDoubleSidedBoard(boardSide: string | null | undefined): boolean {
  if (boardSide === "single") return false;
  if (boardSide === "double") return true;
  return true; // unknown / NULL → assume double-sided
}

export type BoardSide = "single" | "double";

export { PROGRAMMING_TIERS };
