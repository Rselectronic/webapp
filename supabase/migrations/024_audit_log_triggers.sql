-- ============================================
-- 024: Automatic audit logging via triggers
-- Logs INSERT/UPDATE/DELETE on key tables to audit_log
-- ============================================

-- Trigger function: captures old/new values, user, table, action
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  _user_id UUID;
  _record_id UUID;
  _old JSONB := NULL;
  _new JSONB := NULL;
BEGIN
  -- Get current authenticated user (Supabase auth)
  _user_id := auth.uid();

  -- Determine record ID and values based on operation
  IF TG_OP = 'DELETE' THEN
    _record_id := OLD.id;
    _old := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    _record_id := NEW.id;
    _new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _record_id := NEW.id;
    -- Only store changed fields to keep audit_log lean
    SELECT jsonb_object_agg(key, value) INTO _old
      FROM jsonb_each(to_jsonb(OLD))
      WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key;
    SELECT jsonb_object_agg(key, value) INTO _new
      FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key;
    -- Skip if nothing actually changed
    IF _new IS NULL OR _new = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.audit_log (user_id, table_name, record_id, action, old_values, new_values)
  VALUES (_user_id, TG_TABLE_NAME, _record_id, lower(TG_OP), _old, _new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Apply triggers to key business tables
-- ============================================

-- Components (M-code changes, learning loop)
CREATE TRIGGER audit_components
  AFTER INSERT OR UPDATE OR DELETE ON public.components
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- BOM lines (M-code assignments, manual overrides)
CREATE TRIGGER audit_bom_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Jobs (status changes, scheduling)
CREATE TRIGGER audit_jobs
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Quotes (status, pricing changes)
CREATE TRIGGER audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Customers (contact info, BOM config changes)
CREATE TRIGGER audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Procurements (status, ordering)
CREATE TRIGGER audit_procurements
  AFTER INSERT OR UPDATE OR DELETE ON public.procurements
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Procurement lines (order/receive)
CREATE TRIGGER audit_procurement_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Invoices (status, payment)
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- NCR reports (quality tracking)
CREATE TRIGGER audit_ncr_reports
  AFTER INSERT OR UPDATE OR DELETE ON public.ncr_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Supplier POs (sent, received)
CREATE TRIGGER audit_supplier_pos
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_pos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- GMPs (board definitions)
CREATE TRIGGER audit_gmps
  AFTER INSERT OR UPDATE OR DELETE ON public.gmps
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Pricing settings (rate changes)
CREATE TRIGGER audit_app_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
