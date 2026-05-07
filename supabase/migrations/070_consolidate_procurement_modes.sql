-- 070_consolidate_procurement_modes.sql
--
-- Collapse procurement_mode to three canonical values:
--   turnkey | consignment | assembly_only
-- Legacy consign_parts_supplied / consign_pcb_supplied both map to
-- consignment. Also introduces jobs.programming_status for per-job
-- programming lifecycle tracking.

-- Backfill legacy values.
UPDATE public.procurements
   SET procurement_mode = 'consignment'
 WHERE procurement_mode IN ('consign_parts_supplied', 'consign_pcb_supplied');

-- Rebuild the CHECK constraint with the new allowed set.
ALTER TABLE public.procurements
  DROP CONSTRAINT IF EXISTS procurements_procurement_mode_check;

ALTER TABLE public.procurements
  ADD CONSTRAINT procurements_procurement_mode_check
  CHECK (procurement_mode IN ('turnkey','consignment','assembly_only'));

-- Add programming_status on jobs with a small enum.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS programming_status TEXT NOT NULL DEFAULT 'not_needed'
    CHECK (programming_status IN ('not_needed','pending','in_progress','done'));

COMMENT ON COLUMN public.jobs.programming_status IS
  'Programming lifecycle per job: not_needed, pending, in_progress, done. Operator-updated on the job detail page.';
