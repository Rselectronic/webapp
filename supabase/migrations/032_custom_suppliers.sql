-- ============================================================================
-- 032_custom_suppliers.sql
-- User-defined distributors. The 12 built-in distributors live in code
-- (SUPPLIER_METADATA constant in lib/supplier-credentials.ts) and have real
-- test connection implementations. Custom distributors live here and can
-- be added at runtime through /settings/api-config without a code deploy.
--
-- Credentials for custom distributors flow through the same supplier_credentials
-- table — just keyed by the custom supplier's name.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.custom_suppliers (
  name                  TEXT PRIMARY KEY,           -- internal key, e.g., "octopart"
  display_name          TEXT NOT NULL,              -- human label, e.g., "Octopart"
  fields                JSONB NOT NULL,             -- [{key, label, type, required, options?, placeholder?}]
  supported_currencies  TEXT[] NOT NULL DEFAULT ARRAY['USD','CAD','EUR','GBP'],
  default_currency      TEXT NOT NULL DEFAULT 'CAD',
  docs_url              TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES public.users(id),
  CHECK (name ~ '^[a-z][a-z0-9_-]*$')               -- lowercase, alnum + hyphen/underscore
);

ALTER TABLE public.custom_suppliers ENABLE ROW LEVEL SECURITY;

-- CEO + ops manager (matches the supplier_credentials policies)
DROP POLICY IF EXISTS custom_suppliers_select ON public.custom_suppliers;
CREATE POLICY custom_suppliers_select ON public.custom_suppliers
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ceo','operations_manager'))
  );

DROP POLICY IF EXISTS custom_suppliers_insert ON public.custom_suppliers;
CREATE POLICY custom_suppliers_insert ON public.custom_suppliers
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ceo','operations_manager'))
  );

DROP POLICY IF EXISTS custom_suppliers_delete ON public.custom_suppliers;
CREATE POLICY custom_suppliers_delete ON public.custom_suppliers
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('ceo','operations_manager'))
  );

COMMENT ON TABLE public.custom_suppliers IS 'User-defined distributors added via /settings/api-config. The 12 built-in distributors live in SUPPLIER_METADATA in lib/supplier-credentials.ts.';
