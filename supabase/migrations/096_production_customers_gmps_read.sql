-- ============================================================================
-- 096_production_customers_gmps_read.sql
--
-- Production user (Piyush at the floor) is now responsible for shipping
-- in addition to assembly. Both flows need to render the customer name +
-- board name on shipment / job rows. Today both `customers` and `gmps`
-- have only an admin-scoped policy, so a user-scoped SELECT through any
-- join (e.g. `shipments(*, jobs(customers(...)))`) returns the parent
-- row but RLS filters out the nested customer / gmp — the shipping page
-- shows an empty Customer column for production users.
--
-- Add a production-scoped SELECT policy on each table. Read-only is
-- enough — production users don't author customers or GMPs, only
-- reference them. Admin policies are unchanged.
-- ============================================================================

CREATE POLICY customers_production_select ON public.customers
  FOR SELECT
  TO authenticated
  USING (is_production());

CREATE POLICY gmps_production_select ON public.gmps
  FOR SELECT
  TO authenticated
  USING (is_production());
