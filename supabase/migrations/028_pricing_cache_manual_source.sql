-- ============================================================================
-- 028_pricing_cache_manual_source.sql
-- Allow 'manual' as a source value in api_pricing_cache so the CEO can
-- manually enter prices for components that DigiKey/Mouser/LCSC can't price.
-- ============================================================================

ALTER TABLE public.api_pricing_cache
  DROP CONSTRAINT IF EXISTS api_pricing_cache_source_check;

ALTER TABLE public.api_pricing_cache
  ADD CONSTRAINT api_pricing_cache_source_check
  CHECK (source IN ('digikey', 'mouser', 'lcsc', 'manual'));
