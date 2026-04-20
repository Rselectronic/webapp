-- pricing_preferences — reusable rules that pick a "winning" distributor per
-- BOM line when the component-pricing review page has quotes from multiple
-- suppliers. 5 system-seeded presets + user-created rows.
--
-- `config` shape varies by `rule`:
--   cheapest_overall                  → {}
--   cheapest_in_stock                 → {}
--   cheapest_in_stock_franchised      → {}
--   shortest_lead_time                → {}
--   strict_priority                   → { priority: [supplier_name, ...] }
--   custom                            → { filters: {...}, sort_by: [...], priority: [...] }

CREATE TABLE IF NOT EXISTS public.pricing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  rule TEXT NOT NULL CHECK (rule IN (
    'cheapest_overall',
    'cheapest_in_stock',
    'cheapest_in_stock_franchised',
    'shortest_lead_time',
    'strict_priority',
    'custom'
  )),
  config JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_preferences_rule
  ON public.pricing_preferences(rule);

ALTER TABLE public.pricing_preferences ENABLE ROW LEVEL SECURITY;

-- All authed users can read. Only CEO + operations_manager can write.
-- DROP-before-CREATE keeps this file idempotent — you can re-run it after a
-- partial failure without hitting "policy already exists".
DROP POLICY IF EXISTS pricing_preferences_read ON public.pricing_preferences;
CREATE POLICY pricing_preferences_read ON public.pricing_preferences
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pricing_preferences_write ON public.pricing_preferences;
CREATE POLICY pricing_preferences_write ON public.pricing_preferences
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager')
    )
  );

-- Seed the 5 system presets. is_system=TRUE prevents user deletion via the
-- UI (enforce at API layer). Names are user-facing — keep them short.
INSERT INTO public.pricing_preferences (name, rule, config, is_system)
VALUES
  ('Cheapest', 'cheapest_overall', '{}'::jsonb, TRUE),
  ('Cheapest in stock', 'cheapest_in_stock', '{}'::jsonb, TRUE),
  ('Cheapest in stock (authorized)', 'cheapest_in_stock_franchised', '{}'::jsonb, TRUE),
  ('Shortest lead time', 'shortest_lead_time', '{}'::jsonb, TRUE),
  (
    'DigiKey → Mouser → LCSC → others',
    'strict_priority',
    jsonb_build_object(
      'priority',
      jsonb_build_array('digikey', 'mouser', 'lcsc', 'avnet', 'arrow', 'tti', 'newark', 'samtec', 'ti', 'tme', 'future', 'esonic')
    ),
    TRUE
  )
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.pricing_preferences IS
  'Named rules that auto-pick a winning distributor per BOM line on the pricing review step. Users can create custom rules alongside the 5 system presets.';
