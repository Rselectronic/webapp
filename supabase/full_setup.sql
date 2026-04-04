-- =============================================
-- RS PCB Assembly ERP — Full Database Setup
-- Run this in Supabase SQL Editor for project dypkautohnduuttaujzp
-- =============================================

-- ==================== AUTH USER ====================
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token)
VALUES (
  gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
  'apatel@rspcbassembly.com', crypt('123456', gen_salt('bf')), now(),
  'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Anas Patel"}'::jsonb,
  now(), now(), ''
);

-- Add identity row (required for email login)
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT id, id, 'apatel@rspcbassembly.com', 'email',
  jsonb_build_object('sub', id::text, 'email', 'apatel@rspcbassembly.com'),
  now(), now(), now()
FROM auth.users WHERE email = 'apatel@rspcbassembly.com';

-- ==================== 18 TABLES ====================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'operations_manager', 'shop_floor')),
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE NOT NULL, company_name TEXT NOT NULL,
  contact_name TEXT, contact_email TEXT, contact_phone TEXT,
  billing_address JSONB DEFAULT '{}', shipping_address JSONB DEFAULT '{}',
  payment_terms TEXT DEFAULT 'Net 30', bom_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.gmps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_number TEXT NOT NULL, board_name TEXT, revision TEXT DEFAULT '1',
  is_active BOOLEAN DEFAULT TRUE, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, gmp_number)
);

CREATE TABLE IF NOT EXISTS public.boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT,
  revision TEXT DEFAULT '1',
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'error')),
  parse_result JSONB, component_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(), created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
  line_number INT NOT NULL, quantity INT NOT NULL DEFAULT 1,
  reference_designator TEXT, cpc TEXT, description TEXT, mpn TEXT, manufacturer TEXT,
  is_pcb BOOLEAN DEFAULT FALSE, is_dni BOOLEAN DEFAULT FALSE,
  m_code TEXT, m_code_confidence DECIMAL(3,2),
  m_code_source TEXT CHECK (m_code_source IN ('database', 'rules', 'api', 'manual', NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(bom_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpn TEXT NOT NULL, manufacturer TEXT, description TEXT, category TEXT,
  package_case TEXT, mounting_type TEXT, m_code TEXT, m_code_source TEXT DEFAULT 'manual',
  length_mm DECIMAL(8,3), width_mm DECIMAL(8,3), height_mm DECIMAL(8,3),
  digikey_pn TEXT, mouser_pn TEXT, lcsc_pn TEXT, datasheet_url TEXT,
  last_api_update TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mpn, manufacturer)
);

CREATE TABLE IF NOT EXISTS public.api_pricing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('digikey', 'mouser', 'lcsc')),
  mpn TEXT NOT NULL, search_key TEXT NOT NULL, response JSONB NOT NULL,
  unit_price DECIMAL(10,4), stock_qty INT, currency TEXT DEFAULT 'CAD',
  fetched_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE(source, search_key)
);

