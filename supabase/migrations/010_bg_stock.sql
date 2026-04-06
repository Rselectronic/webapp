-- ============================================
-- BG (Background) Feeder Stock Management
-- Common passives permanently loaded on SMT feeders
-- ============================================

CREATE TABLE public.bg_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  description TEXT,
  m_code TEXT,
  current_qty INT NOT NULL DEFAULT 0,
  min_qty INT DEFAULT 0,
  feeder_slot TEXT,
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mpn)
);

CREATE TABLE public.bg_stock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bg_stock_id UUID NOT NULL REFERENCES public.bg_stock(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('addition', 'subtraction', 'adjustment', 'physical_count')),
  quantity_change INT NOT NULL,
  quantity_after INT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE INDEX idx_bg_stock_mpn ON public.bg_stock(mpn);
CREATE INDEX idx_bg_log_stock ON public.bg_stock_log(bg_stock_id);

ALTER TABLE public.bg_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bg_stock_log ENABLE ROW LEVEL SECURITY;

-- CEO full access to BG stock
CREATE POLICY bg_stock_ceo_all ON public.bg_stock FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

CREATE POLICY bg_stock_log_ceo_all ON public.bg_stock_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations manager can read and manage BG stock
CREATE POLICY bg_stock_ops_select ON public.bg_stock FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY bg_stock_ops_insert ON public.bg_stock FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY bg_stock_ops_update ON public.bg_stock FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY bg_stock_log_ops_select ON public.bg_stock_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY bg_stock_log_ops_insert ON public.bg_stock_log FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Shop floor can view BG stock (read-only)
CREATE POLICY bg_stock_shop_floor_read ON public.bg_stock FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shop_floor')
);
