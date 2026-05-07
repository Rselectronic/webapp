-- ============================================
-- 061: per-quote markup overrides
-- ============================================
-- Allows a quote to override the global component/PCB markup set in
-- Settings → Pricing. NULL columns mean "use the global setting" — only
-- populated values override.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS component_markup_pct_override NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS pcb_markup_pct_override       NUMERIC(6, 3);

COMMENT ON COLUMN public.quotes.component_markup_pct_override IS
  'When non-null, overrides pricing_settings.component_markup_pct for this quote only.';
COMMENT ON COLUMN public.quotes.pcb_markup_pct_override IS
  'When non-null, overrides pricing_settings.pcb_markup_pct for this quote only.';
