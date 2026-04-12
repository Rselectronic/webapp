-- ============================================
-- 020: PROCUREMENT BATCHES — The Second Merge-Split Cycle
-- ============================================
-- This is the PROCUREMENT merge-split (cycle 2).
--
-- After quotes are accepted and POs received, components from multiple
-- jobs/procurements need to be consolidated again at ORDER quantities
-- (not BOM quantities), with overage recalculated at combined volumes.
--
-- This is cost-saving: ordering 500 of a component once is cheaper
-- than 5 orders of 100. The proc batch code is a physical-world
-- grouping — components arrive in the same boxes.
--
-- See BUILD_PROMPT.md §2.1 (merge-split pattern), §2.4 (proc batch code),
-- §2.6 (API runs twice on purpose).

-- ============================================
-- PROCUREMENT_BATCHES — Groups multiple procurements for batch ordering
-- Equivalent to: Job Queue's "Generate Proc Batch Code" + MasterSheet merge
-- ============================================
CREATE TABLE IF NOT EXISTS public.procurement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Batch identity
  batch_name TEXT NOT NULL,                  -- Human-readable, e.g. "TLAN April 2026 Order"
  proc_batch_code TEXT UNIQUE,               -- SOP format: "YYMMDD CUST-XYNNN" (e.g. "260411 TLAN-TB001")

  -- Workflow state — explicit human actions, no auto-advancing
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',              -- Procurements selected but not yet merged
    'merged',               -- Components deduplicated across procurements
    'extras_calculated',    -- Overage recalculated at combined order quantities
    'suppliers_allocated',  -- Lines grouped by best supplier
    'pos_created',          -- Supplier POs generated
    'receiving',            -- Some items being received
    'split_back',           -- Received quantities distributed back to individual procurements
    'completed',            -- All done
    'archived'              -- No longer active
  )),

  -- Aggregate stats
  total_procurements INT DEFAULT 0,
  total_unique_mpns INT DEFAULT 0,
  total_order_value DECIMAL(12,2) DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- ============================================
-- PROCUREMENT_BATCH_ITEMS — Which procurements are in this batch
-- Equivalent to: Job Queue rows selected for proc batch code generation
-- ============================================
CREATE TABLE IF NOT EXISTS public.procurement_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.procurement_batches(id) ON DELETE CASCADE,
  procurement_id UUID NOT NULL REFERENCES public.procurements(id),
  job_id UUID REFERENCES public.jobs(id),

  -- Board letter assigned when batch is created (A, B, C, ...)
  board_letter TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, procurement_id)
);

-- ============================================
-- PROCUREMENT_BATCH_LINES — Merged, deduplicated component lines
-- Same MPN across multiple procurements → combined into one line
-- with summed quantities and recalculated overage at the combined volume
-- ============================================
CREATE TABLE IF NOT EXISTS public.procurement_batch_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.procurement_batches(id) ON DELETE CASCADE,
  line_number INT NOT NULL,

  -- Component identity (merge key: MPN)
  mpn TEXT NOT NULL,
  cpc TEXT,
  description TEXT,
  manufacturer TEXT,
  m_code TEXT,

  -- Quantity breakdown
  -- individual_qty = sum of qty_needed across all procurements for this MPN
  -- combined_extras = overage recalculated at the COMBINED order quantity
  -- order_qty = individual_qty + combined_extras
  individual_qty INT NOT NULL DEFAULT 0,     -- Sum of qty_needed from all procurements
  original_extras INT NOT NULL DEFAULT 0,    -- Sum of original per-procurement extras
  combined_extras INT NOT NULL DEFAULT 0,    -- Recalculated extras at combined volume (usually LESS)
  extras_savings INT NOT NULL DEFAULT 0,     -- original_extras - combined_extras (positive = savings)
  order_qty INT NOT NULL DEFAULT 0,          -- individual_qty + combined_extras

  -- Which procurements contribute to this line
  -- Format: "A:50, B:100, C:25" (board_letter:qty_needed)
  procurement_refs TEXT,

  -- Source procurement line IDs (for split-back)
  source_line_ids JSONB DEFAULT '[]',        -- Array of procurement_line IDs

  -- Supplier allocation
  supplier TEXT,                             -- "DigiKey", "Mouser", "LCSC", etc.
  supplier_pn TEXT,
  unit_price DECIMAL(10,4),
  extended_price DECIMAL(12,2),
  stock_qty INT,
  pricing_source TEXT,

  -- BG stock
  is_bg BOOLEAN DEFAULT FALSE,
  bg_qty_available INT DEFAULT 0,

  -- Receiving
  qty_ordered INT DEFAULT 0,
  qty_received INT DEFAULT 0,
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN (
    'pending', 'ordered', 'partial_received', 'received', 'backordered'
  )),

  -- PO reference
  supplier_po_id UUID REFERENCES public.supplier_pos(id),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(batch_id, line_number)
);

-- ============================================
-- PROCUREMENT_BATCH_LOG — Immutable audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS public.procurement_batch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.procurement_batches(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  details JSONB,
  performed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_proc_batches_status ON public.procurement_batches(status);
CREATE INDEX idx_proc_batch_items_batch ON public.procurement_batch_items(batch_id);
CREATE INDEX idx_proc_batch_items_procurement ON public.procurement_batch_items(procurement_id);
CREATE INDEX idx_proc_batch_lines_batch ON public.procurement_batch_lines(batch_id);
CREATE INDEX idx_proc_batch_lines_mpn ON public.procurement_batch_lines(mpn);
CREATE INDEX idx_proc_batch_log_batch ON public.procurement_batch_log(batch_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.procurement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_batch_log ENABLE ROW LEVEL SECURITY;

-- CEO sees everything
CREATE POLICY ceo_all_proc_batches ON public.procurement_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_proc_batch_items ON public.procurement_batch_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_proc_batch_lines ON public.procurement_batch_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_proc_batch_log ON public.procurement_batch_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations Manager can read and write
CREATE POLICY ops_proc_batches ON public.procurement_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_proc_batch_items ON public.procurement_batch_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_proc_batch_lines ON public.procurement_batch_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_proc_batch_log ON public.procurement_batch_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Add procurement_batch_id to procurements table
ALTER TABLE public.procurements ADD COLUMN IF NOT EXISTS procurement_batch_id UUID REFERENCES public.procurement_batches(id);
