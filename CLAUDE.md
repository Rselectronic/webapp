# RS PCB Assembly — Web App Development Brief

## For Claude Code | April 2026

**Project:** Custom ERP/Manufacturing Management Web App
**Company:** RS Electronique Inc. (RS PCB Assembly) — rspcbassembly.com
**Owner:** Anas Patel, CEO — apatel@rspcbassembly.com
**Developer:** Abdul Quayum Adekunle (AI Developer, Python background)
**Timeline:** 8 weeks (2 months)
**AI Pair:** Claude Code

---

## EXECUTIVE SUMMARY

RS PCB Assembly is a $2.5M/year contract electronics manufacturer in Montreal (5-6 people). They assemble PCBs for 11+ active customers, handling ~25 quotes/month and ~85 active jobs. The entire business currently runs on 11 interconnected Excel/VBA macro workbooks built by an external contractor. These workbooks are fragile, single-user, and have no real-time visibility.

We are building a web app to replace this system. Not buying off-the-shelf — RS's process is too custom (proprietary M-Code classification, 31+ customer BOM formats, CP IP BOM automation). The goal: eliminate the Excel dependency, give real-time visibility across the team, and cut quote turnaround from 2 hours to 15 minutes.

**Supabase project already exists:** `rspcbassembly.com` (project ID: `leynvlptisjjykfndjme`, PostgreSQL 17, us-west-2, ACTIVE_HEALTHY). Currently only has website tables (articles, gallery_images). ERP schema is a clean slate.

---

## TECH STACK (DECIDED)

| Layer               | Technology                                                    | Why                                                                  |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Database**        | PostgreSQL 17 via Supabase                                    | Already provisioned. Native JSONB, RLS, Realtime, zero infra setup   |
| **Auth**            | Supabase Auth (email/password)                                | Integrated with RLS. 3 roles: ceo, operations_manager, shop_floor    |
| **Backend API**     | Next.js API Routes + Supabase client                          | Server-side data fetching, type-safe queries                         |
| **Python Services** | FastAPI on Railway                                            | BOM parsing (cp_ip_v3.py), M-Code classification, DigiKey/Mouser API |
| **Frontend**        | Next.js 15 App Router + TypeScript + Tailwind CSS + shadcn/ui | SSR, file-based routing, Vercel deployment                           |
| **File Storage**    | Supabase Storage (S3-compatible)                              | BOMs, Gerbers, PDFs, invoices — RLS-integrated                       |
| **PDF Generation**  | @react-pdf/renderer or pdf-lib in API routes                  | Quotes, invoices, packing slips                                      |
| **Realtime**        | Supabase Realtime                                             | Production events, job status updates                                |
| **Deployment**      | Vercel (Next.js) + Railway (FastAPI)                          | Auto-deploy from GitHub, free tiers sufficient                       |

### Why This Stack

- **Supabase** eliminates weeks of backend setup (auth, storage, realtime, database all ready)
- **Next.js App Router** gives file-based routing that maps to business entities (`/customers`, `/quotes`, `/jobs`)
- **FastAPI stays separate** because cp_ip_v3.py and the DigiKey/Mouser integrations are already Python — zero refactoring
- **shadcn/ui** gives production-ready components without building a design system

---

## THE PEOPLE WHO WILL USE THIS

| User             | Role                    | Location             | Access Level                         | Primary Use                                                 |
| ---------------- | ----------------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------- |
| **Anas Patel**   | CEO                     | Montreal             | Full access (all data, all actions)  | Quotes, approvals, financials, customer comms               |
| **Piyush Tayal** | Operations Manager      | India (+9.5h offset) | All operational data (no financials) | Procurement, order processing, supplier POs, BOM management |
| **Hammad Ahmed** | Production / Shop Floor | Montreal (on-site)   | Job assignments only                 | Mark production steps, log events                           |

### Auth Setup (Supabase Auth)

```
anas@rspcbassembly.com   → role: ceo
piyush@rspcbassembly.com → role: operations_manager  (or orders@rspcbassembly.com)
hammad@rspcbassembly.com → role: shop_floor
```

---

## WHAT WE ARE REPLACING

These 11 Excel/VBA workbooks run the entire business today:

| Workbook            | Version | What It Does                                                     | Web App Replacement                     |
| ------------------- | ------- | ---------------------------------------------------------------- | --------------------------------------- |
| DM Common File      | V11     | Master pricing engine, 370+ GMP sheets, 11-button macro sequence | Quoting module + pricing engine         |
| Job Queue           | V8      | Order tracking, job release, shipping doc gen                    | Jobs module + Kanban board              |
| PROC Template       | V25     | Procurement document generator, 13-button sequence               | Procurement module + auto-PO gen        |
| PROC LOG File       | —       | Centralized procurement tracking                                 | Procurement dashboard                   |
| Production Schedule | V3      | Weekly production planning                                       | Production tracking module              |
| TIME File           | V11     | Labour costing per job, NRE calculation                          | Pricing engine (built into quotes)      |
| SHIPDOC             | V8      | Packing slips, certificates of compliance                        | Shipping module + PDF gen               |
| Invoice Template    | V3      | Invoice generation with PDF export                               | Invoicing module                        |
| PO Template         | V2      | Purchase order generation                                        | Supplier PO module                      |
| BG Stock History    | —       | Feeder stock tracking                                            | Inventory module                        |
| PROC Verification   | V3      | Part validation and QC                                           | Quality checks (built into procurement) |

**CRITICAL: Parallel Operation.** Do NOT kill Excel on day one. The web app runs alongside Excel for 4-6 weeks minimum. Piyush keeps his Excel workflow until the web app proves it works. Migration is gradual.

---

## PAIN POINTS (PRIORITIZED BY BUSINESS VALUE)

These are the 16 documented problems with the current system, ranked by how much time/money they cost:

### CRITICAL (Fix in Sprint 1-2)

| #   | Pain Point                                                                                       | Weekly Time Cost | Monthly $ Impact             |
| --- | ------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------- |
| 5   | **11-Button Quote Macro Sequence** — quotes take 2 hours each, exact button order, no validation | 12 hrs/week      | $8-10K capacity lost         |
| 1   | **No Single Source of Truth** — job status scattered across 6+ Excel files                       | 5-7 hrs/week     | $2-4K in confusion           |
| 15  | **Anas Is The Routing Layer** — every email funnels through one person                           | 15-20 hrs/week   | $2-3K bottleneck             |
| 13  | **No Real-Time Cost Tracking** — no quoted vs. actual cost comparison                            | —                | $5-15K hidden margin leakage |

### HIGH (Fix in Sprint 3-4)

