-- ============================================================================
-- Add a per-PROC operator override for "qty to buy" on the merged BOM.
--
-- Default behavior of the merged BOM uses `total_with_extras` (the qty needed
-- for the boards plus M-Code overage) as the buy quantity. Today the
-- operator has no way to say "buy 5,000 of this 980-shortfall BG part as a
-- reel" without hopping to the inventory page; the new BG/Safety inventory
-- workflow needs to express that override and have it survive refresh.
--
-- One nullable column does the job. Null = use the computed default. The
-- merged BOM and PO-export flows both consult this column when present.
-- ============================================================================

ALTER TABLE public.procurement_line_selections
  ADD COLUMN IF NOT EXISTS manual_buy_qty INT
    CHECK (manual_buy_qty IS NULL OR manual_buy_qty >= 0);

COMMENT ON COLUMN public.procurement_line_selections.manual_buy_qty IS
  'Operator-overridden buy quantity for this PROC + CPC. NULL = use the merged-BOM default (total_with_extras for non-BG, shortfall for BG-short, 0 for BG-fully-covered). Persists across refreshes.';
