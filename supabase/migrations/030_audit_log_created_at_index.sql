-- ============================================================================
-- 030_audit_log_created_at_index.sql
-- Index audit_log.created_at for the /settings/audit page, which always
-- queries ORDER BY created_at DESC. Without this the table does a backward
-- sequential scan on every page load.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON public.audit_log (created_at DESC);
