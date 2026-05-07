-- ============================================================================
-- 088: Drop legacy roles — migrate to canonical {admin, production} only.
-- ============================================================================
-- Background:
--   Migration 085 introduced the canonical pair (`admin`, `production`) and
--   helper functions is_admin() / is_production() that ALSO accepted the legacy
--   strings (`ceo`, `operations_manager`, `shop_floor`) for backward compat.
--   ~110 RLS policies still hard-code the legacy strings.
--
--   This migration finishes the job:
--     1. Migrate user data (and api_keys.role) to the new pair.
--     2. Rewrite every RLS policy that references a legacy role to use the
--        helper functions.
--     3. Tighten the helper functions to ONLY recognise the new pair.
--     4. Tighten the CHECK constraints on users.role and api_keys.role.
--
-- Mapping:
--   ceo, operations_manager  → admin
--   shop_floor               → production
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1 — Migrate user + api_keys data.
--
-- Drop existing CHECK constraints FIRST. The api_keys constraint never had
-- 'admin' / 'production' in its allow-list (only the users constraint was
-- expanded in migration 085), so updating api_keys.role to 'admin' would
-- fail before we widen it. Drop, update, then re-add tighter constraints in
-- step 4 below.
-- ----------------------------------------------------------------------------

ALTER TABLE public.users    DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_role_check;

UPDATE public.users SET role = 'admin'      WHERE role IN ('ceo', 'operations_manager');
UPDATE public.users SET role = 'production' WHERE role = 'shop_floor';

UPDATE public.api_keys SET role = 'admin'      WHERE role IN ('ceo', 'operations_manager');
UPDATE public.api_keys SET role = 'production' WHERE role = 'shop_floor';

ALTER TABLE public.api_keys ALTER COLUMN role SET DEFAULT 'admin';

-- ----------------------------------------------------------------------------
-- STEP 2 — Rewrite RLS policies.
--
-- Strategy: drop every policy whose qual/with-check references a legacy role
-- string and recreate it with the helper functions. Where two near-identical
-- policies existed (one for ceo, one for operations_manager), they collapse
-- into a single policy.
--
-- We `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` so this migration is
-- idempotent enough to be re-run if anything goes wrong mid-flight.
-- ----------------------------------------------------------------------------

-- ai_call_log
DROP POLICY IF EXISTS ai_call_log_read ON public.ai_call_log;
CREATE POLICY ai_call_log_read ON public.ai_call_log
  FOR SELECT USING (is_admin());

-- api_keys (was 3 separate policies — collapse into one)
DROP POLICY IF EXISTS api_keys_ceo_insert ON public.api_keys;
DROP POLICY IF EXISTS api_keys_ceo_select ON public.api_keys;
DROP POLICY IF EXISTS api_keys_ceo_update ON public.api_keys;
CREATE POLICY api_keys_admin_all ON public.api_keys
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- api_pricing_cache
DROP POLICY IF EXISTS api_cache_ceo ON public.api_pricing_cache;
DROP POLICY IF EXISTS api_cache_ops ON public.api_pricing_cache;
CREATE POLICY api_cache_admin ON public.api_pricing_cache
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- app_settings
DROP POLICY IF EXISTS settings_ceo ON public.app_settings;
DROP POLICY IF EXISTS settings_ops_read ON public.app_settings;
CREATE POLICY settings_admin ON public.app_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- audit_log (read-only for admins)
DROP POLICY IF EXISTS audit_log_ceo ON public.audit_log;
CREATE POLICY audit_log_admin ON public.audit_log
  FOR SELECT USING (is_admin());

-- bom_line_alternates
DROP POLICY IF EXISTS bom_line_alternates_ceo_ops_all ON public.bom_line_alternates;
CREATE POLICY bom_line_alternates_admin_all ON public.bom_line_alternates
  FOR ALL USING (is_admin());

-- bom_line_pricing
DROP POLICY IF EXISTS bom_line_pricing_rw ON public.bom_line_pricing;
CREATE POLICY bom_line_pricing_rw ON public.bom_line_pricing
  FOR ALL USING (is_admin());

