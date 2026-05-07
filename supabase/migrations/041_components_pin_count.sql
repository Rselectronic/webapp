-- Add pin_count to components master library.
-- Used by the pricing engine for TH (Through-Hole) assembly time calculation.
-- Ported from DM Common File MasterSheet / Procurement sheet "TH Pins" column,
-- which VBA THpinsExists() validates before allowing a quote to be priced.

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS pin_count INT;

COMMENT ON COLUMN public.components.pin_count IS
  'Number of through-hole pins. Required for components with m_code = ''TH'' so assembly time can be calculated (TH cost = pin_count * th_cost_per_pin). NULL for non-TH parts.';
