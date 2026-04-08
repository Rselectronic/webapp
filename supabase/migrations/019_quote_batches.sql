-- ============================================
-- 019: QUOTE BATCHES — The Merge-Split Data Model
-- ============================================
-- This is the MasterSheet equivalent. It groups multiple BOMs/GMPs
-- for shared operations: M-code assignment, extras calculation,
-- API pricing, and quote generation.
--
-- The merge-split pattern happens TWICE in the order lifecycle:
--   1. Quoting: merge to price components across all boards, split to generate individual quotes
--   2. Procurement: merge again via Proc Batch Code to order material together
--
-- This migration covers the QUOTING merge-split (cycle 1).
-- Procurement merge-split uses the existing procurements table with proc_code.

-- ============================================
-- QUOTE_BATCHES — Groups multiple BOMs for shared quoting operations
-- Equivalent to: DM File's DataInputSheets + MasterSheet activation
-- ============================================
CREATE TABLE IF NOT EXISTS public.quote_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Batch identity
  batch_name TEXT NOT NULL,                -- Human-readable name, e.g. "ISC April 2026 RFQ"
  customer_id UUID NOT NULL REFERENCES public.customers(id),

  -- Workflow state — each step is an explicit user action (BUILD_PROMPT.md §2.3, §2.5)
  -- No auto-advancing. Each transition requires a button click.
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',           -- BOMs added but not yet merged
    'merged',            -- Components deduplicated across boards (MasterSheet built)
    'mcodes_assigned',   -- M-codes assigned (auto + human review done)
    'extras_calculated', -- Extras per M-code calculated, order quantities set
    'priced',            -- API pricing completed (DigiKey/Mouser/LCSC)
    'sent_back',         -- Data pushed back to individual boards
    'quotes_generated',  -- Individual quotes created from this batch
    'archived'           -- Done, no longer active
  )),

  -- 4 quantity tiers — flow through the entire system
  -- These are the QTY #1 through QTY #4 from DataInputSheets
  qty_1 INT,          -- e.g. 50
  qty_2 INT,          -- e.g. 100
  qty_3 INT,          -- e.g. 250
  qty_4 INT,          -- e.g. 500

  -- Pricing config (from app_settings, overridable per batch)
  component_markup_pct DECIMAL(5,2) DEFAULT 20.00,
  pcb_markup_pct DECIMAL(5,2) DEFAULT 30.00,
  smt_cost_per_placement DECIMAL(7,4) DEFAULT 0.35,
  th_cost_per_placement DECIMAL(7,4) DEFAULT 0.75,
  nre_charge DECIMAL(10,2) DEFAULT 350.00,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- ============================================
-- QUOTE_BATCH_BOMS — Which BOMs are in this batch
-- Equivalent to: DataInputSheets rows (S.No, Customer, GMP, Active Qty)
-- ============================================
CREATE TABLE IF NOT EXISTS public.quote_batch_boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.quote_batches(id) ON DELETE CASCADE,
  bom_id UUID NOT NULL REFERENCES public.boms(id),
  gmp_id UUID NOT NULL REFERENCES public.gmps(id),

  -- Per-board activation (Active Qty in DataInputSheets)
  is_active BOOLEAN DEFAULT TRUE,
  board_letter TEXT,                       -- "A", "B", "C" — assigned when batch is created

  -- Per-board PCB cost (different boards may have different PCB costs)
  pcb_cost_per_unit DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, bom_id)
);

