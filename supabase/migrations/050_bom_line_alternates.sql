-- Customer-supplied and operator-added alternate MPNs per BOM line.
--
-- Background: customers often list multiple manufacturer part numbers for a
-- single component — primary + second source + cross-references — across
-- extra columns in their BOM ("Alternate 1", "Second Source", etc.). The
-- parser now captures those columns instead of dropping them, and the pricing
-- review step fetches quotes for every alternate so the operator can pick the
-- best stock / price / lead-time combination per tier.
--
-- One row per (bom_line, candidate MPN). rank=0 mirrors bom_lines.mpn so the
-- fetch loop can iterate a single uniform list.

CREATE TABLE IF NOT EXISTS public.bom_line_alternates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_line_id UUID NOT NULL REFERENCES public.bom_lines(id) ON DELETE CASCADE,
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  -- Where this alternate came from. 'customer' rows come straight from the
  -- uploaded BOM; 'rs_alt' comes from components.alt_mpn (our substitution
  -- history); 'operator' is added manually on the pricing review page.
  source TEXT NOT NULL DEFAULT 'customer'
    CHECK (source IN ('customer', 'rs_alt', 'operator')),
  -- 0 = the BOM line's primary MPN (mirrored in for iteration uniformity).
  -- 1..N = alternates in the order the customer listed them, stable so the UI
  -- doesn't reshuffle on re-render.
  rank INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A given MPN should appear at most once per bom_line — dedupe across the
  -- primary column and any alternate columns that happen to repeat it.
  UNIQUE (bom_line_id, mpn)
);

CREATE INDEX IF NOT EXISTS idx_bom_line_alternates_bom_line
  ON public.bom_line_alternates(bom_line_id);

ALTER TABLE public.bom_line_alternates ENABLE ROW LEVEL SECURITY;

CREATE POLICY bom_line_alternates_ceo_ops_all
  ON public.bom_line_alternates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('ceo', 'operations_manager')
    )
  );
