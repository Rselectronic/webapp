-- fx_rates — cached foreign-exchange rates keyed to CAD (our reporting currency).
-- Used by the Component Pricing Review page: one row per (from_currency, to_currency)
-- pair, updated by the "Fetch Live Rates" button and optionally overridden manually
-- by the CEO. The bom_line_pricing row stores the rate that was applied at selection
-- time, so historical quotes remain stable even when the rate table changes.

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate DECIMAL(12,6) NOT NULL,
  source TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'manual')),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id),
  UNIQUE(from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair
  ON public.fx_rates(from_currency, to_currency);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read; only CEO + operations_manager can update.
DROP POLICY IF EXISTS fx_rates_read ON public.fx_rates;
CREATE POLICY fx_rates_read ON public.fx_rates FOR SELECT USING (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS fx_rates_write ON public.fx_rates;
CREATE POLICY fx_rates_write ON public.fx_rates FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager')
  )
);

COMMENT ON TABLE public.fx_rates IS
  'Live + manual FX rates used to convert supplier prices into CAD on the Component Pricing Review page. Updated via a button in the UI; bom_line_pricing snapshots the rate used at selection time.';

-- Seed a CAD→CAD identity row so the FX lookup never NULL-fails when a quote
-- is already in the reporting currency.
INSERT INTO public.fx_rates (from_currency, to_currency, rate, source)
VALUES ('CAD', 'CAD', 1.0, 'manual')
ON CONFLICT (from_currency, to_currency) DO NOTHING;
