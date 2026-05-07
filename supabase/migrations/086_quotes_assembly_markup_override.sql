-- ============================================================================
-- Per-quote assembly markup override + global default.
--
-- Mirror of migration 061's component / PCB pattern. Adds:
--   • quotes.assembly_markup_pct_override (nullable; null = use global setting)
--   • Seeds the global pricing settings JSONB with assembly_markup_pct = 30
--     so existing quotes that haven't been recalculated still see a default.
-- ============================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS assembly_markup_pct_override NUMERIC(6, 3);

COMMENT ON COLUMN public.quotes.assembly_markup_pct_override IS
  'When non-null, overrides pricing_settings.assembly_markup_pct for this quote only. NULL means use the global setting.';

-- Seed the global default into app_settings.pricing (JSONB merge — only set
-- if the key isn't already there, so re-running the migration is safe).
UPDATE public.app_settings
   SET value = value || jsonb_build_object('assembly_markup_pct', 30)
 WHERE key = 'pricing'
   AND NOT (value ? 'assembly_markup_pct');
