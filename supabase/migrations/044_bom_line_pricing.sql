-- bom_line_pricing — persists Piyush's per-tier supplier selection for each
-- BOM line. The Component Pricing Review page writes rows here; the quote
-- engine reads them first (falls back to cheapest cached price when no pick
-- exists).
--
-- One row per (bom_line, tier_qty) — a BOM line can be sourced from DigiKey
-- for qty 100 and Mouser for qty 500 if that's the best economics.

CREATE TABLE IF NOT EXISTS public.bom_line_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_line_id UUID NOT NULL REFERENCES public.bom_lines(id) ON DELETE CASCADE,
  tier_qty INT NOT NULL,                  -- board qty tier this pick applies to
  supplier TEXT NOT NULL,                 -- supplier name (digikey, mouser, avnet, ...)
  supplier_part_number TEXT,              -- distributor's own PN at the time of selection
  selected_unit_price DECIMAL(12,6) NOT NULL,
  selected_currency TEXT NOT NULL,
  selected_unit_price_cad DECIMAL(12,6),  -- converted at fx_rate; NULL if currency=CAD
  fx_rate DECIMAL(12,6),                  -- rate used at selection time (NULL if native CAD)
  selected_lead_time_days INT,
  selected_stock_qty INT,
  warehouse_code TEXT,                    -- for multi-warehouse suppliers (Arrow, Newark)
  notes TEXT,
  selected_by UUID REFERENCES public.users(id),
  selected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bom_line_id, tier_qty)
);

CREATE INDEX IF NOT EXISTS idx_bom_line_pricing_bom_line
  ON public.bom_line_pricing(bom_line_id);

CREATE INDEX IF NOT EXISTS idx_bom_line_pricing_supplier
  ON public.bom_line_pricing(supplier);

ALTER TABLE public.bom_line_pricing ENABLE ROW LEVEL SECURITY;

-- CEO + operations_manager can read / write selections
DROP POLICY IF EXISTS bom_line_pricing_rw ON public.bom_line_pricing;
CREATE POLICY bom_line_pricing_rw ON public.bom_line_pricing FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager')
  )
);

COMMENT ON TABLE public.bom_line_pricing IS
  'Per-BOM-line per-tier supplier selections made on the Component Pricing Review page. Quote engine reads these before falling back to cheapest cached price.';
