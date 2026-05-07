-- ============================================================================
-- 095_jobs_production_rls_widen.sql
--
-- The previous `jobs_production` RLS policy only let production-role
-- users read jobs in status 'production' or 'inspection'. That worked
-- when production was scoped to active SMT/AOI work, but the role has
-- since absorbed:
--   - the kanban (which shows parts_received → shipping; even read-only
--     upstream columns for created → parts_ordered)
--   - shipment creation (which needs to query ?status=shipping)
--   - job detail pages (any status the kanban exposes)
--
-- The production page itself uses the admin client to bypass RLS, but
-- the user-scoped /api/jobs endpoint that the shipment dialog hits
-- still goes through this policy — so a production user clicking
-- "New Shipment" sees an empty job dropdown despite jobs being there.
--
-- Widen the policy to every non-financial status. 'invoiced' and
-- 'archived' stay admin-only since those are post-shipping commercial
-- workflows.
-- ============================================================================

DROP POLICY IF EXISTS jobs_production ON public.jobs;

CREATE POLICY jobs_production ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    is_production()
    AND status = ANY (
      ARRAY[
        'created',
        'procurement',
        'parts_ordered',
        'parts_received',
        'production',
        'inspection',
        'shipping',
        'delivered'
      ]
    )
  );
