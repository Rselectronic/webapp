-- RS PCB Assembly ERP — Row Level Security Policies
-- Migration 002: RLS policies for all 18 tables

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ENABLE RLS ON ALL 18 TABLES
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_pricing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_code_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overage_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. USERS POLICIES
-- ============================================================

-- CEO: full access to users
CREATE POLICY users_ceo_all ON public.users
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read all users
CREATE POLICY users_ops_select ON public.users
  FOR SELECT
  USING (public.get_user_role() = 'operations_manager');

-- Shop Floor: read own profile only
CREATE POLICY users_shop_floor_select_own ON public.users
  FOR SELECT
  USING (public.get_user_role() = 'shop_floor' AND id = auth.uid());

-- ============================================================
-- 2. CUSTOMERS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY customers_ceo_all ON public.customers
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY customers_ops_all ON public.customers
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 3. GMPS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY gmps_ceo_all ON public.gmps
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY gmps_ops_all ON public.gmps
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 4. BOMS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY boms_ceo_all ON public.boms
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY boms_ops_all ON public.boms
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 5. BOM_LINES POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY bom_lines_ceo_all ON public.bom_lines
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY bom_lines_ops_all ON public.bom_lines
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 6. COMPONENTS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY components_ceo_all ON public.components
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY components_ops_all ON public.components
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 7. API_PRICING_CACHE POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY api_pricing_cache_ceo_all ON public.api_pricing_cache
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY api_pricing_cache_ops_all ON public.api_pricing_cache
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 8. M_CODE_RULES POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY m_code_rules_ceo_all ON public.m_code_rules
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY m_code_rules_ops_all ON public.m_code_rules
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 9. OVERAGE_TABLE POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY overage_table_ceo_all ON public.overage_table
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY overage_table_ops_all ON public.overage_table
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 10. QUOTES POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY quotes_ceo_all ON public.quotes
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY quotes_ops_all ON public.quotes
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 11. JOBS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY jobs_ceo_all ON public.jobs
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY jobs_ops_all ON public.jobs
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- Shop Floor: read jobs in production or inspection status only
CREATE POLICY jobs_shop_floor_select ON public.jobs
  FOR SELECT
  USING (public.get_user_role() = 'shop_floor' AND status IN ('production', 'inspection'));

-- ============================================================
-- 12. JOB_STATUS_LOG POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY job_status_log_ceo_all ON public.job_status_log
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY job_status_log_ops_all ON public.job_status_log
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 13. PROCUREMENTS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY procurements_ceo_all ON public.procurements
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY procurements_ops_all ON public.procurements
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 14. PROCUREMENT_LINES POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY procurement_lines_ceo_all ON public.procurement_lines
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY procurement_lines_ops_all ON public.procurement_lines
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 15. SUPPLIER_POS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY supplier_pos_ceo_all ON public.supplier_pos
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY supplier_pos_ops_all ON public.supplier_pos
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================================
-- 16. PRODUCTION_EVENTS POLICIES
-- ============================================================

-- CEO: full access
CREATE POLICY production_events_ceo_all ON public.production_events
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + write
CREATE POLICY production_events_ops_all ON public.production_events
  FOR ALL
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- Shop Floor: read all production events
CREATE POLICY production_events_shop_floor_select ON public.production_events
  FOR SELECT
  USING (public.get_user_role() = 'shop_floor');

-- Shop Floor: insert production events where operator_id = own id
CREATE POLICY production_events_shop_floor_insert ON public.production_events
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'shop_floor' AND operator_id = auth.uid());

-- ============================================================
-- 17. INVOICES POLICIES
-- ============================================================

-- CEO: full access (only CEO can access invoices)
CREATE POLICY invoices_ceo_all ON public.invoices
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- ============================================================
-- 18. AUDIT_LOG POLICIES
-- ============================================================

-- CEO: read audit log
CREATE POLICY audit_log_ceo_select ON public.audit_log
  FOR SELECT
  USING (public.get_user_role() = 'ceo');

-- All roles: insert into audit log
CREATE POLICY audit_log_all_insert ON public.audit_log
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
