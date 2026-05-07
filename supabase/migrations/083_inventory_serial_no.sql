-- ============================================================================
-- BG / Safety inventory: serial-number slots + reassignment history.
--
-- Each BG part has a "serial number" that maps to a physical feeder slot on
-- the SMT production floor. The serial is a stable identifier of the SLOT,
-- not the part — when RS revises which CPCs are in BG status, a slot can
-- be reassigned to a different part. We need both:
--
--   1. The current part-to-serial mapping (one active serial per part,
--      and one active part per serial — at any given time).
--   2. The historical record of every assignment so the operator can trace
--      "what was in slot 47 last quarter?".
--
-- Schema:
--   inventory_parts.serial_no — current assignment (nullable). A partial
--     unique index keeps each serial_no unique across active rows; a part
--     can have at most one serial_no at a time.
--   inventory_serial_history — append-only assignment log. Each row spans
--     [assigned_at, unassigned_at]. unassigned_at NULL = currently open.
--     The application layer (or a trigger, optional) closes the previous
--     assignment when serial_no changes.
-- ============================================================================

ALTER TABLE public.inventory_parts
  ADD COLUMN IF NOT EXISTS serial_no TEXT;

-- Partial unique: only enforce uniqueness on rows that currently have a
-- serial. NULLs are unconstrained, so deassigning a part frees the slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_parts_serial_no_unique
  ON public.inventory_parts(serial_no)
  WHERE serial_no IS NOT NULL;

COMMENT ON COLUMN public.inventory_parts.serial_no IS
  'Production-floor BG slot identifier. Stable across part revisions — when a part is removed from BG, this clears and the slot can be reassigned to another CPC. See inventory_serial_history for the audit trail.';

-- Audit trail. One row per assignment. unassigned_at NULL means the
-- assignment is currently open. Querying `WHERE unassigned_at IS NULL`
-- yields every active slot mapping.
CREATE TABLE IF NOT EXISTS public.inventory_serial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_no TEXT NOT NULL,
  inventory_part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES public.users(id),
  unassigned_at TIMESTAMPTZ,
  unassigned_by UUID REFERENCES public.users(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_serial_history_serial
  ON public.inventory_serial_history(serial_no, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_serial_history_part
  ON public.inventory_serial_history(inventory_part_id, assigned_at DESC);
-- Only one OPEN history row per (serial_no) and per (inventory_part_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_serial_history_one_open_serial
  ON public.inventory_serial_history(serial_no)
  WHERE unassigned_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_serial_history_one_open_part
  ON public.inventory_serial_history(inventory_part_id)
  WHERE unassigned_at IS NULL;

COMMENT ON TABLE public.inventory_serial_history IS
  'Append-only log of serial-number assignments. Each assignment row spans [assigned_at, unassigned_at]. unassigned_at NULL = currently active. Application layer maintains by closing prior assignments when inventory_parts.serial_no changes.';

ALTER TABLE public.inventory_serial_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_serial_history_ceo ON public.inventory_serial_history
  FOR ALL USING (get_user_role() = 'ceo');
CREATE POLICY inventory_serial_history_ops ON public.inventory_serial_history
  FOR ALL USING (get_user_role() = 'operations_manager');

-- Rebuild the inventory_part_stock view so it includes serial_no. UI list
-- + detail both read from this view; serial belongs in the surface area.
DROP VIEW IF EXISTS public.inventory_part_stock;

CREATE VIEW public.inventory_part_stock AS
SELECT
  ip.id,
  ip.serial_no,
  ip.cpc,
  ip.mpn,
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