| #   | Pain Point                                                            | Weekly Time Cost | Monthly $ Impact              |
| --- | --------------------------------------------------------------------- | ---------------- | ----------------------------- |
| 6   | **13-Button PROC Sequence** — procurement requires ceremony           | 8-12 hrs/week    | $2-5K                         |
| 14  | **Manual Payment Tracking** — no aging report, no automated follow-up | 5-8 hrs/week     | $3-8K cash flow impact        |
| 4   | **M Codes 40% Manual** — despite 31+ rules, 40% need human override   | 2-4 hrs/week     | $3-5K                         |
| 7   | **OneDrive Lock File Conflicts** — DM File corruption risk            | 2-3 hrs/week     | Catastrophic if file corrupts |

### MEDIUM (Post-MVP)

| #   | Pain Point                                                               |
| --- | ------------------------------------------------------------------------ |
| 3   | 81-Day PROC File Gap — no record between material receipt and completion |
| 12  | Production Black Hole — no digital record of assembly/reflow/inspection  |
| 10  | Customer Data Scattered across email, folders, database, Excel           |
| 11  | BG Feeders Disconnected from M Codes                                     |
| 16  | No Email Templates                                                       |
| 2   | API Credentials in Plain Text                                            |
| 8   | No Version Control on 80+ templates                                      |
| 9   | Abandoned Access Database                                                |

---

## DATABASE SCHEMA

All tables go in the `public` schema of Supabase project `leynvlptisjjykfndjme`.

### Core Tables (18 total)

```sql
-- ============================================
-- 1. USERS (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'operations_manager', 'shop_floor')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CUSTOMERS
-- ============================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,          -- "TLAN", "LABO", "CSA", "SBQ" etc.
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  payment_terms TEXT DEFAULT 'Net 30',
  bom_config JSONB DEFAULT '{}',      -- Customer-specific BOM parsing config (column mappings, header row, encoding)
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- ============================================
-- 3. GMPS (Global Manufacturing Packages — board/product definitions)
-- ============================================
CREATE TABLE public.gmps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_number TEXT NOT NULL,           -- "TL265-5040-000-T", "5044355-E001", etc.
  board_name TEXT,                    -- Human-readable name
  revision TEXT DEFAULT '1',
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',        -- Board-specific data (layer count, dimensions, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, gmp_number)
);

-- ============================================
-- 4. BOMS (uploaded Bill of Materials files)
-- ============================================
CREATE TABLE public.boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,             -- Supabase Storage path
  file_hash TEXT,                      -- MD5 to detect re-uploads
  revision TEXT DEFAULT '1',
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'error')),
  parse_result JSONB,                  -- { components: [...], issues: [...], pcb_info: {...} }
  component_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- ============================================
-- 5. BOM_LINES (parsed component lines from a BOM)
-- ============================================
CREATE TABLE public.bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reference_designator TEXT,           -- "C1, C2, C10"
  cpc TEXT,                            -- Customer Part Code
  description TEXT,
  mpn TEXT,                            -- Manufacturer Part Number
  manufacturer TEXT,
  is_pcb BOOLEAN DEFAULT FALSE,
  is_dni BOOLEAN DEFAULT FALSE,        -- Do Not Install
  m_code TEXT,                         -- Assigned M-Code (CP, IP, TH, etc.)
  m_code_confidence DECIMAL(3,2),      -- 0.00-1.00
  m_code_source TEXT CHECK (m_code_source IN ('database', 'rules', 'api', 'manual', NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bom_id, line_number)
);

-- ============================================
-- 6. COMPONENTS (master component library — cached from APIs + human review)
-- ============================================
CREATE TABLE public.components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  description TEXT,
  category TEXT,                        -- resistor, capacitor, ic, connector, etc.
  package_case TEXT,                    -- "0402", "SOIC-8", "QFP-48"
  mounting_type TEXT,                   -- "Surface Mount", "Through Hole"
  m_code TEXT,                          -- Verified M-Code classification
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

-- ============================================
-- 7. API_PRICING_CACHE (DigiKey/Mouser/LCSC cached responses)
-- ============================================
CREATE TABLE public.api_pricing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('digikey', 'mouser', 'lcsc')),
  mpn TEXT NOT NULL,
  search_key TEXT NOT NULL,            -- The actual CPC/keyword sent to API
  response JSONB NOT NULL,             -- Full API response
  unit_price DECIMAL(10,4),            -- Extracted best price
  stock_qty INT,                       -- Extracted stock quantity
  currency TEXT DEFAULT 'CAD',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE(source, search_key)
);

-- ============================================
-- 8. M_CODE_RULES (47 classification rules — PAR-01 through PAR-47)
-- ============================================
CREATE TABLE public.m_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,        -- "PAR-01", "PAR-02", etc.
  priority INT NOT NULL,               -- Execution order (1 = highest)
  layer INT NOT NULL CHECK (layer IN (1, 2, 3)),  -- 1=DB, 2=Rules, 3=API
  field_1 TEXT,                        -- First condition field (mounting_type, package, category, etc.)
  operator_1 TEXT,                     -- "equals", "contains", "regex", "in"
  value_1 TEXT,                        -- Condition value
  field_2 TEXT,                        -- Optional second condition
  operator_2 TEXT,
  value_2 TEXT,
  assigned_m_code TEXT NOT NULL,       -- "CP", "IP", "TH", "0402", "CPEXP", etc.
  description TEXT,                    -- Human-readable rule explanation
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. OVERAGE_TABLE (extra components per M-Code per quantity tier)
-- ============================================
CREATE TABLE public.overage_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  m_code TEXT NOT NULL,
  qty_threshold INT NOT NULL,          -- At this qty level...
  extras INT NOT NULL,                 -- ...add this many extra
  UNIQUE(m_code, qty_threshold)
);

-- ============================================
-- 10. QUOTES
-- ============================================
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,   -- "QT-2604-001" auto-generated
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'sent', 'accepted', 'rejected', 'expired')),
  quantities JSONB NOT NULL,           -- { "qty_1": 50, "qty_2": 100, "qty_3": 250, "qty_4": 500 }
  pricing JSONB NOT NULL DEFAULT '{}', -- Per-tier breakdown: components, pcb, assembly, nre, total, per_unit
  component_markup DECIMAL(5,2) DEFAULT 20.00,  -- % markup on distributor price
  pcb_cost_per_unit DECIMAL(10,2),
  assembly_cost DECIMAL(10,2),
  nre_charge DECIMAL(10,2) DEFAULT 0,
  labour_rate DECIMAL(7,2),
  smt_rate DECIMAL(7,2),
  validity_days INT DEFAULT 30,
  notes TEXT,
  pdf_path TEXT,                       -- Supabase Storage path to generated PDF
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- ============================================
-- 11. JOBS (replaces Job Queue V8)
-- ============================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL,     -- "JB-2604-TLAN-001" auto-generated
  quote_id UUID REFERENCES public.quotes(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  po_number TEXT,                      -- Customer PO number
  po_file_path TEXT,                   -- Scanned PO in storage
  status TEXT DEFAULT 'created' CHECK (status IN (
    'created', 'procurement', 'parts_ordered', 'parts_received',
    'production', 'inspection', 'shipping', 'delivered', 'invoiced', 'archived'
  )),
  quantity INT NOT NULL,               -- Accepted quantity tier
  assembly_type TEXT DEFAULT 'TB' CHECK (assembly_type IN ('TB', 'TS', 'CS', 'CB', 'AS')),
  -- TB=Top+Bottom, TS=Top-side only, CS=Consignment, CB=Customer Board, AS=Assembly-only
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

-- ============================================
-- 12. JOB_STATUS_LOG (immutable history)
-- ============================================
CREATE TABLE public.job_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. PROCUREMENTS (replaces PROC Template V25)
-- ============================================
CREATE TABLE public.procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proc_code TEXT UNIQUE NOT NULL,      -- "260403 TLAN-TB085" (legacy format)
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

-- ============================================
-- 14. PROCUREMENT_LINES (individual component orders)
-- ============================================
CREATE TABLE public.procurement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES public.bom_lines(id),
  mpn TEXT NOT NULL,
  description TEXT,
  m_code TEXT,
  qty_needed INT NOT NULL,
  qty_extra INT DEFAULT 0,             -- Overage
  qty_ordered INT DEFAULT 0,
  qty_received INT DEFAULT 0,
  supplier TEXT,                       -- "DigiKey", "Mouser", "LCSC", "WMD", etc.
  supplier_pn TEXT,
  unit_price DECIMAL(10,4),
  extended_price DECIMAL(12,2),
  is_bg BOOLEAN DEFAULT FALSE,         -- Bulk Goods (from RS stock) vs Single Source
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'ordered', 'received', 'backordered')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 15. SUPPLIER_POS (purchase orders sent to suppliers)
-- ============================================
CREATE TABLE public.supplier_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  procurement_id UUID NOT NULL REFERENCES public.procurements(id),
  supplier_name TEXT NOT NULL,
  supplier_email TEXT,
  lines JSONB NOT NULL,                -- [{mpn, qty, unit_price, line_total}]
  total_amount DECIMAL(12,2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'shipped', 'received', 'closed')),
  sent_at TIMESTAMPTZ,
  expected_arrival DATE,
  tracking_number TEXT,
  pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 16. PRODUCTION_EVENTS (shop floor tracking — Supabase Realtime)
-- ============================================
CREATE TABLE public.production_events (
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

-- ============================================
-- 17. INVOICES
-- ============================================
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL, -- "INV-2604-001"
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  subtotal DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  tps_gst DECIMAL(12,2) DEFAULT 0,    -- 5% federal tax
  tvq_qst DECIMAL(12,2) DEFAULT 0,    -- 9.975% Quebec tax
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

-- ============================================
-- 18. AUDIT_LOG (compliance + traceability)
-- ============================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_bom_lines_bom_id ON public.bom_lines(bom_id);
CREATE INDEX idx_bom_lines_mpn ON public.bom_lines(mpn);
CREATE INDEX idx_components_mpn ON public.components(mpn);
CREATE INDEX idx_api_cache_lookup ON public.api_pricing_cache(source, search_key);
CREATE INDEX idx_api_cache_expiry ON public.api_pricing_cache(expires_at);
CREATE INDEX idx_quotes_customer ON public.quotes(customer_id);
CREATE INDEX idx_quotes_status ON public.quotes(status);
CREATE INDEX idx_jobs_customer ON public.jobs(customer_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_procurement_lines_procurement ON public.procurement_lines(procurement_id);
CREATE INDEX idx_production_events_job ON public.production_events(job_id);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_audit_log_table ON public.audit_log(table_name, record_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- CEO sees everything
CREATE POLICY ceo_all ON public.customers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
-- Repeat for all tables...

-- Operations Manager sees operational data (not invoices)
CREATE POLICY ops_read ON public.customers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
-- Repeat pattern for: gmps, boms, bom_lines, components, quotes, jobs, procurements, procurement_lines, supplier_pos

-- Shop Floor sees only assigned jobs + can create production events
CREATE POLICY shop_floor_jobs ON public.jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shop_floor')
  AND status IN ('production', 'inspection')
);

CREATE POLICY shop_floor_events ON public.production_events FOR INSERT WITH CHECK (
  operator_id = auth.uid()
);

-- Invoices: CEO only
CREATE POLICY invoices_ceo ON public.invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
```

