-- ============================================================================
-- BG / Safety stock inventory.
--
-- Three tables + a view:
--   inventory_parts        — one row per stocked MPN (bg or safety pool)
--   inventory_movements    — append-only ledger of every physical change
--   inventory_allocations  — reservations against a PROC (no physical effect
--                             until status flips to 'consumed')
--   inventory_part_stock   — view exposing physical / reserved / available
--
-- Design notes:
--   • physical_qty = SUM(movements.delta).
--   • reserved_qty = SUM(allocations.qty_allocated) WHERE status='reserved'.
--   • available_qty = physical_qty − reserved_qty.
--   • Allocations DO NOT touch the ledger — they're soft holds. Only when
--     the PROC's first production_event fires do we (a) flip the allocation
--     to 'consumed' and (b) write a matching negative movement. This is
--     critical: PROCs sit allocated for 2-3 weeks before parts physically
--     leave the shelf, and the operator needs both numbers visible.
--   • One reservation per (part, PROC) at a time — partial unique index.
-- ============================================================================

CREATE TABLE public.inventory_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpn TEXT UNIQUE NOT NULL,
  manufacturer TEXT,
  description TEXT,
  cpc TEXT,
  pool TEXT NOT NULL CHECK (pool IN ('bg', 'safety')),
  -- Operator-set red-flag threshold. NULL = no alert.
  min_stock_threshold INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);
CREATE INDEX idx_inventory_parts_pool ON public.inventory_parts(pool);
CREATE INDEX idx_inventory_parts_cpc ON public.inventory_parts(cpc) WHERE cpc IS NOT NULL;
CREATE INDEX idx_inventory_parts_active ON public.inventory_parts(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE public.inventory_parts IS
  'Master list of parts RS keeps in physical stock. pool=bg for tape-and-reel parts loaded in SMT feeders, pool=safety for hard-to-source parts kept on hand.';

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE RESTRICT,
  -- Signed: +500 for a buy, -200 for a build consumption, etc. Never zero.
  delta INT NOT NULL CHECK (delta != 0),
  kind TEXT NOT NULL CHECK (kind IN (
    'buy_for_proc',     -- bought specifically for a PROC's shortfall
    'buy_external',     -- bought without a PROC attached (operator standing order)
    'consume_proc',     -- production consumed against a PROC's reservation
    'manual_adjust',    -- operator-corrected count (cycle count, found extra, etc.)
    'safety_topup',     -- intentional over-buy added to safety pool
    'initial_stock'     -- imported from the BG/SS Excel — not a real buy event
  )),
  proc_id UUID REFERENCES public.procurements(id),
  po_id UUID REFERENCES public.supplier_pos(id),
  job_id UUID REFERENCES public.jobs(id),
  -- Snapshot the before/after totals on each movement so audit reads don't
  -- need to re-aggregate. Cheap and bulletproof.
  qty_before INT NOT NULL,
  qty_after INT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inventory_movements_part ON public.inventory_movements(inventory_part_id, created_at DESC);
CREATE INDEX idx_inventory_movements_proc ON public.inventory_movements(proc_id) WHERE proc_id IS NOT NULL;

COMMENT ON TABLE public.inventory_movements IS
  'Append-only ledger of every physical stock change. Sum of delta = physical_qty.';

CREATE TABLE public.inventory_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE CASCADE,
  procurement_id UUID NOT NULL REFERENCES public.procurements(id) ON DELETE CASCADE,
  qty_allocated INT NOT NULL CHECK (qty_allocated > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id)
);
CREATE INDEX idx_inventory_allocations_part ON public.inventory_allocations(inventory_part_id);
CREATE INDEX idx_inventory_allocations_proc ON public.inventory_allocations(procurement_id);
-- Only one OPEN reservation per (part, PROC). consumed/released rows are
-- historical and don't conflict with a fresh reserve.
CREATE UNIQUE INDEX idx_inventory_allocations_one_reserved
  ON public.inventory_allocations(inventory_part_id, procurement_id)
  WHERE status = 'reserved';

COMMENT ON TABLE public.inventory_allocations IS
  'Soft holds against future PROC consumption. Reservations DO NOT change physical stock — they only reduce available_qty. The matching consume_proc movement is written when the allocation flips to consumed.';

-- View: per-part stock totals. UI reads from this so it never has to do
-- the aggregation client-side.
CREATE VIEW public.inventory_part_stock AS
SELECT
  ip.id,
  ip.mpn,
  ip.cpc,
  ip.manufacturer,
  ip.description,
  ip.pool,
  ip.min_stock_threshold,
  ip.is_active,
  ip.notes,
  ip.created_at,
  ip.updated_at,
  COALESCE(
    (SELECT SUM(im.delta) FROM public.inventory_movements im
      WHERE im.inventory_part_id = ip.id),
    0
  ) AS physical_qty,
  COALESCE(
    (SELECT SUM(ia.qty_allocated) FROM public.inventory_allocations ia
      WHERE ia.inventory_part_id = ip.id AND ia.status = 'reserved'),
    0
  ) AS reserved_qty,
  COALESCE(
    (SELECT SUM(im.delta) FROM public.inventory_movements im
      WHERE im.inventory_part_id = ip.id),
    0
  )
  -
  COALESCE(
    (SELECT SUM(ia.qty_allocated) FROM public.inventory_allocations ia
      WHERE ia.inventory_part_id = ip.id AND ia.status = 'reserved'),
    0
  ) AS available_qty
FROM public.inventory_parts ip;

-- RLS — match existing tables (ceo + operations_manager full access).
ALTER TABLE public.inventory_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_parts_ceo ON public.inventory_parts
  FOR ALL USING (get_user_role() = 'ceo');
CREATE POLICY inventory_parts_ops ON public.inventory_parts
  FOR ALL USING (get_user_role() = 'operations_manager');

CREATE POLICY inventory_movements_ceo ON public.inventory_movements
  FOR ALL USING (get_user_role() = 'ceo');
CREATE POLICY inventory_movements_ops ON public.inventory_movements
  FOR ALL USING (get_user_role() = 'operations_manager');

CREATE POLICY inventory_allocations_ceo ON public.inventory_allocations
  FOR ALL USING (get_user_role() = 'ceo');
CREATE POLICY inventory_allocations_ops ON public.inventory_allocations
  FOR ALL USING (get_user_role() = 'operations_manager');
