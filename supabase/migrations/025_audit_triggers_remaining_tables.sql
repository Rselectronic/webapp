-- ============================================
-- 025: Audit triggers for ALL remaining tables
-- Extends 024 to cover every business table
-- Skipped: audit_log (infinite loop), *_log tables (already logs),
--          api_pricing_cache/chat_messages/chat_attachments (high volume)
-- ============================================

CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_boms
  AFTER INSERT OR UPDATE OR DELETE ON public.boms
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_m_code_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.m_code_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_mcode_keyword_lookup
  AFTER INSERT OR UPDATE OR DELETE ON public.mcode_keyword_lookup
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_overage_table
  AFTER INSERT OR UPDATE OR DELETE ON public.overage_table
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_production_events
  AFTER INSERT OR UPDATE OR DELETE ON public.production_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_serial_numbers
  AFTER INSERT OR UPDATE OR DELETE ON public.serial_numbers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_bg_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.bg_stock
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_quote_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_quote_batch_boms
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_batch_boms
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_quote_batch_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_batch_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_procurement_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_procurement_batch_items
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_procurement_batch_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_batch_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_email_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_fabrication_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.fabrication_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_shipments
  AFTER INSERT OR UPDATE OR DELETE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_chat_conversations
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
