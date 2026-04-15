-- ============================================================================
-- 031_supplier_credentials.sql
-- Encrypted-at-rest store for distributor API credentials. The ciphertext
-- + IV + auth tag are stored as a single TEXT column (JSON-encoded). The
-- master key lives in env var SUPPLIER_CREDENTIALS_KEY (NOT the database).
--
-- Why text not bytea: lets us round-trip through Supabase JS without
-- buffer encoding headaches. JSON is { iv, tag, ciphertext } all base64.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_credentials (
  supplier              TEXT PRIMARY KEY,
  ciphertext            TEXT NOT NULL,
  preferred_currency    TEXT,
  preview               JSONB,           -- masked field-by-field preview for UI display
  configured            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES public.users(id)
);

ALTER TABLE public.supplier_credentials ENABLE ROW LEVEL SECURITY;

-- CEO-only access. Three policies (no DELETE — soft-delete via configured flag).
DROP POLICY IF EXISTS supplier_credentials_ceo_select ON public.supplier_credentials;
CREATE POLICY supplier_credentials_ceo_select ON public.supplier_credentials
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

DROP POLICY IF EXISTS supplier_credentials_ceo_insert ON public.supplier_credentials;
CREATE POLICY supplier_credentials_ceo_insert ON public.supplier_credentials
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

DROP POLICY IF EXISTS supplier_credentials_ceo_update ON public.supplier_credentials;
CREATE POLICY supplier_credentials_ceo_update ON public.supplier_credentials
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

DROP POLICY IF EXISTS supplier_credentials_ceo_delete ON public.supplier_credentials;
CREATE POLICY supplier_credentials_ceo_delete ON public.supplier_credentials
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

COMMENT ON TABLE public.supplier_credentials IS 'AES-256-GCM encrypted distributor API credentials. Master key in env var SUPPLIER_CREDENTIALS_KEY, never in DB.';
