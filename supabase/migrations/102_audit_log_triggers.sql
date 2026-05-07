-- ============================================
-- 102: Extend audit_log triggers + tighten RLS
--
-- Background: migrations 024 and 025 already created an
-- audit_trigger_func() and attached `audit_<table>` triggers to
-- most business-critical tables. This migration:
--
--   1. Adds triggers to the remaining tables that were created in
--      later migrations (pcb_orders, stencil_orders, suppliers,
--      shipment_lines, invoice_lines, inventory_*).
--   2. Drops the unused audit_log INSERT policy. The trigger function
--      is SECURITY DEFINER and bypasses RLS, so app callers should
--      have no direct INSERT access to audit_log.
-- ============================================

-- ---------- Triggers on remaining business tables ----------
-- Idempotent: DROP IF EXISTS first so re-running is safe.

DROP TRIGGER IF EXISTS audit_pcb_orders ON public.pcb_orders;
CREATE TRIGGER audit_pcb_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.pcb_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_stencil_orders ON public.stencil_orders;
CREATE TRIGGER audit_stencil_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.stencil_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_suppliers ON public.suppliers;
CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_shipment_lines ON public.shipment_lines;
CREATE TRIGGER audit_shipment_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.shipment_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_invoice_lines ON public.invoice_lines;
CREATE TRIGGER audit_invoice_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_inventory_parts ON public.inventory_parts;
CREATE TRIGGER audit_inventory_parts
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_parts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_inventory_movements ON public.inventory_movements;
CREATE TRIGGER audit_inventory_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_inventory_allocations ON public.inventory_allocations;
CREATE TRIGGER audit_inventory_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_allocations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ---------- RLS hardening on audit_log ----------
-- The existing audit_log_admin SELECT policy stays (admin-only read).
-- Drop the legacy INSERT policy: the trigger function runs as
-- SECURITY DEFINER, so it bypasses RLS and does not need a permissive
-- policy. Removing this prevents an authenticated user from forging
-- audit rows via the REST API.
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;

-- Make sure RLS is enabled (it already is, but be explicit).
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