### Supabase Storage Buckets

```
boms/          — Uploaded BOM files (xlsx, csv)
gerbers/       — Gerber file archives (zip)
quotes/        — Generated quote PDFs
jobs/          — PO scans, job documents
invoices/      — Generated invoice PDFs
procurement/   — Supplier PO PDFs, packing slips
```

All buckets: private, RLS-enabled. Path pattern: `{bucket}/{customer_code}/{gmp_number}/{filename}`.

---

## M-CODE CLASSIFICATION SYSTEM

This is the proprietary intelligence layer that makes RS's process unique. Every component on a BOM gets classified into an M-Code that determines how it's handled in production.

### M-Code Types (11 categories)

| M-Code     | What It Is                  | Size Range                     | Production Handling                              |
| ---------- | --------------------------- | ------------------------------ | ------------------------------------------------ |
| **0201**   | Ultra-tiny passives         | 0.4-0.99mm L × 0.2-0.48mm W    | High-precision pick-and-place                    |
| **0402**   | Small passives              | 1.0-1.49mm L × 0.49-0.79mm W   | Specialized feeders                              |
| **CP**     | Chip Package (standard SMT) | 1.5-3.79mm L × 0.8-3.59mm W    | Standard pick-and-place (~59% of all components) |
| **CPEXP**  | Expanded SMT                | 3.8-4.29mm L × 3.6-3.99mm W    | Wider feeder slots                               |
| **IP**     | IC Package (large SMT)      | 4.3-25mm L × 4.0-25mm W        | Tray/tube feeders (~15%)                         |
| **TH**     | Through-Hole                | Any size, through-hole mount   | Manual insertion (~12%)                          |
| **MANSMT** | Manual SMT                  | Case-by-case                   | Hand-soldered (~1%)                              |
| **MEC**    | Mechanical                  | Standoffs, heatsinks, brackets | Manual assembly                                  |
| **Accs**   | Accessories                 | Clips, spacers                 | Manual                                           |
| **CABLE**  | Wiring/Cables               | Wire, harness                  | Manual                                           |
| **DEV B**  | Development boards          | Arduino, eval boards           | Pre-made modules                                 |

### 3-Layer Classification Pipeline

