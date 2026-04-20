-- quote_customer_supplied — per-quote list of BOM lines that the customer
-- will supply themselves (RS doesn't procure them). Flagged during the
-- component-pricing step of the quote wizard. Same part can be customer-
-- supplied on one quote and RS-procured on the next; the link is strictly
-- to (quote_id, bom_line_id), not to the BOM line alone.

CREATE TABLE IF NOT EXISTS public.quote_customer_supplied (
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  bom_line_id UUID NOT NULL REFERENCES public.bom_lines(id) ON DELETE CASCADE,
  notes TEXT,
  added_by UUID REFERENCES public.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (quote_id, bom_line_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_customer_supplied_quote
  ON public.quote_customer_supplied(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_customer_supplied_line
  ON public.quote_customer_supplied(bom_line_id);

ALTER TABLE public.quote_customer_supplied ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_customer_supplied_rw ON public.quote_customer_supplied;
CREATE POLICY quote_customer_supplied_rw ON public.quote_customer_supplied
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager')
    )
  );

COMMENT ON TABLE public.quote_customer_supplied IS
  'Per-quote flag: lines in here are supplied by the customer on THIS quote''s PO. Engine subtracts them from the component total; PDF renders a "Customer to supply" section.';
