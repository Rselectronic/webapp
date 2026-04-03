import type { OverageTier } from "./types";

export function getOverage(
  mCode: string | null,
  boardQty: number,
  tiers: OverageTier[]
): number {
  if (!mCode) return 0;

  const relevant = tiers
    .filter((t) => t.m_code === mCode)
    .sort((a, b) => a.qty_threshold - b.qty_threshold);

  if (relevant.length === 0) return 0;

  let extras = 0;
  for (const tier of relevant) {
    if (boardQty >= tier.qty_threshold) {
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
  const extras = getOverage(mCode, boardQty, tiers);
  return qtyPerBoard * boardQty + extras;
}
