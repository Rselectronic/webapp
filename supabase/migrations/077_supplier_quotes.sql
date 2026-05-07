-- ============================================================================
-- 077_supplier_quotes.sql
-- (1) Adds suppliers.online_only flag for direct-from-website distributors
--     (DigiKey/Mouser/LCSC) that do NOT participate in the PO/quote flow.
-- (2) Adds supplier_quotes + supplier_quote_lines for the Supplier Quote → PO
--     workflow on RFQ-based suppliers (PCB fab, stencil, mechanical, etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. suppliers.online_only — distributors RS buys from directly via the website
-- ----------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS online_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: existing seeded distributors are online_only.
UPDATE public.suppliers
   SET online_only = TRUE
 WHERE code IN ('DIGIKEY','MOUSER','LCSC');

-- ----------------------------------------------------------------------------
-- 2. supplier_quotes — RFQ-based supplier quotes against a procurement.
--    A PROC may have multiple quotes (one per supplier per scope, e.g. one PCB
--    quote from WMD + one stencil quote from Stentech). Each accepted quote
--    produces exactly one PO via /accept.
-- ----------------------------------------------------------------------------
CREATE TABLE public.supplier_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_contact_id UUID REFERENCES public.supplier_contacts(id),
  currency TEXT NOT NULL CHECK (currency IN ('CAD','USD','EUR','CNY')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','requested','received','accepted','rejected','expired')),
  -- Denormalized totals for fast display (recomputed on insert/update by API).
  subtotal NUMERIC(14,2),
  shipping NUMERIC(14,2) DEFAULT 0,
  tax NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2),
  valid_until DATE,
  notes TEXT,
  -- Audit / lifecycle
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id),
  -- One-to-one link to the resulting PO once accepted.
  resulting_po_id UUID REFERENCES public.supplier_pos(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);
CREATE INDEX idx_supplier_quotes_procurement ON public.supplier_quotes(procurement_id);
CREATE INDEX idx_supplier_quotes_supplier ON public.supplier_quotes(supplier_id);
CREATE INDEX idx_supplier_quotes_status ON public.supplier_quotes(status);

-- ----------------------------------------------------------------------------
-- 3. supplier_quote_lines — per-procurement-line entries in a quote.
--    UNIQUE (quote, procurement_line) prevents double-quoting the same part
--    inside one quote.
-- ----------------------------------------------------------------------------
CREATE TABLE public.supplier_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_id UUID NOT NULL REFERENCES public.supplier_quotes(id) ON DELETE CASCADE,
  procurement_line_id UUID NOT NULL REFERENCES public.procurement_lines(id) ON DELETE CASCADE,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_quote_id, procurement_line_id)
);
CREATE INDEX idx_supplier_quote_lines_quote ON public.supplier_quote_lines(supplier_quote_id);

-- ----------------------------------------------------------------------------
-- 4. updated_at handling — repo convention is application-level (the API
--    routes set updated_at = now() on UPDATE). No DB trigger needed; matches
--    suppliers / supplier_contacts / supplier_pos pattern.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. RLS — read + write for ceo + operations_manager (Piyush enters quotes).
-- ----------------------------------------------------------------------------
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_quote_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_quotes_rw ON public.supplier_quotes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users
           WHERE id = auth.uid()
             AND role IN ('ceo','operations_manager'))
);
CREATE POLICY supplier_quote_lines_rw ON public.supplier_quote_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users
           WHERE id = auth.uid()
             AND role IN ('ceo','operations_manager'))
);
