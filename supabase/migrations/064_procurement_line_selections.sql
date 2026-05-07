CREATE TABLE IF NOT EXISTS public.procurement_line_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  mpn TEXT NOT NULL,
  chosen_supplier TEXT NOT NULL,
  chosen_supplier_pn TEXT,
  chosen_unit_price_cad NUMERIC(12,4),
  chosen_effective_qty INT,
  chose_at TIMESTAMPTZ DEFAULT NOW(),
  chosen_by UUID REFERENCES public.users(id),
  UNIQUE (procurement_id, mpn)
);

CREATE INDEX IF NOT EXISTS idx_procurement_line_selections_procurement
  ON public.procurement_line_selections(procurement_id);

ALTER TABLE public.procurement_line_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY pls_ceo_ops ON public.procurement_line_selections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')));

COMMENT ON TABLE public.procurement_line_selections IS 'Records the chosen distributor/supplier for a given MPN within a procurement. One row per (procurement, mpn) capturing the winning quote after distributor ranking.';
COMMENT ON COLUMN public.procurement_line_selections.id IS 'Primary key (UUID).';
COMMENT ON COLUMN public.procurement_line_selections.procurement_id IS 'FK to procurements; the procurement this selection belongs to.';
COMMENT ON COLUMN public.procurement_line_selections.mpn IS 'Manufacturer Part Number this selection applies to within the procurement.';
COMMENT ON COLUMN public.procurement_line_selections.chosen_supplier IS 'Supplier/source chosen (e.g., digikey, mouser, lcsc, arrow).';
COMMENT ON COLUMN public.procurement_line_selections.chosen_supplier_pn IS 'Supplier-specific part number for the chosen quote.';
COMMENT ON COLUMN public.procurement_line_selections.chosen_unit_price_cad IS 'Effective unit price in CAD at the chosen break ladder tier.';
COMMENT ON COLUMN public.procurement_line_selections.chosen_effective_qty IS 'Effective order quantity after applying MOQ and order multiple rounding.';
COMMENT ON COLUMN public.procurement_line_selections.chose_at IS 'Timestamp when this selection was recorded.';
COMMENT ON COLUMN public.procurement_line_selections.chosen_by IS 'FK to users; the user who confirmed/locked this selection.';
