ALTER TABLE public.procurement_line_selections
  ADD COLUMN IF NOT EXISTS manual_unit_price_cad NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS manual_price_note TEXT;

COMMENT ON COLUMN public.procurement_line_selections.manual_unit_price_cad IS
  'Operator-entered unit price (CAD) that overrides cached/quoted prices. Used for sales-rep quoted prices (email/phone quotes) that aren''t in the distributor API.';
COMMENT ON COLUMN public.procurement_line_selections.manual_price_note IS
  'Free-text note about where the manual price came from (e.g. "Quoted by Sarah at TTI via email 2026-04-20").';
