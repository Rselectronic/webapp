-- ============================================================================
-- 038_historical_procurement_pricing.sql
--
-- Add 'procurement_history' as a valid source in api_pricing_cache so that
-- historical procurement prices can be cached with a 30-day TTL.
-- Also add an index on procurement_lines.mpn for efficient historical lookups.
-- ============================================================================

-- Widen the source CHECK to include procurement_history
ALTER TABLE public.api_pricing_cache
  DROP CONSTRAINT IF EXISTS api_pricing_cache_source_check;

ALTER TABLE public.api_pricing_cache
  ADD CONSTRAINT api_pricing_cache_source_check
  CHECK (source IN ('digikey', 'mouser', 'lcsc', 'manual', 'procurement_history'));

-- Index for historical price lookups by MPN (case-insensitive via upper())
CREATE INDEX IF NOT EXISTS idx_procurement_lines_mpn
  ON public.procurement_lines (upper(mpn));
