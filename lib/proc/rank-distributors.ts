export interface PriceBreak {
  min_qty: number;
  unit_price: number;
  unit_price_cad: number | null;
  currency: string;
}

export interface DistributorQuote {
  source: string;
  supplier_pn: string | null;
  manufacturer: string | null;
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  lead_time_days: number | null;
  price_breaks: PriceBreak[];
  unit_price_cad_fallback: number | null;
  currency: string;
  fetched_at: string;
}

export interface RankingInput {
  qty_needed: number;
  quotes: DistributorQuote[];
}

export interface RankedQuote extends DistributorQuote {
  effective_qty: number;
  effective_unit_price_cad: number | null;
  extended_cost_cad: number | null;
  in_stock: boolean;
  disqualified_reason: string | null;
}

export interface RankingResult {
  ranked: RankedQuote[];
  winner: RankedQuote | null;
  fallback_because_no_stock: boolean;
}

function computeEffectiveQty(qtyNeeded: number, moq: number | null, mult: number | null): number {
  const m = moq && moq > 0 ? moq : 1;
  const mu = mult && mult > 0 ? mult : 1;
  const base = Math.max(qtyNeeded, m);
  return Math.ceil(base / mu) * mu;
}

function pickBreakPrice(breaks: PriceBreak[], effQty: number): number | null {
  if (!breaks || breaks.length === 0) return null;
  const sorted = [...breaks].sort((a, b) => a.min_qty - b.min_qty);
  let chosen: PriceBreak | null = null;
  for (const b of sorted) {
    if (b.min_qty <= effQty) chosen = b;
    else break;
  }
  if (!chosen) return null;
  return chosen.unit_price_cad;
}

export function rankDistributors(input: RankingInput): RankingResult {
  const { qty_needed, quotes } = input;

  const evaluated: RankedQuote[] = quotes.map((q) => {
    const effective_qty = computeEffectiveQty(qty_needed, q.moq, q.order_multiple);
    let effective_unit_price_cad = pickBreakPrice(q.price_breaks, effective_qty);
    if (effective_unit_price_cad == null) {
      effective_unit_price_cad = q.unit_price_cad_fallback;
    }
    const disqualified_reason = effective_unit_price_cad == null ? "no CAD price" : null;
    const extended_cost_cad =
      effective_unit_price_cad == null ? null : effective_unit_price_cad * effective_qty;
    const in_stock = (q.stock_qty ?? 0) >= effective_qty;
    return {
      ...q,
      effective_qty,
      effective_unit_price_cad,
      extended_cost_cad,
      in_stock,
      disqualified_reason,
    };
  });

  const ranked = [...evaluated].sort((a, b) => {
    const aNull = a.extended_cost_cad == null;
    const bNull = b.extended_cost_cad == null;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return (a.extended_cost_cad as number) - (b.extended_cost_cad as number);
  });

  const inStockPriced = ranked.filter(
    (q) => q.in_stock && q.extended_cost_cad != null,
  );

  let winner: RankedQuote | null = null;
  let fallback_because_no_stock = false;

  if (inStockPriced.length > 0) {
    winner = inStockPriced[0];
    fallback_because_no_stock = false;
  } else {
    const priced = ranked.filter((q) => q.extended_cost_cad != null);
    if (priced.length > 0) {
      const byLead = [...priced].sort((a, b) => {
        const al = a.lead_time_days == null ? Infinity : a.lead_time_days;
        const bl = b.lead_time_days == null ? Infinity : b.lead_time_days;
        if (al !== bl) return al - bl;
        return (a.extended_cost_cad as number) - (b.extended_cost_cad as number);
      });
      winner = byLead[0];
      fallback_because_no_stock = true;
    } else {
      winner = null;
      fallback_because_no_stock = false;
    }
  }

  return { ranked, winner, fallback_because_no_stock };
}
