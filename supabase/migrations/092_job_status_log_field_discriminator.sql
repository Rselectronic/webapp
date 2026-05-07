-- ============================================================================
-- 092_job_status_log_field_discriminator.sql
--
-- Extend `job_status_log` so it can record more than just lifecycle status
-- changes. A new `field` column tags each row with which job attribute
-- changed:
--
--   'status'             — the existing job lifecycle (created → procurement
--                          → … → archived). All historical rows are this.
--   'programming_status' — programming readiness (migration 090):
--                          not_ready / ready / not_required.
--
-- The `old_status` / `new_status` columns now hold whatever the from/to
-- value of the named field was, regardless of which field that is. The
-- column names stay (no rename) to avoid a sweep of read paths and to
-- keep the diff tight.
--
-- Backfill: existing rows are stamped 'status' via the column DEFAULT, so
-- no separate UPDATE is needed — Postgres applies DEFAULT to existing
-- rows when adding a NOT NULL column with a constant default.
-- ============================================================================

ALTER TABLE public.job_status_log
  ADD COLUMN IF NOT EXISTS field TEXT NOT NULL DEFAULT 'status';

-- Tighten with a CHECK so accidental values get rejected early.
ALTER TABLE public.job_status_log
  DROP CONSTRAINT IF EXISTS job_status_log_field_check;

ALTER TABLE public.job_status_log
  ADD CONSTRAINT job_status_log_field_check
  CHECK (field IN ('status', 'programming_status'));

COMMENT ON COLUMN public.job_status_log.field IS
  'Which job attribute changed: status (lifecycle) or programming_status. old_status/new_status hold the from/to values for the named field.';