```
Input: CPC (Customer Part Code) + Description + MPN from BOM line

Layer 1: DATABASE LOOKUP (fastest, ~70% hit rate for repeat customers)
  → Search components table by MPN
  → If found AND confidence >= 0.95: return m_code, source="database"
  → If not found: pass to Layer 2

Layer 2: RULE ENGINE (47 PAR rules, ~25% of remaining)
  → PAR-01: mounting_type = "Through Hole" → TH
  → PAR-02: mounting_type = "Surface Mount, Through Hole" → MANSMT
  → PAR-03 through PAR-47: package/keyword/size/category combinations
  → If matched with confidence >= 0.85: return m_code, source="rules"
  → If no match: pass to Layer 3

Layer 3: API LOOKUP (DigiKey/Mouser keyword search, ~5% of remaining)
  → Send CPC to DigiKey V4 keyword search API
  → Extract: mounting_type, package_case, dimensions, category
  → Run through Layer 2 rules again with enriched data
  → If classified: return m_code, source="api", confidence=0.80
  → If still unclassified: return m_code=NULL, source=NULL → HUMAN REVIEW QUEUE

Human Review:
  → Piyush or Anas manually assigns M-Code
  → Decision saved to components table (Layer 1) for future auto-match
  → This is the learning loop — every manual decision makes the system smarter
```

### Overage Calculation

When ordering components, RS orders extras per M-Code to account for attrition:

```python
# Example overage table (key entries)
OVERAGE = {
  "CP":    [(1,10), (60,30), (100,35), (200,40), (300,50), (500,60)],
  "0402":  [(1,50), (60,60), (100,70), (200,80), (300,100), (500,120)],
  "IP":    [(1,5), (10,5), (20,10), (50,15), (100,20), (250,20)],
  "TH":    [(1,1), (10,1), (20,2), (50,5), (100,5), (250,20)],
  # ... full table in overage_table DB table
}

def get_overage(m_code: str, qty: int) -> int:
    """Return number of extra parts to order."""
    tiers = OVERAGE.get(m_code, [(1, 0)])
    extras = 0
    for threshold, extra in tiers:
        if qty >= threshold:
            extras = extra
    return extras
```

---

## PRICING ENGINE

The quote pricing formula (extracted from TIME V11 and DM Common File):

```
Total Quote Per Tier = Component Cost + PCB Cost + Assembly Cost + NRE

Component Cost = SUM(unit_price × order_qty × (1 + markup%)) for all components
  where order_qty = (qty_per_board × board_qty) + overage

PCB Cost = pcb_unit_price × board_qty × (1 + pcb_markup%)

Assembly Cost = placement_count × cost_per_placement × board_qty
  where placement_count = SUM(qty_per_board) for all SMT components (CP, IP, 0402, CPEXP)
  TH components have separate (higher) per-placement cost

NRE (Non-Recurring Engineering) = stencil_cost + programming_cost + setup_cost
  Typically $150-$500 depending on board complexity. First-time boards only.

Per-Unit Price = Total Quote / board_qty
```

### ASSUMPTIONS TO VERIFY WITH ANAS (before pricing goes live):

- Component markup: **20%** (configurable per customer)
- PCB markup: **30%**
- SMT cost per placement: **$0.35** (from TIME file)
- TH cost per placement: **$0.75**
- Default NRE: **$350** (stencil + setup + programming)
- Shipping flat rate: **$200** (or actual carrier quote)
- Labour rate: **verify from TIME V14**
- SMT rate: **verify from TIME V14**

These go into a `pricing_rules` settings page so Anas can adjust without code changes.

---

## CUSTOMER BOM CONFIGURATIONS

Each customer sends BOMs differently. This config is stored in `customers.bom_config` JSONB field:

```json
// Lanka (TLAN) — No header row, fixed column order
{
  "header_row": null,
  "columns_fixed": ["qty", "designator", "cpc", "description", "mpn", "manufacturer"],
  "encoding": "utf-8",
  "format": "xlsx",
  "section_filter": true,
  "notes": "M CODES SUMMARY section headers must be filtered"
}

// RTINGS — CSV, UTF-16, tab-separated
{
  "format": "csv",
  "encoding": "utf-16",
  "separator": "\t",
  "columns": {
    "qty": "Quantity",
    "designator": "Designator",
    "mpn": "Manufacturer Part",
    "manufacturer": "Manufacturer",
    "description": "Name"
  }
}

// Infinition — Raw XML reader needed
{
  "format": "xlsx_raw_xml",
  "columns": {
    "qty": "Quantity",
    "designator": "Designator",
    "mpn": "MANUFACTURER_PN",
    "manufacturer": "MANUFACTURER",
    "description": "Description"
  },
  "gerber_path": "sibling_panel_folder",
  "notes": "Gerber in PANEL sibling folder, not alongside BOM"
}

// ISC (standard)
{
  "columns": "auto_detect",
  "cpc_fallback": "mpn",
  "notes": "No CPC column — use MPN as CPC"
}

// Legend Power ASY-0116 — Header at row 12
{
  "header_row": 12,
  "columns": {
    "qty": "Quantity",
    "designator": "Designator",
    "mpn": "PartNumber",
    "manufacturer": "Manufacturer",
    "description": "Description"
  }
}

// Signel CES1009 — French, header row 7
{
  "header_row": 7,
  "columns": {
    "qty": "Qté",
    "designator": "Position sur circuit",
    "mpn": "# Manufacturier",
    "manufacturer": "Manufacturier",
    "description": "Description"
  }
}

// Exonetik — Has "Mounted" column filter
{
  "columns": {
    "qty": "Quantity for 1 board",
    "designator": "Designator",
    "mpn": "Manufacturer Part Number 1",
    "manufacturer": "Manufacturer 1",
    "description": "Description"
  },
  "mount_filter_col": "Mounted",
  "mount_exclude_values": ["N.M.", "NOT MOUNTED", "NOT PLACE"]
}
```

**Auto-detection keywords** for when customers.bom_config says `"columns": "auto_detect"`:

| Field        | Known Column Names                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| qty          | qty, quantity, qté, quantity for 1 board, quantity / board, requested quantity 1                                                          |
| designator   | designator, designation, ref des, ref. des., reference designator, refdes, r des., position sur circuit, reference, part reference, index |
| mpn          | mpn, manufacturer part number, manufacturer_pn, mfr#, manufacturer part, part number, mfg p/n                                             |
| manufacturer | manufacturer, mfg name, manufacturier, mfr name, manufacturer name, manufacturer 1                                                        |
| description  | description, desc, part description, value, name                                                                                          |
| cpc          | cpc, erp_pn, isc p/n, legend p/n, fiso#                                                                                                   |

---

## CP IP BOM GENERATION RULES (9 Rules)

When a BOM is uploaded, parse it into the standardized 6-column format:

