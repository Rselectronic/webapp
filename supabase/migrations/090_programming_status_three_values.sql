-- ============================================================================
-- 090_programming_status_three_values.sql
--
-- Replace `jobs.programming_status` enum with the new three-state shape:
--   'not_ready'    — default; firmware/program not yet prepared for this job
--   'ready'        — program is on hand and validated
--   'not_required' — board has no programming step
--
-- Auto-flip rule (enforced in the API on job creation, not here):
--   If a prior job exists for the same bom_id, the new job starts as 'ready'
--   automatically (we've programmed this exact BOM revision before).
--
-- Backfill (current data: 8 rows, all 'not_needed'):
--   not_needed              → not_required
--   pending, in_progress    → not_ready
--   done                    → ready
-- ============================================================================

-- 1. Drop the old CHECK so the UPDATE below doesn't violate it.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_programming_status_check;

-- 2. Drop the default temporarily — we're about to change its allowed value.
ALTER TABLE public.jobs
  ALTER COLUMN programming_status DROP DEFAULT;

-- 3. Backfill existing rows.
UPDATE public.jobs
   SET programming_status = CASE programming_status
     WHEN 'not_needed'   THEN 'not_required'
     WHEN 'done'         THEN 'ready'
     WHEN 'pending'      THEN 'not_ready'
     WHEN 'in_progress'  THEN 'not_ready'
     ELSE 'not_ready'
   END
 WHERE programming_status IN ('not_needed', 'done', 'pending', 'in_progress');

-- 4. Re-add the CHECK with only the three new values.
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_programming_status_check
  CHECK (programming_status IN ('not_ready', 'ready', 'not_required'));

-- 5. Set the new default.
ALTER TABLE public.jobs
  ALTER COLUMN programming_status SET DEFAULT 'not_ready';

-- 6. Update the column comment so anyone inspecting via psql sees the new
--    contract.
COMMENT ON COLUMN public.jobs.programming_status IS
  'Programming readiness: not_ready (default), ready (program on hand & validated), not_required (no programming step). Auto-set to ready on job creation when a prior job exists for the same bom_id.';
