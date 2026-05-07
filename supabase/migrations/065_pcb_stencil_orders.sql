-- ============================================
-- 065: pcb_orders + stencil_orders
-- ============================================
-- Records externally-placed PCB and stencil orders so we can trace which
-- PROC Batch they belong to. Operators place orders manually (email / web);
-- these tables just log what was ordered + when received.

CREATE TABLE IF NOT EXISTS public.pcb_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  gmp_id UUID REFERENCES public.gmps(id),
  supplier TEXT NOT NULL,
  external_order_id TEXT,
  quantity INT NOT NULL,
  unit_price NUMERIC(10,4),
  total_price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  ordered_date DATE,
  expected_arrival DATE,
  received_date DATE,
  status TEXT DEFAULT 'ordered'
    CHECK (status IN ('ordered','shipped','received','cancelled')),
  notes TEXT,
  invoice_file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.stencil_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  external_order_id TEXT,
  stencil_type TEXT,
  is_merged BOOLEAN DEFAULT FALSE,
  covered_gmp_ids UUID[] DEFAULT '{}',
  quantity INT DEFAULT 1,
  unit_price NUMERIC(10,4),
  total_price NUMERIC(12,2),
  currency TEXT DEFAULT 'CAD',
  ordered_date DATE,
  expected_arrival DATE,
  received_date DATE,
  status TEXT DEFAULT 'ordered'
    CHECK (status IN ('ordered','shipped','received','cancelled')),
  notes TEXT,
  invoice_file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pcb_orders_procurement
  ON public.pcb_orders(procurement_id);
CREATE INDEX IF NOT EXISTS idx_stencil_orders_procurement
  ON public.stencil_orders(procurement_id);

ALTER TABLE public.pcb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stencil_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcb_orders_ceo_ops ON public.pcb_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')));

CREATE POLICY stencil_orders_ceo_ops ON public.stencil_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')));

-- ============================================
-- Table + column comments
-- ============================================

COMMENT ON TABLE public.pcb_orders IS 'Log of externally-placed PCB fabrication orders tied to a PROC Batch.';

COMMENT ON COLUMN public.pcb_orders.id IS 'Primary key UUID for the PCB order record.';
COMMENT ON COLUMN public.pcb_orders.procurement_id IS 'PROC Batch this PCB order belongs to.';
COMMENT ON COLUMN public.pcb_orders.gmp_id IS 'GMP (board definition) this PCB order is for.';
COMMENT ON COLUMN public.pcb_orders.supplier IS 'PCB fabricator name (e.g., WMD, Candor, PCBWay).';
COMMENT ON COLUMN public.pcb_orders.external_order_id IS 'Supplier-side order/reference number for cross-lookup.';
COMMENT ON COLUMN public.pcb_orders.quantity IS 'Number of boards ordered.';
COMMENT ON COLUMN public.pcb_orders.unit_price IS 'Price per board in the order currency.';
COMMENT ON COLUMN public.pcb_orders.total_price IS 'Total order value in the order currency.';
COMMENT ON COLUMN public.pcb_orders.currency IS 'ISO currency code for unit/total price (default USD).';
COMMENT ON COLUMN public.pcb_orders.ordered_date IS 'Date the order was placed with the supplier.';
COMMENT ON COLUMN public.pcb_orders.expected_arrival IS 'Supplier-promised arrival date.';
COMMENT ON COLUMN public.pcb_orders.received_date IS 'Date the boards were received at RS.';
COMMENT ON COLUMN public.pcb_orders.status IS 'Order lifecycle state: ordered, shipped, received, cancelled.';
COMMENT ON COLUMN public.pcb_orders.notes IS 'Free-text notes about the order.';
COMMENT ON COLUMN public.pcb_orders.invoice_file_path IS 'Supabase Storage path to the supplier invoice PDF.';
COMMENT ON COLUMN public.pcb_orders.created_at IS 'Timestamp the record was created.';
COMMENT ON COLUMN public.pcb_orders.updated_at IS 'Timestamp the record was last updated.';
COMMENT ON COLUMN public.pcb_orders.created_by IS 'User who created the PCB order record.';

COMMENT ON TABLE public.stencil_orders IS 'Log of externally-placed stencil orders tied to a PROC Batch; supports merged multi-GMP stencils.';

COMMENT ON COLUMN public.stencil_orders.id IS 'Primary key UUID for the stencil order record.';
COMMENT ON COLUMN public.stencil_orders.procurement_id IS 'PROC Batch this stencil order belongs to.';
COMMENT ON COLUMN public.stencil_orders.supplier IS 'Stencil supplier name (e.g., Stentech).';
COMMENT ON COLUMN public.stencil_orders.external_order_id IS 'Supplier-side order/reference number for cross-lookup.';
COMMENT ON COLUMN public.stencil_orders.stencil_type IS 'Stencil type/spec (e.g., framed, frameless, thickness).';
COMMENT ON COLUMN public.stencil_orders.is_merged IS 'True if this stencil covers multiple GMPs on one sheet.';
COMMENT ON COLUMN public.stencil_orders.covered_gmp_ids IS 'Array of GMP IDs covered by this stencil (for merged stencils).';
COMMENT ON COLUMN public.stencil_orders.quantity IS 'Number of stencils ordered.';
COMMENT ON COLUMN public.stencil_orders.unit_price IS 'Price per stencil in the order currency.';
COMMENT ON COLUMN public.stencil_orders.total_price IS 'Total order value in the order currency.';
COMMENT ON COLUMN public.stencil_orders.currency IS 'ISO currency code for unit/total price (default CAD).';
COMMENT ON COLUMN public.stencil_orders.ordered_date IS 'Date the order was placed with the supplier.';
COMMENT ON COLUMN public.stencil_orders.expected_arrival IS 'Supplier-promised arrival date.';
COMMENT ON COLUMN public.stencil_orders.received_date IS 'Date the stencil was received at RS.';
COMMENT ON COLUMN public.stencil_orders.status IS 'Order lifecycle state: ordered, shipped, received, cancelled.';
COMMENT ON COLUMN public.stencil_orders.notes IS 'Free-text notes about the order.';
COMMENT ON COLUMN public.stencil_orders.invoice_file_path IS 'Supabase Storage path to the supplier invoice PDF.';
COMMENT ON COLUMN public.stencil_orders.created_at IS 'Timestamp the record was created.';
COMMENT ON COLUMN public.stencil_orders.updated_at IS 'Timestamp the record was last updated.';
COMMENT ON COLUMN public.stencil_orders.created_by IS 'User who created the stencil order record.';
