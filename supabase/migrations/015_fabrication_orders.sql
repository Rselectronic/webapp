-- RS PCB Assembly ERP — Stencil & PCB Order Tracking
-- Migration 015: fabrication_orders table

-- ============================================
-- FABRICATION_ORDERS
-- ============================================
CREATE TABLE public.fabrication_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL CHECK (order_type IN ('pcb', 'stencil')),
  supplier TEXT NOT NULL,
  supplier_ref TEXT,                    -- Supplier's reference / order number
  quantity INT NOT NULL DEFAULT 1,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'ordered' CHECK (status IN ('ordered', 'in_production', 'shipped', 'received')),
  ordered_date DATE,
  expected_date DATE,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- Indexes
CREATE INDEX idx_fabrication_orders_job ON public.fabrication_orders(job_id);
CREATE INDEX idx_fabrication_orders_type ON public.fabrication_orders(order_type);
CREATE INDEX idx_fabrication_orders_status ON public.fabrication_orders(status);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.fabrication_orders ENABLE ROW LEVEL SECURITY;

-- CEO: full access
CREATE POLICY fabrication_orders_ceo_all ON public.fabrication_orders
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: full CRUD
CREATE POLICY fabrication_orders_ops_select ON public.fabrication_orders
  FOR SELECT
  USING (public.get_user_role() = 'operations_manager');

CREATE POLICY fabrication_orders_ops_insert ON public.fabrication_orders
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'operations_manager');

CREATE POLICY fabrication_orders_ops_update ON public.fabrication_orders
  FOR UPDATE
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

CREATE POLICY fabrication_orders_ops_delete ON public.fabrication_orders
  FOR DELETE
  USING (public.get_user_role() = 'operations_manager');

-- Shop Floor: read only
CREATE POLICY fabrication_orders_shop_floor_select ON public.fabrication_orders
  FOR SELECT
  USING (public.get_user_role() = 'shop_floor');
