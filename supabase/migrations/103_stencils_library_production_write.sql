-- ============================================================================
-- 103: Allow production users to add and discard stencils.
-- ============================================================================
-- Background:
--   Migration 088 left the stencils_library / stencils_library_gmps WRITE
--   policies admin-only. The shop reality is that production users are the
--   ones putting stencils on the shelves and tossing the worn-out ones, so
--   they need INSERT (add) and UPDATE (discard / soft-delete) on the parent
--   table, plus INSERT on the GMP join table to attach GMPs at create time.
--
--   PATCH (rename / shuffle position) stays admin-only — that's a curation
--   action, not a shop-floor one. Restore (un-discard) also stays
--   admin-only so a wrongly-tossed stencil isn't silently brought back.
-- ============================================================================

BEGIN;

-- stencils_library — production gets INSERT + UPDATE only (no DELETE; the
-- DELETE API path is a soft-delete via UPDATE setting discarded_at).
CREATE POLICY stencils_lib_production_insert ON public.stencils_library
  FOR INSERT WITH CHECK (is_production());

CREATE POLICY stencils_lib_production_update ON public.stencils_library
  FOR UPDATE USING (is_production()) WITH CHECK (is_production());

-- stencils_library_gmps — production gets INSERT only. GMP rows are added
-- alongside the stencil at create time. PATCH (which deletes + reinserts
-- the join rows) is admin-only, so production doesn't need DELETE here.
CREATE POLICY stencils_lib_gmps_production_insert ON public.stencils_library_gmps
  FOR INSERT WITH CHECK (is_production());

COMMIT;
