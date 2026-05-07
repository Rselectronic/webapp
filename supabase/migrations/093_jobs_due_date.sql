-- ============================================================================
-- 093_jobs_due_date.sql
--
-- Split the job's customer-facing delivery deadline from the production
-- team's internal target.
--
--   due_date              — what the customer was promised. Auto-computed
--                           from the matching quote tier's lead_time on
--                           job creation. Admin can override for rush
--                           orders. Should not move during production.
--
--   scheduled_completion  — when production plans to finish. Operational
--                           target, freely re-scheduled by the production
--                           team via the kanban / monthly gantt.
--
-- The two are independent: scheduled_completion > due_date is a "late
-- delivery risk" signal that the UI surfaces.
--
-- Existing jobs are left with due_date = NULL — there's no reliable way
-- to back-derive the lead time after the fact, so an admin should fill
-- those in manually if/when needed. The UI shows "Not set" for NULL
-- due_dates with a one-click "Set" affordance.
-- ============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN public.jobs.due_date IS
  'Customer-promised delivery deadline. Auto-computed from the matching quote tier''s lead_time on job creation; admin can override for rush orders. scheduled_completion is the production team''s internal target — the two are independent.';

-- Index for "what is due in the next N days" queries (overdue board).
CREATE INDEX IF NOT EXISTS idx_jobs_due_date ON public.jobs(due_date)
  WHERE due_date IS NOT NULL;
