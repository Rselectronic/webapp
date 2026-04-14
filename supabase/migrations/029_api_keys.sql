-- ============================================================================
-- 029_api_keys.sql
-- Permanent API keys for MCP access. Raw keys are shown ONCE on creation
-- then only the SHA-256 hash is stored. Keys are revoked by setting
-- revoked_at; they are never hard-deleted (audit trail).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL DEFAULT 'ceo'
                    CHECK (role IN ('ceo','operations_manager','shop_floor')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES public.users(id),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash_active
  ON public.api_keys(key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- CEO-only: select, insert, update (for revocation). No delete policy — rows
-- are never hard-deleted.
DROP POLICY IF EXISTS api_keys_ceo_select ON public.api_keys;
CREATE POLICY api_keys_ceo_select ON public.api_keys
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

DROP POLICY IF EXISTS api_keys_ceo_insert ON public.api_keys;
CREATE POLICY api_keys_ceo_insert ON public.api_keys
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

DROP POLICY IF EXISTS api_keys_ceo_update ON public.api_keys;
CREATE POLICY api_keys_ceo_update ON public.api_keys
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ceo')
  );

COMMENT ON TABLE public.api_keys IS 'Permanent API keys for MCP access. Raw keys shown once on creation; only SHA-256 hash is stored.';