-- bom_lines
DROP POLICY IF EXISTS bom_lines_ceo ON public.bom_lines;
DROP POLICY IF EXISTS bom_lines_ops ON public.bom_lines;
CREATE POLICY bom_lines_admin ON public.bom_lines
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- boms
DROP POLICY IF EXISTS boms_ceo ON public.boms;
DROP POLICY IF EXISTS boms_ops ON public.boms;
CREATE POLICY boms_admin ON public.boms
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- components
DROP POLICY IF EXISTS components_ceo ON public.components;
DROP POLICY IF EXISTS components_ops ON public.components;
CREATE POLICY components_admin ON public.components
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- custom_suppliers
DROP POLICY IF EXISTS custom_suppliers_delete ON public.custom_suppliers;
DROP POLICY IF EXISTS custom_suppliers_insert ON public.custom_suppliers;
DROP POLICY IF EXISTS custom_suppliers_select ON public.custom_suppliers;
CREATE POLICY custom_suppliers_admin_all ON public.custom_suppliers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- customer_parts (the legacy "read" policy let shop_floor read too —
-- preserve that by adding production)
DROP POLICY IF EXISTS customer_parts_read ON public.customer_parts;
DROP POLICY IF EXISTS customer_parts_write ON public.customer_parts;
CREATE POLICY customer_parts_read ON public.customer_parts
  FOR SELECT USING (is_admin() OR is_production());
CREATE POLICY customer_parts_write ON public.customer_parts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- customers
DROP POLICY IF EXISTS customers_ceo ON public.customers;
DROP POLICY IF EXISTS customers_ops ON public.customers;
CREATE POLICY customers_admin ON public.customers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- email_templates
DROP POLICY IF EXISTS email_templates_ceo_all ON public.email_templates;
DROP POLICY IF EXISTS email_templates_ops_insert ON public.email_templates;
DROP POLICY IF EXISTS email_templates_ops_select ON public.email_templates;
DROP POLICY IF EXISTS email_templates_ops_update ON public.email_templates;
CREATE POLICY email_templates_admin_all ON public.email_templates
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- fabrication_orders (the legacy shop_floor policy was a read-only window —
-- preserve as production read)
DROP POLICY IF EXISTS fabrication_orders_ceo_all ON public.fabrication_orders;
DROP POLICY IF EXISTS fabrication_orders_ops_delete ON public.fabrication_orders;
DROP POLICY IF EXISTS fabrication_orders_ops_insert ON public.fabrication_orders;
DROP POLICY IF EXISTS fabrication_orders_ops_select ON public.fabrication_orders;
DROP POLICY IF EXISTS fabrication_orders_ops_update ON public.fabrication_orders;
DROP POLICY IF EXISTS fabrication_orders_shop_floor_select ON public.fabrication_orders;
CREATE POLICY fabrication_orders_admin_all ON public.fabrication_orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY fabrication_orders_production_select ON public.fabrication_orders
  FOR SELECT USING (is_production());

-- fx_rates
DROP POLICY IF EXISTS fx_rates_write ON public.fx_rates;
CREATE POLICY fx_rates_write ON public.fx_rates
  FOR ALL USING (is_admin());

-- gmps
DROP POLICY IF EXISTS gmps_ceo ON public.gmps;
DROP POLICY IF EXISTS gmps_ops ON public.gmps;
CREATE POLICY gmps_admin ON public.gmps
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- inventory_allocations
DROP POLICY IF EXISTS inventory_allocations_ceo ON public.inventory_allocations;
DROP POLICY IF EXISTS inventory_allocations_ops ON public.inventory_allocations;
CREATE POLICY inventory_allocations_admin ON public.inventory_allocations
  FOR ALL USING (is_admin());

-- inventory_movements
DROP POLICY IF EXISTS inventory_movements_ceo ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_ops ON public.inventory_movements;
CREATE POLICY inventory_movements_admin ON public.inventory_movements
  FOR ALL USING (is_admin());

-- inventory_parts
DROP POLICY IF EXISTS inventory_parts_ceo ON public.inventory_parts;
DROP POLICY IF EXISTS inventory_parts_ops ON public.inventory_parts;
CREATE POLICY inventory_parts_admin ON public.inventory_parts
  FOR ALL USING (is_admin());

-- inventory_serial_history
DROP POLICY IF EXISTS inventory_serial_history_ceo ON public.inventory_serial_history;
DROP POLICY IF EXISTS inventory_serial_history_ops ON public.inventory_serial_history;
CREATE POLICY inventory_serial_history_admin ON public.inventory_serial_history
  FOR ALL USING (is_admin());

