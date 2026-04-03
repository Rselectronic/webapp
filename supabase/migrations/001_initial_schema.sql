-- RS PCB Assembly ERP — Initial Schema
-- Migration 001: All 18 core tables + indexes

-- 1. USERS (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'operations_manager', 'shop_floor')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  payment_terms TEXT DEFAULT 'Net 30',
  bom_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- 3. GMPS (Global Manufacturing Packages)
CREATE TABLE IF NOT EXISTS public.gmps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_number TEXT NOT NULL,
  board_name TEXT,
  revision TEXT DEFAULT '1',
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, gmp_number)
);

-- 4. BOMS (uploaded Bill of Materials files)
CREATE TABLE IF NOT EXISTS public.boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT,
  revision TEXT DEFAULT '1',
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'error')),
  parse_result JSONB,
  component_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- 5. BOM_LINES
CREATE TABLE IF NOT EXISTS public.bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reference_designator TEXT,
  cpc TEXT,
  description TEXT,
  mpn TEXT,
  manufacturer TEXT,
  is_pcb BOOLEAN DEFAULT FALSE,
  is_dni BOOLEAN DEFAULT FALSE,
  m_code TEXT,
  m_code_confidence DECIMAL(3,2),
  m_code_source TEXT CHECK (m_code_source IN ('database', 'rules', 'api', 'manual', NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bom_id, line_number)
);

-- 6. COMPONENTS (master component library)
CREATE TABLE IF NOT EXISTS public.components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  description TEXT,
  category TEXT,
  package_case TEXT,
  mounting_type TEXT,
  m_code TEXT,
  m_code_source TEXT DEFAULT 'manual',
  length_mm DECIMAL(8,3),
  width_mm DECIMAL(8,3),
  height_mm DECIMAL(8,3),
  digikey_pn TEXT,
  mouser_pn TEXT,
  lcsc_pn TEXT,
  datasheet_url TEXT,
  last_api_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mpn, manufacturer)
);

-- 7. API_PRICING_CACHE
CREATE TABLE IF NOT EXISTS public.api_pricing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('digikey', 'mouser', 'lcsc')),
  mpn TEXT NOT NULL,
  search_key TEXT NOT NULL,
  response JSONB NOT NULL,
  unit_price DECIMAL(10,4),
  stock_qty INT,
  currency TEXT DEFAULT 'CAD',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE(source, search_key)
);

-- 8. M_CODE_RULES (47 classification rules)
CREATE TABLE IF NOT EXISTS public.m_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,
  priority INT NOT NULL,
  layer INT NOT NULL CHECK (layer IN (1, 2, 3)),
  field_1 TEXT,
  operator_1 TEXT,
  value_1 TEXT,
  field_2 TEXT,
  operator_2 TEXT,
  value_2 TEXT,
  assigned_m_code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. OVERAGE_TABLE
CREATE TABLE IF NOT EXISTS public.overage_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  m_code TEXT NOT NULL,
  qty_threshold INT NOT NULL,
  extras INT NOT NULL,
  UNIQUE(m_code, qty_threshold)
);

-- 10. QUOTES
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'sent', 'accepted', 'rejected', 'expired')),
  quantities JSONB NOT NULL,
  pricing JSONB NOT NULL DEFAULT '{}',
  component_markup DECIMAL(5,2) DEFAULT 20.00,
  pcb_cost_per_unit DECIMAL(10,2),
  assembly_cost DECIMAL(10,2),
  nre_charge DECIMAL(10,2) DEFAULT 0,
  labour_rate DECIMAL(7,2),
  smt_rate DECIMAL(7,2),
  validity_days INT DEFAULT 30,
  notes TEXT,
  pdf_path TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- 11. JOBS
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL,
  quote_id UUID REFERENCES public.quotes(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  po_number TEXT,
  po_file_path TEXT,
  status TEXT DEFAULT 'created' CHECK (status IN (
    'created', 'procurement', 'parts_ordered', 'parts_received',
    'production', 'inspection', 'shipping', 'delivered', 'invoiced', 'archived'
  )),
  quantity INT NOT NULL,
  assembly_type TEXT DEFAULT 'TB' CHECK (assembly_type IN ('TB', 'TS', 'CS', 'CB', 'AS')),
  scheduled_start DATE,
  scheduled_completion DATE,
  actual_start TIMESTAMPTZ,
  actual_completion TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- 12. JOB_STATUS_LOG (immutable history)
CREATE TABLE IF NOT EXISTS public.job_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. PROCUREMENTS
CREATE TABLE IF NOT EXISTS public.procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_code TEXT UNIQUE NOT NULL,
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'ordering', 'partial_received', 'fully_received', 'completed'
  )),
  total_lines INT DEFAULT 0,
  lines_ordered INT DEFAULT 0,
  lines_received INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- 14. PROCUREMENT_LINES
CREATE TABLE IF NOT EXISTS public.procurement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES public.bom_lines(id),
  mpn TEXT NOT NULL,
  description TEXT,
  m_code TEXT,
  qty_needed INT NOT NULL,
  qty_extra INT DEFAULT 0,
  qty_ordered INT DEFAULT 0,
  qty_received INT DEFAULT 0,
  supplier TEXT,
  supplier_pn TEXT,
  unit_price DECIMAL(10,4),
  extended_price DECIMAL(12,2),
  is_bg BOOLEAN DEFAULT FALSE,
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'ordered', 'received', 'backordered')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. SUPPLIER_POS
CREATE TABLE IF NOT EXISTS public.supplier_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  procurement_id UUID NOT NULL REFERENCES public.procurements(id),
  supplier_name TEXT NOT NULL,
  supplier_email TEXT,
  lines JSONB NOT NULL,
  total_amount DECIMAL(12,2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'shipped', 'received', 'closed')),
  sent_at TIMESTAMPTZ,
  expected_arrival DATE,
  tracking_number TEXT,
  pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. PRODUCTION_EVENTS
CREATE TABLE IF NOT EXISTS public.production_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'materials_received', 'setup_started', 'smt_top_start', 'smt_top_end',
    'smt_bottom_start', 'smt_bottom_end', 'reflow_start', 'reflow_end',
    'aoi_start', 'aoi_passed', 'aoi_failed', 'through_hole_start', 'through_hole_end',
    'touchup', 'washing', 'packing', 'ready_to_ship'
  )),
  operator_id UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  subtotal DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  tps_gst DECIMAL(12,2) DEFAULT 0,
  tvq_qst DECIMAL(12,2) DEFAULT 0,
  freight DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issued_date DATE,
  due_date DATE,
  paid_date DATE,
  payment_method TEXT,
  pdf_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. AUDIT_LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
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