-- ============================================
-- QUOTE_BATCH_LINES — The merged, deduplicated component list
-- Equivalent to: MasterSheet rows (columns A-N)
-- This is where ALL the downstream data lives:
--   - Cross-board quantities (X Quant)
--   - M-codes (auto + human override)
--   - Extras calculation
--   - Order quantities
--   - API pricing results per tier
-- ============================================
CREATE TABLE IF NOT EXISTS public.quote_batch_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.quote_batches(id) ON DELETE CASCADE,
  line_number INT NOT NULL,

  -- Component identity (from merged BOM lines)
  mpn TEXT NOT NULL,                       -- Manufacturer Part Number (merge key)
  cpc TEXT,                                -- Customer Part Code (from first occurrence)
  description TEXT,
  manufacturer TEXT,

  -- Cross-board quantity tracking
  -- "Qty and Board" — how many of this component across all boards in the batch
  bom_qty INT NOT NULL DEFAULT 0,          -- Total BOM quantity across all boards
  board_refs TEXT,                          -- Which boards use this: "A:4, B:2, C:4" (board_letter:qty)
  reference_designators TEXT,              -- Combined designators across all boards

  -- M-Code assignment (Step 4-5 in the 11-button sequence)
  -- Assigned AFTER merge, not during upload
  m_code TEXT,                             -- Auto-assigned M-code
  m_code_confidence DECIMAL(3,2),          -- 0.00-1.00
  m_code_source TEXT CHECK (m_code_source IN ('database', 'rules', 'api', 'manual', NULL)),
  m_code_override TEXT,                    -- Human override (Piyush corrects the auto-assignment)
  m_code_final TEXT,                       -- = COALESCE(m_code_override, m_code) — the one that's used downstream

  -- Extras calculation (Step 6: "Get Final Qty")
  -- Different M-codes get different extras because fallout rates differ
  extras INT DEFAULT 0,                    -- Absolute extra parts (from overage_table)

  -- Order quantities per tier (BOM qty × board qty + extras)
  -- These are what the API prices, NOT the raw BOM quantities
  order_qty_1 INT,                         -- For qty_1 tier
  order_qty_2 INT,                         -- For qty_2 tier
  order_qty_3 INT,                         -- For qty_3 tier
  order_qty_4 INT,                         -- For qty_4 tier

  -- API pricing results per tier (Step 9: "Get Stock & Price")
  -- Stored per-tier because volume discounts change the unit price
  unit_price_1 DECIMAL(10,4),              -- Unit price at qty_1 order volume
  unit_price_2 DECIMAL(10,4),
  unit_price_3 DECIMAL(10,4),
  unit_price_4 DECIMAL(10,4),
  extended_price_1 DECIMAL(12,2),          -- unit_price × order_qty
  extended_price_2 DECIMAL(12,2),
  extended_price_3 DECIMAL(12,2),
  extended_price_4 DECIMAL(12,2),

  -- Supplier info (from API response)
  supplier TEXT,                           -- "DigiKey", "Mouser", "LCSC" — best price wins
  supplier_pn TEXT,                        -- Supplier's part number
  stock_qty INT,                           -- Available stock from supplier
  pricing_source TEXT,                     -- "digikey", "mouser", "lcsc", "manual"
  pricing_fetched_at TIMESTAMPTZ,          -- When the price was fetched

  -- BG Stock (background/feeder stock already in inventory)
  is_bg BOOLEAN DEFAULT FALSE,             -- Is this from BG stock?
  bg_qty_available INT DEFAULT 0,          -- How many we have in stock

  -- Flags
  is_pcb BOOLEAN DEFAULT FALSE,
  needs_review BOOLEAN DEFAULT FALSE,      -- Flagged for human attention
  review_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(batch_id, line_number)
);

-- ============================================
-- QUOTE_BATCH_LOG — Immutable audit trail for batch operations
-- Tracks every step transition so we know who did what when
-- ============================================
CREATE TABLE IF NOT EXISTS public.quote_batch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.quote_batches(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                    -- 'created', 'bom_added', 'merged', 'mcodes_assigned', 'mcodes_overridden', 'extras_calculated', 'pricing_started', 'pricing_completed', 'sent_back', 'quotes_generated'
  old_status TEXT,
  new_status TEXT,
  details JSONB,                           -- Action-specific data (e.g. how many M-codes assigned, API call count)
  performed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_quote_batches_customer ON public.quote_batches(customer_id);
CREATE INDEX idx_quote_batches_status ON public.quote_batches(status);
CREATE INDEX idx_quote_batch_boms_batch ON public.quote_batch_boms(batch_id);
CREATE INDEX idx_quote_batch_lines_batch ON public.quote_batch_lines(batch_id);
CREATE INDEX idx_quote_batch_lines_mpn ON public.quote_batch_lines(mpn);
CREATE INDEX idx_quote_batch_log_batch ON public.quote_batch_log(batch_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.quote_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_batch_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_batch_log ENABLE ROW LEVEL SECURITY;

-- CEO sees everything
CREATE POLICY ceo_all_quote_batches ON public.quote_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_quote_batch_boms ON public.quote_batch_boms FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_quote_batch_lines ON public.quote_batch_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_quote_batch_log ON public.quote_batch_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations Manager can read and write operational data
CREATE POLICY ops_quote_batches ON public.quote_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_quote_batch_boms ON public.quote_batch_boms FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_quote_batch_lines ON public.quote_batch_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_quote_batch_log ON public.quote_batch_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Add quote_batch_id to quotes table so we know which batch generated each quote
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_batch_id UUID REFERENCES public.quote_batches(id);