-- invoices (CEO-only → admin-only)
DROP POLICY IF EXISTS invoices_ceo ON public.invoices;
CREATE POLICY invoices_admin ON public.invoices
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- job_status_log
DROP POLICY IF EXISTS job_status_log_ceo ON public.job_status_log;
DROP POLICY IF EXISTS job_status_log_ops ON public.job_status_log;
CREATE POLICY job_status_log_admin ON public.job_status_log
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- jobs (preserve the shop window: production users see jobs in
-- production/inspection only)
DROP POLICY IF EXISTS jobs_ceo ON public.jobs;
DROP POLICY IF EXISTS jobs_ops ON public.jobs;
DROP POLICY IF EXISTS jobs_shop ON public.jobs;
CREATE POLICY jobs_admin ON public.jobs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY jobs_production ON public.jobs
  FOR SELECT USING (
    is_production()
    AND status = ANY (ARRAY['production'::text, 'inspection'::text])
  );

-- labour_settings
DROP POLICY IF EXISTS labour_settings_ceo_all ON public.labour_settings;
DROP POLICY IF EXISTS labour_settings_ops_read ON public.labour_settings;
CREATE POLICY labour_settings_admin_all ON public.labour_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- m_code_rules
DROP POLICY IF EXISTS m_code_rules_ceo ON public.m_code_rules;
DROP POLICY IF EXISTS m_code_rules_ops ON public.m_code_rules;
CREATE POLICY m_code_rules_admin ON public.m_code_rules
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- mcode_keyword_lookup
DROP POLICY IF EXISTS ceo_all_mcode_keywords ON public.mcode_keyword_lookup;
DROP POLICY IF EXISTS ops_mcode_keywords ON public.mcode_keyword_lookup;
CREATE POLICY mcode_keywords_admin ON public.mcode_keyword_lookup
  FOR ALL USING (is_admin());

-- ncr_reports
DROP POLICY IF EXISTS ncr_ceo_all ON public.ncr_reports;
DROP POLICY IF EXISTS ncr_ops_insert ON public.ncr_reports;
DROP POLICY IF EXISTS ncr_ops_select ON public.ncr_reports;
DROP POLICY IF EXISTS ncr_ops_update ON public.ncr_reports;
CREATE POLICY ncr_admin_all ON public.ncr_reports
  FOR ALL USING (is_admin());

-- overage_table
DROP POLICY IF EXISTS overage_ceo ON public.overage_table;
DROP POLICY IF EXISTS overage_ops ON public.overage_table;
CREATE POLICY overage_admin ON public.overage_table
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- payments (CEO-only → admin-only)
DROP POLICY IF EXISTS payments_ceo_all ON public.payments;
CREATE POLICY payments_admin_all ON public.payments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- pcb_orders
DROP POLICY IF EXISTS pcb_orders_ceo_ops ON public.pcb_orders;
CREATE POLICY pcb_orders_admin ON public.pcb_orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- pricing_preferences
DROP POLICY IF EXISTS pricing_preferences_write ON public.pricing_preferences;
CREATE POLICY pricing_preferences_write ON public.pricing_preferences
  FOR ALL USING (is_admin());

-- procurement_batch_items
DROP POLICY IF EXISTS ceo_all_proc_batch_items ON public.procurement_batch_items;
DROP POLICY IF EXISTS ops_proc_batch_items ON public.procurement_batch_items;
CREATE POLICY proc_batch_items_admin ON public.procurement_batch_items
  FOR ALL USING (is_admin());

-- procurement_batch_lines
DROP POLICY IF EXISTS ceo_all_proc_batch_lines ON public.procurement_batch_lines;
DROP POLICY IF EXISTS ops_proc_batch_lines ON public.procurement_batch_lines;
CREATE POLICY proc_batch_lines_admin ON public.procurement_batch_lines
  FOR ALL USING (is_admin());

-- procurement_batch_log
DROP POLICY IF EXISTS ceo_all_proc_batch_log ON public.procurement_batch_log;
DROP POLICY IF EXISTS ops_proc_batch_log ON public.procurement_batch_log;
CREATE POLICY proc_batch_log_admin ON public.procurement_batch_log
  FOR ALL USING (is_admin());

