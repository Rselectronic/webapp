import type { OverageTier } from "./types";

/**
 * Look up the overage extras for a part-line.
 *
 * `qty` is the PART quantity (qty_per_board × board_qty), NOT the board
 * quantity. The seeded overage_table thresholds go up to 100,000 — they
 * describe part counts. Earlier versions of this helper named the
 * argument `boardQty` and several call sites passed board qty, producing
 * silently-undersized overage (e.g. 30 boards × 10 per-board = 300 parts
 * for a CP part returned 20 extras instead of 50). Param renamed to
 * remove the ambiguity.
 */
export function getOverage(
  mCode: string | null,
  qty: number,
  tiers: OverageTier[]
): number {
  if (!mCode) return 0;

  const relevant = tiers
    .filter((t) => t.m_code === mCode)
    .sort((a, b) => a.qty_threshold - b.qty_threshold);

  if (relevant.length === 0) return 0;

  let extras = 0;
  for (const tier of relevant) {
    if (qty >= tier.qty_threshold) {
      extras = tier.extras;
    }
  }
  return extras;
}

export function getOrderQty(
  qtyPerBoard: number,
  boardQty: number,
  mCode: string | null,
  tiers: OverageTier[]
): number {
  const baseQty = qtyPerBoard * boardQty;
  const extras = getOverage(mCode, baseQty, tiers);
  return baseQty + extras;
}
