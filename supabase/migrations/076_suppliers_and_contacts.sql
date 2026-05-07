-- ============================================================================
-- 076_suppliers_and_contacts.sql
-- Approved Suppliers feature: master vendor list + contacts + PO linkage.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. suppliers — master list of approved vendors RS sends POs to.
--    `code` is a short uppercase identifier (DIGIKEY, WMD, etc.).
--    `is_approved=false` on creation; CEO flips it to true to enable the
--    supplier for new POs.
-- ----------------------------------------------------------------------------
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL CHECK (code ~ '^[A-Z0-9]{2,15}$'),
  legal_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('distributor','pcb_fab','stencil','mechanical','assembly','other')),
  default_currency TEXT NOT NULL DEFAULT 'CAD' CHECK (default_currency IN ('CAD','USD','EUR','CNY')),
  payment_terms TEXT,
  billing_address JSONB DEFAULT '{}',  -- { line1, line2, city, state_province, postal_code, country }
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  -- online_only = true for distributors RS buys directly from on the website
  -- (DigiKey, Mouser, LCSC). These are excluded from the supplier-quote / PO
  -- flow but kept in the table for API credentials and historical reference.
  -- Added retroactively here so a fresh DB setup matches production. Existing
  -- DBs get this column via migration 077.
  online_only BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE INDEX idx_suppliers_approved ON public.suppliers(is_approved) WHERE is_approved = TRUE;
CREATE INDEX idx_suppliers_category ON public.suppliers(category);

-- ----------------------------------------------------------------------------
-- 2. supplier_contacts — 1..N contacts per supplier. Exactly one is_primary
--    per supplier (enforced via partial unique index).
-- ----------------------------------------------------------------------------
CREATE TABLE public.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_contacts_supplier ON public.supplier_contacts(supplier_id);
CREATE UNIQUE INDEX idx_supplier_contacts_one_primary
  ON public.supplier_contacts(supplier_id) WHERE is_primary = TRUE;

-- ----------------------------------------------------------------------------
-- 3. supplier_pos — add FK + currency. Existing rows stay unlinked
--    (supplier_name as snapshot still renders correctly on legacy POs).
-- ----------------------------------------------------------------------------
ALTER TABLE public.supplier_pos
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS supplier_contact_id UUID REFERENCES public.supplier_contacts(id),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CAD'
    CHECK (currency IN ('CAD','USD','EUR','CNY')),
  ADD COLUMN IF NOT EXISTS cc_emails TEXT;  -- free-text additional CCs, comma-separated

CREATE INDEX IF NOT EXISTS idx_supplier_pos_supplier_id ON public.supplier_pos(supplier_id);

-- ----------------------------------------------------------------------------
-- 4. RLS — Read: CEO + ops_manager. Write: CEO only.
-- ----------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_read ON public.suppliers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
          AND role IN ('ceo','operations_manager'))
);
CREATE POLICY suppliers_write ON public.suppliers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

CREATE POLICY supplier_contacts_read ON public.supplier_contacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
          AND role IN ('ceo','operations_manager'))
);
CREATE POLICY supplier_contacts_write ON public.supplier_contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- ----------------------------------------------------------------------------
-- 5. Seed: 8 approved suppliers + their contacts.
--    All inserted as is_approved=TRUE (one-time fixture).
-- ----------------------------------------------------------------------------
WITH new_suppliers AS (
  INSERT INTO public.suppliers (code, legal_name, category, default_currency, is_approved, online_only)
  VALUES
    ('DIGIKEY',  'DigiKey Electronics',     'distributor', 'USD', TRUE, TRUE),
    ('MOUSER',   'Mouser Electronics',      'distributor', 'USD', TRUE, TRUE),
    ('LCSC',     'LCSC Electronics',        'distributor', 'USD', TRUE, TRUE),
    ('WMD',      'WMD Circuits',            'pcb_fab',     'USD', TRUE, FALSE),
    ('CANDOR',   'Candor Circuit Boards',   'pcb_fab',     'CAD', TRUE, FALSE),
    ('STENTECH', 'Stentech',                'stencil',     'CAD', TRUE, FALSE),
    ('PCBWAY',   'PCBWay',                  'pcb_fab',     'USD', TRUE, FALSE),
    ('BISCO',    'Bisco Industries',        'mechanical',  'USD', TRUE, FALSE)
  RETURNING id, code
)
INSERT INTO public.supplier_contacts (supplier_id, name, email, is_primary)
SELECT
  ns.id,
  c.name,
  c.email,
  TRUE
FROM new_suppliers ns
JOIN (VALUES
    ('WMD',      'Mike',     'mike@wmdpcb.cn'),
    ('CANDOR',   'Sunny',    'sunny@candorcircuitboards.com'),
    ('STENTECH', 'Prakash (Markham)', 'markham@stentech.com'),
    ('PCBWAY',   'Service',  'service19@pcbway.com')
) AS c(code, name, email) ON c.code = ns.code;