-- procurement_batches
DROP POLICY IF EXISTS ceo_all_proc_batches ON public.procurement_batches;
DROP POLICY IF EXISTS ops_proc_batches ON public.procurement_batches;
CREATE POLICY proc_batches_admin ON public.procurement_batches
  FOR ALL USING (is_admin());

-- procurement_line_selections
DROP POLICY IF EXISTS pls_ceo_ops ON public.procurement_line_selections;
CREATE POLICY pls_admin ON public.procurement_line_selections
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- procurement_lines
DROP POLICY IF EXISTS procurement_lines_ceo ON public.procurement_lines;
DROP POLICY IF EXISTS procurement_lines_ops ON public.procurement_lines;
CREATE POLICY procurement_lines_admin ON public.procurement_lines
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- procurements
DROP POLICY IF EXISTS procurements_ceo ON public.procurements;
DROP POLICY IF EXISTS procurements_ops ON public.procurements;
CREATE POLICY procurements_admin ON public.procurements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- production_events (preserve the production-user insert window with
-- operator_id check; drop legacy ceo/ops/shop policies)
DROP POLICY IF EXISTS prod_events_shop_insert ON public.production_events;
DROP POLICY IF EXISTS prod_events_shop_read ON public.production_events;
DROP POLICY IF EXISTS production_events_ceo ON public.production_events;
DROP POLICY IF EXISTS production_events_ops ON public.production_events;
CREATE POLICY production_events_admin ON public.production_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY production_events_production_read ON public.production_events
  FOR SELECT USING (is_production());
CREATE POLICY production_events_production_insert ON public.production_events
  FOR INSERT WITH CHECK (is_production() AND operator_id = auth.uid());

-- quote_batch_boms
DROP POLICY IF EXISTS ceo_all_quote_batch_boms ON public.quote_batch_boms;
DROP POLICY IF EXISTS ops_quote_batch_boms ON public.quote_batch_boms;
CREATE POLICY quote_batch_boms_admin ON public.quote_batch_boms
  FOR ALL USING (is_admin());

-- quote_batch_lines
DROP POLICY IF EXISTS ceo_all_quote_batch_lines ON public.quote_batch_lines;
DROP POLICY IF EXISTS ops_quote_batch_lines ON public.quote_batch_lines;
CREATE POLICY quote_batch_lines_admin ON public.quote_batch_lines
  FOR ALL USING (is_admin());

-- quote_batch_log
DROP POLICY IF EXISTS ceo_all_quote_batch_log ON public.quote_batch_log;
DROP POLICY IF EXISTS ops_quote_batch_log ON public.quote_batch_log;
CREATE POLICY quote_batch_log_admin ON public.quote_batch_log
  FOR ALL USING (is_admin());

-- quote_batches
DROP POLICY IF EXISTS ceo_all_quote_batches ON public.quote_batches;
DROP POLICY IF EXISTS ops_quote_batches ON public.quote_batches;
CREATE POLICY quote_batches_admin ON public.quote_batches
  FOR ALL USING (is_admin());

-- quote_customer_supplied
DROP POLICY IF EXISTS quote_customer_supplied_rw ON public.quote_customer_supplied;
CREATE POLICY quote_customer_supplied_rw ON public.quote_customer_supplied
  FOR ALL USING (is_admin());

-- quotes
DROP POLICY IF EXISTS quotes_ceo ON public.quotes;
DROP POLICY IF EXISTS quotes_ops ON public.quotes;
CREATE POLICY quotes_admin ON public.quotes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- serial_numbers (preserve shop-floor read window: production sees rows for
-- jobs in production/inspection)
DROP POLICY IF EXISTS serial_ceo_all ON public.serial_numbers;
DROP POLICY IF EXISTS serial_ops_insert ON public.serial_numbers;
DROP POLICY IF EXISTS serial_ops_read ON public.serial_numbers;
DROP POLICY IF EXISTS serial_ops_update ON public.serial_numbers;
DROP POLICY IF EXISTS serial_shop_floor_read ON public.serial_numbers;
CREATE POLICY serial_admin_all ON public.serial_numbers
  FOR ALL USING (is_admin());
CREATE POLICY serial_production_read ON public.serial_numbers
  FOR SELECT USING (
    is_production()
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = serial_numbers.job_id
        AND j.status = ANY (ARRAY['production'::text, 'inspection'::text])
    )
  );

