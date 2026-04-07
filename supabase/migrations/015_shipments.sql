-- RS PCB Assembly ERP — Shipment Tracking
-- Migration 014: shipments table

-- ============================================
-- SHIPMENTS
-- ============================================
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL CHECK (carrier IN ('FedEx', 'Purolator', 'UPS', 'Canada Post', 'Other')),
  tracking_number TEXT,
  ship_date DATE,
  estimated_delivery DATE,
  actual_delivery DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'in_transit', 'delivered')),
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- Indexes
CREATE INDEX idx_shipments_job ON public.shipments(job_id);
CREATE INDEX idx_shipments_status ON public.shipments(status);
CREATE INDEX idx_shipments_carrier ON public.shipments(carrier);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- CEO: full access
CREATE POLICY shipments_ceo_all ON public.shipments
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: full CRUD
CREATE POLICY shipments_ops_select ON public.shipments
  FOR SELECT
  USING (public.get_user_role() = 'operations_manager');

CREATE POLICY shipments_ops_insert ON public.shipments
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'operations_manager');

CREATE POLICY shipments_ops_update ON public.shipments
  FOR UPDATE
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

CREATE POLICY shipments_ops_delete ON public.shipments
  FOR DELETE
  USING (public.get_user_role() = 'operations_manager');

-- Shop Floor: read only
CREATE POLICY shipments_shop_floor_select ON public.shipments
  FOR SELECT
  USING (public.get_user_role() = 'shop_floor');
