-- ============================================================================
-- 094_production_shipping_access.sql
--
-- The production user (Piyush at the floor) also handles shipping in this
-- shop. Currently RLS only lets production SELECT shipments — they can
-- read but can't create or update. Replace the read-only policy with a
-- full FOR ALL so they can mark jobs shipped, add tracking numbers, etc.
--
-- Admin policy (shipments_admin_all) is unchanged.
-- ============================================================================

DROP POLICY IF EXISTS shipments_production_select ON public.shipments;

CREATE POLICY shipments_production_all ON public.shipments
  FOR ALL
  TO authenticated
  USING (is_production())
  WITH CHECK (is_production());