1. **Fiducial Exclusion** — Skip rows where designator matches `^FID\d+$`
2. **PCB at Top** — Pin PCB row first (designator matches `^PCB[A-Z0-9\-]*$`). Match designator ONLY, never description.
3. **DNI Exclusion** — Skip rows where: (qty=0 AND mpn blank) OR description/designator contains DNI/DNP/DNL/"DO NOT INSTALL"/"DO NOT PLACE"/"DO NOT POPULATE"
4. **No Title Row** — Output row 1 = headers, row 2 = data. No banner.
5. **Log Sheet** — Track what happened to each row (PCB/FIDUCIAL/DNI/INCLUDED/MERGED/AUTO-PCB)
6. **Designator-Only PCB Detection** — Never match PCB by description text
7. **MPN Merge** — Same MPN → combine rows: sum quantities, merge designators (natural sort)
8. **Auto-PCB from Gerber** — If no PCB row in BOM, search nearby for Gerber folder/zip, extract name
9. **Sort** — By quantity DESC, then first designator ASC (natural sort). PCB always pinned at top.

**Section Header Filter:** Rows where designator has spaces but no digits = section headers → skip.
**CPC Fallback:** No CPC column or blank → use MPN value.
**N.M. Filter:** If mount column exists and value is "N.M."/"NOT MOUNTED" → exclude.

### Output Format (stored in bom_lines table)

| Column               | Data                                 |
| -------------------- | ------------------------------------ |
| quantity             | Integer                              |
| reference_designator | Comma-separated, natural-sorted      |
| cpc                  | Customer Part Code (or MPN fallback) |
| description          | Component description                |
| mpn                  | Manufacturer Part Number             |
| manufacturer         | Manufacturer name                    |

---

## PROJECT STRUCTURE

```
erp-rs-pcb/                           ← Next.js monorepo
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                 ← Sidebar nav, auth guard, role context
│   │   ├── page.tsx                   ← Dashboard home (KPIs, recent activity)
│   │   ├── customers/
│   │   │   ├── page.tsx               ← Customer list (search, filter)
│   │   │   └── [id]/page.tsx          ← Customer detail + order history
│   │   ├── bom/
│   │   │   ├── upload/page.tsx        ← Upload BOM, select customer, parse
│   │   │   └── [id]/page.tsx          ← Parsed BOM review, M-Code assignments
│   │   ├── quotes/
│   │   │   ├── page.tsx               ← Quote list (filter by status)
│   │   │   ├── new/page.tsx           ← Create quote from parsed BOM
│   │   │   └── [id]/page.tsx          ← Quote detail, PDF preview, send
│   │   ├── jobs/
│   │   │   ├── page.tsx               ← Job board (Kanban by status)
│   │   │   └── [id]/page.tsx          ← Job detail, documents, timeline
│   │   ├── procurement/
│   │   │   ├── page.tsx               ← PROC list with status
│   │   │   └── [id]/page.tsx          ← PROC detail, supplier POs, receiving
│   │   ├── production/
│   │   │   ├── page.tsx               ← Production dashboard (realtime)
│   │   │   └── log/page.tsx           ← Shop floor event logger (Hammad)
│   │   ├── invoices/
│   │   │   ├── page.tsx               ← Invoice list + aging report
│   │   │   └── [id]/page.tsx          ← Invoice detail, PDF, payment
│   │   ├── settings/
│   │   │   ├── pricing/page.tsx       ← Markup rates, labour rates, NRE defaults
│   │   │   ├── m-codes/page.tsx       ← M-Code rules editor
│   │   │   ├── customers/page.tsx     ← BOM config editor per customer
│   │   │   └── suppliers/page.tsx     ← Supplier list, API keys
│   │   └── reports/
│   │       ├── profitability/page.tsx ← Quoted vs actual, margin by customer
│   │       └── overview/page.tsx      ← Revenue, job count, capacity
│   ├── api/
│   │   ├── bom/parse/route.ts         ← Calls FastAPI Python service
│   │   ├── quotes/[id]/pdf/route.ts   ← PDF generation
│   │   ├── invoices/[id]/pdf/route.ts
│   │   └── webhooks/supabase/route.ts ← Realtime event handlers
│   ├── middleware.ts                   ← Auth + role enforcement
│   └── layout.tsx                      ← Root layout + providers
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   ← Browser Supabase client
│   │   ├── server.ts                   ← Server-side Supabase client
│   │   └── types.ts                    ← Generated types from Supabase
│   ├── pricing/
│   │   ├── engine.ts                   ← Pricing calculation logic
│   │   ├── overage.ts                  ← Overage lookup
│   │   └── m-codes.ts                  ← M-Code rule engine (TypeScript port)
│   └── utils/
│       ├── format.ts                   ← Currency, phone, date formatting
│       └── pdf-templates.ts            ← Quote/invoice PDF layouts
├── components/
│   ├── ui/                             ← shadcn/ui components
│   ├── forms/                          ← Customer, Quote, Job forms
│   └── dashboard/                      ← KPI cards, charts, Kanban
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       ├── 003_seed_m_code_rules.sql
│       ├── 004_seed_overage_table.sql
│       └── 005_seed_customers.sql
├── .env.local
├── package.json
├── tsconfig.json
└── next.config.ts

erp-rs-python/                         ← FastAPI microservice (separate repo)
├── app/
│   ├── main.py
│   ├── routers/
│   │   ├── bom.py                     ← POST /bom/parse — BOM parsing
│   │   ├── classify.py                ← POST /classify — M-Code classification
│   │   └── pricing.py                 ← GET /price/{mpn} — DigiKey/Mouser lookup
│   ├── services/
│   │   ├── bom_parser.py              ← Port of cp_ip_v3.py logic
│   │   ├── m_code_classifier.py       ← 3-layer classification pipeline
│   │   ├── digikey_client.py          ← DigiKey V4 API wrapper
│   │   └── mouser_client.py           ← Mouser API wrapper
│   └── config.py                      ← Supabase URL, API keys from env
├── requirements.txt
├── Dockerfile
└── railway.toml                       ← Railway deployment config
```

---

## 8-WEEK SPRINT PLAN

### Sprint 1 (Weeks 1-2): FOUNDATION + CUSTOMER DATABASE

**Goal:** App skeleton deployed, customers visible, auth working.

Deliverables:

