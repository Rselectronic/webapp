-- App-wide settings key/value store
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- CEO can read and write all settings
CREATE POLICY settings_ceo ON public.app_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations manager can read settings
CREATE POLICY settings_ops_read ON public.app_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Seed default pricing settings
INSERT INTO public.app_settings (key, value) VALUES (
  'pricing',
  '{
    "component_markup_pct": 20,
    "pcb_markup_pct": 30,
    "smt_cost_per_placement": 0.35,
    "th_cost_per_placement": 0.75,
    "mansmt_cost_per_placement": 1.25,
    "default_nre": 350,
    "default_shipping": 200,
    "quote_validity_days": 30,
    "labour_rate_per_hour": 75,
    "currency": "CAD"
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
