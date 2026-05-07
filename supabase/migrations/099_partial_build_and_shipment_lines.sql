-- ============================================================================
-- 099_partial_build_and_shipment_lines.sql
--
-- Two coupled changes:
--   1. jobs.ready_to_ship_qty — number of boards production has released
--      from the floor to the shipping area. Operator-controlled, monotonic
--      in normal flow. Used to auto-advance status production/inspection
--      → shipping when ready_to_ship_qty == jobs.quantity.
--
--   2. shipment_lines — break the 1:1 jobs↔shipments relationship. One
--      physical shipment (one tracking number, one carrier, one customer)
--      may carry boards from any number of jobs at varying quantities.
--      shipments.job_id and shipments.quantity are dropped; lines moved
--      into shipment_lines.
--
-- Order of operations is important: we add new structures, backfill from
-- the old structures, then drop the old. Idempotent where possible.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. jobs.ready_to_ship_qty
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS ready_to_ship_qty INTEGER NOT NULL DEFAULT 0;

-- CHECK constraints can reference other columns of the same row, so this is fine.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_ready_to_ship_qty_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_ready_to_ship_qty_check
    CHECK (ready_to_ship_qty >= 0 AND ready_to_ship_qty <= quantity);

-- Backfill: any job already past production was implicitly fully released.
UPDATE public.jobs
   SET ready_to_ship_qty = quantity
 WHERE status IN ('shipping', 'delivered', 'invoiced', 'archived');

COMMENT ON COLUMN public.jobs.ready_to_ship_qty IS
  'Number of boards production has released to the shipping area. When equal to quantity, status auto-advances to shipping.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. shipments.customer_id (denormalised for multi-job shipments — a single
--    shipment is always to one customer; the join through shipment_lines →
--    jobs would otherwise be needed every time).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

UPDATE public.shipments s
   SET customer_id = j.customer_id
  FROM public.jobs j
 WHERE s.job_id = j.id
   AND s.customer_id IS NULL;

ALTER TABLE public.shipments
  ALTER COLUMN customer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_customer ON public.shipments(customer_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. shipment_lines
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_lines_shipment ON public.shipment_lines(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_lines_job ON public.shipment_lines(job_id);

-- Backfill: one line per existing shipment carrying its current job_id+quantity.
INSERT INTO public.shipment_lines (shipment_id, job_id, quantity)
SELECT s.id, s.job_id, s.quantity
  FROM public.shipments s
 WHERE NOT EXISTS (
    SELECT 1 FROM public.shipment_lines sl WHERE sl.shipment_id = s.id
 );

-- RLS: mirror shipments. Production runs the shipping desk in this shop, so
-- they get full access alongside admins.
ALTER TABLE public.shipment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipment_lines_admin_all ON public.shipment_lines;
CREATE POLICY shipment_lines_admin_all
  ON public.shipment_lines
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS shipment_lines_production_all ON public.shipment_lines;
CREATE POLICY shipment_lines_production_all
  ON public.shipment_lines
  FOR ALL
  USING (is_production())
  WITH CHECK (is_production());

COMMENT ON TABLE public.shipment_lines IS
  'Per-job line items on a shipment. A shipment carries 1..N jobs; sum of shipment_lines.quantity per job determines fully-shipped state.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Drop legacy columns from shipments now that data has moved.
-- ────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_shipments_job;

ALTER TABLE public.shipments DROP COLUMN IF EXISTS job_id;
ALTER TABLE public.shipments DROP COLUMN IF EXISTS quantity;

COMMENT ON COLUMN public.shipments.shipping_cost IS
  'Carrier cost for this shipment (one tracking number = one cost). Allocate per-job downstream if needed.';