-- shipments (preserve shop-floor read window)
DROP POLICY IF EXISTS shipments_ceo_all ON public.shipments;
DROP POLICY IF EXISTS shipments_ops_delete ON public.shipments;
DROP POLICY IF EXISTS shipments_ops_insert ON public.shipments;
DROP POLICY IF EXISTS shipments_ops_select ON public.shipments;
DROP POLICY IF EXISTS shipments_ops_update ON public.shipments;
DROP POLICY IF EXISTS shipments_shop_floor_select ON public.shipments;
CREATE POLICY shipments_admin_all ON public.shipments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY shipments_production_select ON public.shipments
  FOR SELECT USING (is_production());

-- stencil_orders
DROP POLICY IF EXISTS stencil_orders_ceo_ops ON public.stencil_orders;
CREATE POLICY stencil_orders_admin ON public.stencil_orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- stencils_library (legacy read allowed shop_floor → keep as production)
DROP POLICY IF EXISTS stencils_lib_read ON public.stencils_library;
DROP POLICY IF EXISTS stencils_lib_write ON public.stencils_library;
CREATE POLICY stencils_lib_read ON public.stencils_library
  FOR SELECT USING (is_admin() OR is_production());
CREATE POLICY stencils_lib_write ON public.stencils_library
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- stencils_library_gmps (legacy read allowed shop_floor)
DROP POLICY IF EXISTS stencils_lib_gmps_read ON public.stencils_library_gmps;
DROP POLICY IF EXISTS stencils_lib_gmps_write ON public.stencils_library_gmps;
CREATE POLICY stencils_lib_gmps_read ON public.stencils_library_gmps
  FOR SELECT USING (is_admin() OR is_production());
CREATE POLICY stencils_lib_gmps_write ON public.stencils_library_gmps
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- supplier_contacts
DROP POLICY IF EXISTS supplier_contacts_read ON public.supplier_contacts;
DROP POLICY IF EXISTS supplier_contacts_write ON public.supplier_contacts;
CREATE POLICY supplier_contacts_read ON public.supplier_contacts
  FOR SELECT USING (is_admin());
CREATE POLICY supplier_contacts_write ON public.supplier_contacts
  FOR ALL USING (is_admin());

-- supplier_credentials (CEO-only → admin-only; collapse 4 policies into 1)
DROP POLICY IF EXISTS supplier_credentials_ceo_delete ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_ceo_insert ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_ceo_select ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_ceo_update ON public.supplier_credentials;
CREATE POLICY supplier_credentials_admin_all ON public.supplier_credentials
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- supplier_pos
DROP POLICY IF EXISTS supplier_pos_ceo ON public.supplier_pos;
DROP POLICY IF EXISTS supplier_pos_ops ON public.supplier_pos;
CREATE POLICY supplier_pos_admin ON public.supplier_pos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- supplier_quote_lines
DROP POLICY IF EXISTS supplier_quote_lines_rw ON public.supplier_quote_lines;
CREATE POLICY supplier_quote_lines_rw ON public.supplier_quote_lines
  FOR ALL USING (is_admin());

-- supplier_quotes
DROP POLICY IF EXISTS supplier_quotes_rw ON public.supplier_quotes;
CREATE POLICY supplier_quotes_rw ON public.supplier_quotes
  FOR ALL USING (is_admin());

-- suppliers
DROP POLICY IF EXISTS suppliers_read ON public.suppliers;
DROP POLICY IF EXISTS suppliers_write ON public.suppliers;
CREATE POLICY suppliers_read ON public.suppliers
  FOR SELECT USING (is_admin());
CREATE POLICY suppliers_write ON public.suppliers
  FOR ALL USING (is_admin());

-- users (drop legacy 3 policies; users_self_read from migration 087 stays)
DROP POLICY IF EXISTS users_ceo ON public.users;
DROP POLICY IF EXISTS users_ops ON public.users;
DROP POLICY IF EXISTS users_shop ON public.users;
CREATE POLICY users_admin_full ON public.users
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ----------------------------------------------------------------------------
-- STEP 3 — Tighten helper functions to ONLY accept the new pair.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_active = TRUE
      AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_production() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_active = TRUE
      AND u.role = 'production'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_production() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_production() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- STEP 4 — Re-add tighter CHECK constraints on users.role and api_keys.role.
-- ----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'production'));

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_role_check
  CHECK (role IN ('admin', 'production'));

COMMIT;