CREATE TABLE IF NOT EXISTS public.m_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL, priority INT NOT NULL,
  layer INT NOT NULL CHECK (layer IN (1, 2, 3)),
  field_1 TEXT, operator_1 TEXT, value_1 TEXT,
  field_2 TEXT, operator_2 TEXT, value_2 TEXT,
  assigned_m_code TEXT NOT NULL, description TEXT, is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.overage_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  m_code TEXT NOT NULL, qty_threshold INT NOT NULL, extras INT NOT NULL,
  UNIQUE(m_code, qty_threshold)
);

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'sent', 'accepted', 'rejected', 'expired')),
  quantities JSONB NOT NULL, pricing JSONB NOT NULL DEFAULT '{}',
  component_markup DECIMAL(5,2) DEFAULT 20.00, pcb_cost_per_unit DECIMAL(10,2),
  assembly_cost DECIMAL(10,2), nre_charge DECIMAL(10,2) DEFAULT 0,
  labour_rate DECIMAL(7,2), smt_rate DECIMAL(7,2), validity_days INT DEFAULT 30,
  notes TEXT, pdf_path TEXT, issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL, quote_id UUID REFERENCES public.quotes(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  po_number TEXT, po_file_path TEXT,
  status TEXT DEFAULT 'created' CHECK (status IN ('created','procurement','parts_ordered','parts_received','production','inspection','shipping','delivered','invoiced','archived')),
  quantity INT NOT NULL, assembly_type TEXT DEFAULT 'TB' CHECK (assembly_type IN ('TB','TS','CS','CB','AS')),
  scheduled_start DATE, scheduled_completion DATE, actual_start TIMESTAMPTZ, actual_completion TIMESTAMPTZ,
  notes TEXT, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.job_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  old_status TEXT, new_status TEXT NOT NULL, changed_by UUID REFERENCES public.users(id),
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_code TEXT UNIQUE NOT NULL, job_id UUID NOT NULL REFERENCES public.jobs(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ordering','partial_received','fully_received','completed')),
  total_lines INT DEFAULT 0, lines_ordered INT DEFAULT 0, lines_received INT DEFAULT 0,
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.procurement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES public.bom_lines(id),
  mpn TEXT NOT NULL, description TEXT, m_code TEXT,
  qty_needed INT NOT NULL, qty_extra INT DEFAULT 0, qty_ordered INT DEFAULT 0, qty_received INT DEFAULT 0,
  supplier TEXT, supplier_pn TEXT, unit_price DECIMAL(10,4), extended_price DECIMAL(12,2),
  is_bg BOOLEAN DEFAULT FALSE,
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending','ordered','received','backordered')),
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL, procurement_id UUID NOT NULL REFERENCES public.procurements(id),
  supplier_name TEXT NOT NULL, supplier_email TEXT, lines JSONB NOT NULL,
  total_amount DECIMAL(12,2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','acknowledged','shipped','received','closed')),
  sent_at TIMESTAMPTZ, expected_arrival DATE, tracking_number TEXT, pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('materials_received','setup_started','smt_top_start','smt_top_end','smt_bottom_start','smt_bottom_end','reflow_start','reflow_end','aoi_start','aoi_passed','aoi_failed','through_hole_start','through_hole_end','touchup','washing','packing','ready_to_ship')),
  operator_id UUID REFERENCES public.users(id), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL, job_id UUID NOT NULL REFERENCES public.jobs(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  subtotal DECIMAL(12,2) NOT NULL, discount DECIMAL(12,2) DEFAULT 0,
  tps_gst DECIMAL(12,2) DEFAULT 0, tvq_qst DECIMAL(12,2) DEFAULT 0, freight DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  issued_date DATE, due_date DATE, paid_date DATE, payment_method TEXT, pdf_path TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id), table_name TEXT NOT NULL, record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_values JSONB, new_values JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY, value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_bom_lines_bom_id ON public.bom_lines(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_mpn ON public.bom_lines(mpn);
CREATE INDEX IF NOT EXISTS idx_components_mpn ON public.components(mpn);
CREATE INDEX IF NOT EXISTS idx_api_cache_lookup ON public.api_pricing_cache(source, search_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expiry ON public.api_pricing_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON public.quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_procurement_lines_procurement ON public.procurement_lines(procurement_id);
CREATE INDEX IF NOT EXISTS idx_production_events_job ON public.production_events(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name, record_id);

-- ==================== RLS ====================
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- CEO: full access on all tables
CREATE POLICY users_ceo ON public.users FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY customers_ceo ON public.customers FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY gmps_ceo ON public.gmps FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY boms_ceo ON public.boms FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY bom_lines_ceo ON public.bom_lines FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY components_ceo ON public.components FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY api_cache_ceo ON public.api_pricing_cache FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY m_code_rules_ceo ON public.m_code_rules FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY overage_ceo ON public.overage_table FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY quotes_ceo ON public.quotes FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY jobs_ceo ON public.jobs FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY job_status_log_ceo ON public.job_status_log FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY procurements_ceo ON public.procurements FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY procurement_lines_ceo ON public.procurement_lines FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY supplier_pos_ceo ON public.supplier_pos FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY production_events_ceo ON public.production_events FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY invoices_ceo ON public.invoices FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');
CREATE POLICY audit_log_ceo ON public.audit_log FOR SELECT USING (public.get_user_role()='ceo');
CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY settings_ceo ON public.app_settings FOR ALL USING (public.get_user_role()='ceo') WITH CHECK (public.get_user_role()='ceo');

-- Ops manager: read+write operational tables
CREATE POLICY users_ops ON public.users FOR SELECT USING (public.get_user_role()='operations_manager');
CREATE POLICY customers_ops ON public.customers FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY gmps_ops ON public.gmps FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY boms_ops ON public.boms FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY bom_lines_ops ON public.bom_lines FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY components_ops ON public.components FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY api_cache_ops ON public.api_pricing_cache FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY m_code_rules_ops ON public.m_code_rules FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY overage_ops ON public.overage_table FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY quotes_ops ON public.quotes FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY jobs_ops ON public.jobs FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY job_status_log_ops ON public.job_status_log FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY procurements_ops ON public.procurements FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY procurement_lines_ops ON public.procurement_lines FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY supplier_pos_ops ON public.supplier_pos FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY production_events_ops ON public.production_events FOR ALL USING (public.get_user_role()='operations_manager') WITH CHECK (public.get_user_role()='operations_manager');
CREATE POLICY settings_ops_read ON public.app_settings FOR SELECT USING (public.get_user_role() IN ('ceo','operations_manager'));

-- Shop floor: limited access
CREATE POLICY users_shop ON public.users FOR SELECT USING (public.get_user_role()='shop_floor' AND id=auth.uid());
CREATE POLICY jobs_shop ON public.jobs FOR SELECT USING (public.get_user_role()='shop_floor' AND status IN ('production','inspection'));
CREATE POLICY prod_events_shop_read ON public.production_events FOR SELECT USING (public.get_user_role()='shop_floor');
CREATE POLICY prod_events_shop_insert ON public.production_events FOR INSERT WITH CHECK (public.get_user_role()='shop_floor' AND operator_id=auth.uid());

-- ==================== SEED: CEO USER ====================
INSERT INTO public.users (id, email, full_name, role)
SELECT id, 'apatel@rspcbassembly.com', 'Anas Patel', 'ceo'
FROM auth.users WHERE email = 'apatel@rspcbassembly.com';

-- ==================== SEED: CUSTOMERS ====================
INSERT INTO customers (code, company_name, contact_name, contact_email, payment_terms) VALUES
('TLAN', 'Lanka / Knorr-Bremse / KB Rail Canada', 'Luis Esqueda', 'Luis.Esqueda@knorr-bremse.com', 'Net 30'),
('LABO', 'GoLabo', 'Genevieve St-Germain', 'gstgermain@golabo.com', 'Net 30'),
('VO2', 'VO2 Master', 'Martin Ciuraj', 'Martin.c@vo2master.com', 'Net 30'),
('SBQ', 'SBQuantum', NULL, NULL, 'Net 30'),
('CVNS', 'Cevians', 'Alain Migneault', 'AMigneault@cevians.com', 'Net 30'),
('CSA', 'Canadian Space Agency', 'Elodie Ricard', NULL, 'Net 30'),
('NORPIX', 'Norpix', 'Philippe Candelier', 'pc@norpix.com', 'Net 30'),
('DAMB', 'Demers Ambulances', NULL, NULL, 'Net 30'),
('OPKM', 'Optikam', NULL, NULL, 'Net 30'),
('QTKT', 'Quaketek', NULL, NULL, 'Net 30'),
('NUVO', 'Nuvotronik', NULL, NULL, 'Net 30');

-- ==================== SEED: OVERAGE ====================
INSERT INTO overage_table (m_code, qty_threshold, extras) VALUES
('0201',1,50),('0201',100,70),('0201',500,100),('0201',1000,150),
('0402',1,50),('0402',60,60),('0402',100,70),('0402',200,80),('0402',300,100),('0402',500,120),
('CP',1,10),('CP',60,30),('CP',100,35),('CP',200,40),('CP',300,50),('CP',500,60),
('CPEXP',1,10),('CPEXP',60,25),('CPEXP',100,30),('CPEXP',200,35),('CPEXP',500,45),
('IP',1,5),('IP',10,5),('IP',20,10),('IP',50,15),('IP',100,20),('IP',250,20),
('TH',1,1),('TH',10,1),('TH',20,2),('TH',50,5),('TH',100,5),('TH',250,20),
('MANSMT',1,2),('MANSMT',50,3),('MANSMT',100,5),
('MEC',1,1),('MEC',100,2),
('Accs',1,1),('CABLE',1,1),('DEV B',1,1);

-- ==================== SEED: PRICING SETTINGS ====================
INSERT INTO app_settings (key, value) VALUES ('pricing',
'{"component_markup_pct":20,"pcb_markup_pct":30,"smt_cost_per_placement":0.35,"th_cost_per_placement":0.75,"mansmt_cost_per_placement":1.25,"default_nre":350,"default_shipping":200,"quote_validity_days":30,"labour_rate_per_hour":75,"currency":"CAD"}'::jsonb
);