- [ ] Next.js 15 project scaffolded with TypeScript, Tailwind, shadcn/ui
- [ ] Supabase Auth configured (email/password, 3 users created)
- [ ] Database migration #001 applied (all 18 tables)
- [ ] RLS policies applied (#002)
- [ ] Login page functional
- [ ] Dashboard page with placeholder KPIs
- [ ] Sidebar navigation with all menu items (most disabled)
- [ ] Customer list page (search, filter active/inactive)
- [ ] Customer detail page (contact info, BOM config display)
- [ ] Seed data: all 11 customers with bom_config populated
- [ ] FastAPI project scaffolded, deployed to Railway
- [ ] Vercel deployment configured (auto-deploy from GitHub)

**Acceptance test:** Anas logs in → sees dashboard → clicks Customers → sees Lanka, LABO, CSA, etc. → clicks Lanka → sees contact info and BOM config.

---

### Sprint 2 (Weeks 3-4): BOM UPLOAD + PARSING + M-CODE CLASSIFICATION

**Goal:** Upload a BOM, parse it, classify components, review results.

Deliverables:

- [ ] BOM upload page (drag-drop, select customer + GMP)
- [ ] GMP creation (new or select existing)
- [ ] File upload to Supabase Storage
- [ ] FastAPI `/bom/parse` endpoint (port cp_ip_v3.py 9 rules)
- [ ] Customer BOM config used for column mapping
- [ ] Parsed BOM preview table (all 6 columns + M-Code column)
- [ ] 3-layer M-Code classification running on parsed lines
- [ ] Human review queue (unclassified components highlighted)
- [ ] Manual M-Code assignment (click to assign, saves to components table)
- [ ] Seed data: 47 PAR rules in m_code_rules table
- [ ] Seed data: overage table populated
- [ ] BOM revision history (re-upload same GMP shows versions)

**Acceptance test:** Upload a Lanka TL265 BOM → auto-parsed with no header row → M-Codes assigned (60%+ auto) → Piyush reviews remaining → all saved.

---

### Sprint 3 (Weeks 5-6): QUOTING ENGINE + PDF GENERATION

**Goal:** Generate a full quote with 4 quantity tiers and a PDF.

Deliverables:

- [ ] Quote creation form (select parsed BOM, enter 4 quantities)
- [ ] DigiKey/Mouser API integration via FastAPI `/price/{mpn}`
- [ ] API response caching in api_pricing_cache (7-day TTL)
- [ ] Pricing engine calculating per-tier totals (components + PCB + assembly + NRE)
- [ ] Overage calculation per M-Code per tier
- [ ] Quote review page showing all 4 tiers side-by-side
- [ ] Quote approval workflow (draft → review → sent)
- [ ] PDF quote generation matching RS's current format
- [ ] PDF stored in Supabase Storage, downloadable link
- [ ] Quote list page with status filters
- [ ] Settings page: markup rates, labour rate, NRE defaults (editable by CEO)
- [ ] Quote expiry (30-day default, auto-mark expired)

**Acceptance test:** Parsed BOM → create quote for 50/100/250/500 qty → pricing calculated → Anas reviews → approves → PDF generated → looks like current RS quotes → downloadable.

---

### Sprint 4 (Weeks 7-8): JOBS + PROCUREMENT + INVOICING

**Goal:** Full order lifecycle from PO to invoice.

Deliverables:

- [ ] Quote acceptance → Job creation (auto-generate job number)
- [ ] Job Kanban board (created → procurement → production → shipping → invoiced)
- [ ] Job detail page (BOM, quote link, PO upload, timeline)
- [ ] Drag-and-drop or click to move job status
- [ ] Procurement creation from job (auto-generate proc_code in legacy format)
- [ ] Procurement lines auto-populated from BOM + overage
- [ ] Supplier allocation (group lines by best supplier)
- [ ] Supplier PO generation (grouped by supplier, PDF)
- [ ] Receiving workflow (mark lines as received, update counts)
- [ ] Production event logger (simple page for Hammad — select job, click event type)
- [ ] Realtime production dashboard (CEO sees events as they happen)
- [ ] Invoice generation from completed job (auto-populate from quote pricing)
- [ ] Invoice PDF with RS header, GST/QST tax calculation
- [ ] Invoice list with aging (overdue highlighting)
- [ ] Payment tracking (mark paid, record date + method)

**Acceptance test:** Full lifecycle: Quote accepted → Job created → PROC generated → Supplier POs created → Materials received → Hammad logs production events → Anas sees realtime → Job ships → Invoice generated with correct taxes → Payment recorded.

---

## CRITICAL ARCHITECTURAL DECISIONS

### 1. Supabase Auth with Cookie-Based Sessions (NOT localStorage)

Use `@supabase/ssr` package. Store sessions in cookies. In middleware, always use `supabase.auth.getUser()` (server-side validation), never trust `getSession()` alone.

### 2. Separate Supabase Clients

- `lib/supabase/client.ts` → browser client (Client Components)
- `lib/supabase/server.ts` → server client (Server Components, API Routes)

### 3. Python Logic Stays in FastAPI

Do NOT rewrite cp_ip_v3.py in TypeScript. The BOM parsing, M-Code classification, and DigiKey/Mouser integrations stay Python in the FastAPI service. Next.js calls FastAPI via HTTP.

### 4. JSONB for Flexible Data

Customer BOM configs, quote pricing breakdowns, supplier PO line items — all JSONB. Schema flexibility without migrations.

### 5. Realtime Only Where It Matters

Enable Supabase Realtime subscriptions for: `production_events` (shop floor → CEO), `job_status_log` (status changes). Everything else uses standard fetch.

### 6. PDF Generation in Next.js API Routes

Use `@react-pdf/renderer` or `pdf-lib` in Next.js API routes (not Edge Functions — need full Node.js runtime). Store generated PDFs in Supabase Storage.

### 7. Parallel Operation with Excel

The web app does NOT replace Excel on day one. Both systems run simultaneously. Data can be exported to CSV/Excel from the web app. The DM Common File stays untouched until Sprint 4 is proven stable.

---

## EXISTING ASSETS TO REUSE

| Asset                    | Location                                       | How to Use                                                            |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| cp_ip_v3.py              | Abdul has it locally                           | Port into FastAPI `services/bom_parser.py`                            |
| dm_upload.py             | Abdul has it locally                           | Reference for DM column mappings (don't run it — web app replaces it) |
| DigiKey API integration  | Existing Python code                           | Port into FastAPI `services/digikey_client.py`                        |
| Mouser API integration   | Existing Python code                           | Port into FastAPI `services/mouser_client.py`                         |
| 11,318 cached JSON files | `/6. BACKEND/JSON DATA/` on RS OneDrive        | Bulk import into api_pricing_cache table for instant Layer 1 coverage |
| 370+ GMP pricing sheets  | DM Common File V11                             | Extract component data → seed components table                        |
| Customer BOM configs     | Documented in this file + rs-pcb-quoting skill | Seed into customers.bom_config                                        |
| 47 PAR rules             | CLAUDE_CODE_SYSTEM_CONTEXT.md                  | Seed into m_code_rules table                                          |

---

## COMPANY IDENTITY FOR PDF TEMPLATES

```
R.S. ÉLECTRONIQUE INC.
5580 Vanden Abeele
Saint-Laurent, QC H4S 1P9
Canada

Phone: +1 (438) 833-8477
Email: info@rspcbassembly.com
Web: www.rspcbassembly.com

GST/TPS: 840134829
QST/TVQ: 1214617001

Tax Rates:
  TPS/GST: 5%
  TVQ/QST: 9.975%
```

---

## CUSTOMER SEED DATA

```sql
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
```

---

## SUPPLIER SEED DATA

Key suppliers for the procurement module:

| Supplier                      | Type                   | API?                       | Contact                       |
| ----------------------------- | ---------------------- | -------------------------- | ----------------------------- |
| DigiKey                       | Component distributor  | Yes (V4 API, 1000 req/day) | Via API                       |
| Mouser                        | Component distributor  | Yes (30 req/min, 1000/day) | Via API                       |
| LCSC                          | Component distributor  | Yes (in development)       | Via API                       |
| WMD Circuits (Mike)           | PCB fabricator (China) | No                         | mike@wmdpcb.cn                |
| Candor Circuit Boards (Sunny) | PCB fabricator         | No                         | sunny@candorcircuitboards.com |
| Stentech (Markham, Prakash)   | Stencil supplier       | No                         | markham@stentech.com          |
| PCBWay                        | PCB fabricator (alt)   | No                         | service19@pcbway.com          |
| Bisco Industries              | Mechanical/hardware    | No                         | —                             |

---

## ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://leynvlptisjjykfndjme.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>

# FastAPI Python Service
FASTAPI_URL=https://erp-rs-python.railway.app  # or wherever deployed

# DigiKey API V4
DIGIKEY_CLIENT_ID=<from developer.digikey.com>
DIGIKEY_CLIENT_SECRET=<secret>

# Mouser API
MOUSER_API_KEY=<from mouser.com/api-hub>

# LCSC (if available)
LCSC_API_KEY=<if available>
```

---

## WHAT SUCCESS LOOKS LIKE

**Week 2:** Anas logs in, sees all customers, can browse customer details.
**Week 4:** Upload any customer's BOM → parsed correctly → M-Codes assigned → human review queue works.
**Week 6:** Full quote generated with 4 tiers → PDF matches current format → downloadable → emailable.
**Week 8:** Complete lifecycle: RFQ → Quote → PO → Procurement → Production → Ship → Invoice → Payment tracked.

**The North Star metric:** Quote turnaround drops from **2 hours to 15 minutes**. Everything else is supporting infrastructure for that goal.

---

## REFERENCE DOCUMENTS IN THIS FOLDER

| File                                                              | What It Contains                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `01 - PAIN POINTS - What Nobody Is Saying Aloud.md`               | 16 pain points with n8n solution mapping                                        |
| `05 - M CODES AND BG FEEDERS - Technical Analysis.md`             | M-Code types, 31+ solver rules, BG feeder system                                |
| `07 - ABDUL ONBOARDING - Learning the RS System Top to Bottom.md` | 1900-line field notes covering all vocabulary, workflows, file formats          |
| `CLAUDE_CODE_SYSTEM_CONTEXT.md`                                   | Original Feb 2026 spec (quoting system focus, 47 PAR rules, database schema v1) |
| `RS_PCB_ERP_DataFlow_Architecture.html`                           | Interactive visualization of 8-phase data flow + 22 entity schemas              |
| `MCode_System_Cracked.pdf`                                        | 16-page M-Code technical breakdown with decision trees                          |

**This file (CLAUDE_CODE.md) supersedes CLAUDE_CODE_SYSTEM_CONTEXT.md.** Use this as the primary reference. The older doc has useful detail on the 47 PAR rules and CPC type detection that should still be referenced.

---

## MCP SERVER — AI-NATIVE INTEGRATION LAYER

### Why This Matters

The RS web app must be **AI-pluggable from day one.** Any AI — Claude, OpenClaw, GPT, or any future model — should be able to connect to RS's system via MCP (Model Context Protocol) and immediately understand the full business context: customers, BOMs, quotes, jobs, production status, invoices. No re-explaining. No copy-pasting context. The AI plugs in, calls tools, and operates.

This is not a "nice to have" bolt-on. It's a core architectural requirement. The MCP server is built as part of the app, not added later.

### What MCP Gives RS

1. **Anas opens Claude/any AI** → it already knows every customer, every active job, every open quote, every unpaid invoice. Zero context-building.
2. **Piyush asks AI about procurement** → AI queries live PROC data, checks supplier PO status, identifies backorders, suggests alternatives.
3. **Any new AI tool** (email drafting, scheduling, analytics) → plugs into the same MCP server and has full business context instantly.
4. **Abdul's BLANQ agency** → the MCP server becomes a sellable product. Other EMS shops get the same AI integration.

### MCP Server Architecture

The MCP server runs as a **separate TypeScript service** alongside the Next.js app, using the **MCP TypeScript SDK** with **streamable HTTP transport** (for remote access) and **stdio** (for local Claude Code/CLI use).

```
erp-rs-mcp/                            ← MCP Server (separate package)
├── src/
│   ├── index.ts                        ← Server entry point
│   ├── server.ts                       ← MCP server setup + tool registration
│   ├── tools/
│   │   ├── customers.ts                ← Customer lookup, search, list
│   │   ├── boms.ts                     ← BOM retrieval, component search
│   │   ├── quotes.ts                   ← Quote status, pricing, history
│   │   ├── jobs.ts                     ← Job tracking, status updates
│   │   ├── procurement.ts              ← PROC status, supplier POs, receiving
│   │   ├── production.ts               ← Production events, timeline
│   │   ├── invoices.ts                 ← Invoice status, aging, payments
│   │   ├── components.ts               ← Component lookup, M-Code search
│   │   └── reports.ts                  ← Profitability, capacity, overview
│   ├── auth.ts                         ← Supabase JWT validation
│   ├── db.ts                           ← Supabase client for MCP server
│   └── utils.ts                        ← Formatting, pagination helpers
├── package.json
├── tsconfig.json
└── Dockerfile                          ← Deploy alongside the app
```

### MCP Tools (What an AI Can Do)

Every tool follows MCP best practices: clear naming, typed input/output schemas (Zod), read-only annotations where applicable, pagination support, actionable error messages.

#### Customer Tools

```typescript
// rs_list_customers — List all active customers with summary stats
// Input: { status?: "active" | "inactive" | "all", search?: string }
// Output: [{ code, company_name, contact_name, active_jobs, last_quote_date }]
// Annotation: { readOnlyHint: true }

// rs_get_customer — Full customer detail including BOM config and order history
// Input: { customer_code: string }  // e.g., "TLAN", "LABO"
// Output: { ...customer, recent_quotes: [...], active_jobs: [...], bom_config }
// Annotation: { readOnlyHint: true }
```

#### BOM & Component Tools

```typescript
// rs_search_components — Search component library by MPN, description, or M-Code
// Input: { query: string, m_code?: string, limit?: number }
// Output: [{ mpn, manufacturer, m_code, description, last_price }]
// Annotation: { readOnlyHint: true }

// rs_get_bom — Get full parsed BOM with all component lines and M-Code assignments
// Input: { bom_id: string } OR { gmp_number: string, customer_code: string }
// Output: { bom_info, lines: [{ qty, designator, cpc, mpn, m_code, m_code_confidence }] }
// Annotation: { readOnlyHint: true }

// rs_classify_component — Run M-Code classification on a single component
// Input: { mpn: string, description?: string, package?: string }
// Output: { m_code, confidence, source, reasoning }
// Annotation: { readOnlyHint: true }
```

#### Quote Tools

```typescript
// rs_list_quotes — List quotes with filters
// Input: { status?: string, customer_code?: string, date_from?: string, limit?: number }
// Output: [{ quote_number, customer, gmp, status, total_qty1, issued_at }]
// Annotation: { readOnlyHint: true }

// rs_get_quote — Full quote detail with pricing breakdown per tier
// Input: { quote_id: string } OR { quote_number: string }
// Output: { ...quote, pricing_per_tier, component_count, pdf_url }
// Annotation: { readOnlyHint: true }

// rs_create_quote — Create a new quote from a parsed BOM
// Input: { bom_id: string, quantities: [number, number, number, number], nre?: number }
// Output: { quote_id, quote_number, pricing_preview }
// Annotation: { readOnlyHint: false, destructiveHint: false }

// rs_approve_quote — Move quote from draft/review to sent
// Input: { quote_id: string }
// Output: { status: "sent", pdf_url }
// Annotation: { readOnlyHint: false, destructiveHint: false }
```

#### Job Tools

```typescript
// rs_list_jobs — List active jobs with status
// Input: { status?: string, customer_code?: string }
// Output: [{ job_number, customer, gmp, status, quantity, scheduled_completion }]
// Annotation: { readOnlyHint: true }

// rs_get_job — Full job detail with timeline, procurement status, production events
// Input: { job_id: string } OR { job_number: string }
// Output: { ...job, quote_ref, procurement_status, production_events: [...], documents: [...] }
// Annotation: { readOnlyHint: true }

// rs_update_job_status — Move a job to the next status
// Input: { job_id: string, new_status: string, notes?: string }
// Output: { job_number, old_status, new_status, updated_at }
// Annotation: { readOnlyHint: false, destructiveHint: false }
```

#### Procurement Tools

```typescript
// rs_get_procurement — Full PROC detail with line-by-line status
// Input: { procurement_id: string } OR { proc_code: string }
// Output: { proc_code, job_ref, total_lines, lines_ordered, lines_received, lines: [...] }
// Annotation: { readOnlyHint: true }

// rs_list_backorders — Components on backorder across all active procurements
// Input: {}
// Output: [{ mpn, supplier, qty_ordered, qty_received, shortage, job_number, expected_date }]
// Annotation: { readOnlyHint: true }
```

#### Production Tools

```typescript
// rs_get_production_status — Current production status for a job
// Input: { job_id: string }
// Output: { job_number, current_step, events: [{ type, timestamp, operator }], estimated_completion }
// Annotation: { readOnlyHint: true }

// rs_log_production_event — Log a production step (for shop floor use via AI)
// Input: { job_id: string, event_type: string, notes?: string }
// Output: { event_id, job_number, event_type, timestamp }
// Annotation: { readOnlyHint: false, destructiveHint: false }
```

#### Invoice & Financial Tools

```typescript
// rs_list_invoices — Invoice list with aging info
// Input: { status?: string, customer_code?: string, overdue_only?: boolean }
// Output: [{ invoice_number, customer, total, status, days_outstanding }]
// Annotation: { readOnlyHint: true }

// rs_get_aging_report — Accounts receivable aging summary
// Input: {}
// Output: { total_outstanding, current, over_30, over_60, over_90, by_customer: [...] }
// Annotation: { readOnlyHint: true }

// rs_get_profitability — Quoted vs actual cost comparison for completed jobs
// Input: { job_id?: string, customer_code?: string, date_from?: string }
// Output: { jobs: [{ job_number, quoted_total, actual_cost, margin_pct }], summary }
// Annotation: { readOnlyHint: true }
```

#### Context / Overview Tools

```typescript
// rs_business_overview — High-level snapshot for AI orientation
// Input: {}
// Output: {
//   company: "RS PCB Assembly, Montreal, $2.5M/yr, 5-6 people",
//   active_customers: 11,
//   open_quotes: count,
//   active_jobs: count,
//   jobs_by_status: { created: n, procurement: n, production: n, shipping: n },
//   outstanding_invoices: total_amount,
//   overdue_invoices: count,
//   recent_activity: [last 10 events across all modules]
// }
// Annotation: { readOnlyHint: true }
// NOTE: This is the "orientation" tool. Any AI connecting for the first time calls this
// to understand the current state of the business in one shot.

// rs_search — Universal search across all entities
// Input: { query: string, entity_types?: ["customers", "jobs", "quotes", "components"] }
// Output: [{ type, id, title, summary, relevance_score }]
// Annotation: { readOnlyHint: true }
```

### MCP Auth

The MCP server validates requests using Supabase JWT tokens. When an AI connects:

1. User authenticates with Supabase Auth (same login as the web app)
2. JWT token passed in MCP request headers
3. MCP server validates token against Supabase, extracts user role
4. Tool access filtered by role:
   - **ceo**: All tools available
   - **operations_manager**: All except invoice/financial tools
   - **shop_floor**: Only job read + production event logging

```typescript
// auth.ts
import { createClient } from "@supabase/supabase-js";

export async function validateMCPRequest(token: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  return { userId: user.id, role: profile.role, name: profile.full_name };
}
```

### MCP Transport Options

**For Claude Code / local CLI:**

```bash
# stdio transport — Abdul runs this locally during development
npx erp-rs-mcp --transport stdio
```

**For remote AI access (Claude Desktop, OpenClaw, any MCP client):**

```bash
# Streamable HTTP transport — deployed alongside the app
# Endpoint: https://erp-rs-mcp.railway.app/mcp
```

**For Claude Desktop config (claude_desktop_config.json):**

```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "url": "https://erp-rs-mcp.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <supabase-jwt-token>"
      }
    }
  }
}
```

### MCP Build Timeline

The MCP server is **NOT a separate sprint.** It's built incrementally alongside each sprint:

| Sprint   | MCP Tools Added                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint 1 | `rs_business_overview`, `rs_list_customers`, `rs_get_customer`                                                                                                                                                                          |
| Sprint 2 | `rs_get_bom`, `rs_search_components`, `rs_classify_component`                                                                                                                                                                           |
| Sprint 3 | `rs_list_quotes`, `rs_get_quote`, `rs_create_quote`, `rs_approve_quote`                                                                                                                                                                 |
| Sprint 4 | `rs_list_jobs`, `rs_get_job`, `rs_update_job_status`, `rs_get_procurement`, `rs_list_backorders`, `rs_get_production_status`, `rs_log_production_event`, `rs_list_invoices`, `rs_get_aging_report`, `rs_get_profitability`, `rs_search` |

By week 8, the full MCP server is live with ~20 tools. Any AI that connects gets complete RS business context instantly.

### Why This Is a Competitive Advantage

No other small EMS shop has this. The big ERPs (Epicor, Syteline) don't have MCP servers. CalcuQuote doesn't have one. This makes RS the first AI-native PCB assembly company — and when Abdul packages this for BLANQ, it's a selling point that no competitor can match.
