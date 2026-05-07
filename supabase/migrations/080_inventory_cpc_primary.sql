-- ============================================================================
-- Re-key inventory_parts on CPC instead of MPN.
--
-- CPC is the business identity at RS — every BOM is identified by CPC, and
-- when a customer doesn't supply one, the BOM parser fills it from MPN. So
-- CPC is always populated and is the natural matching key against merged BOM
-- rows. MPN can rotate (Yageo → Murata for the same CPC slot) so it must NOT
-- be the primary identifier.
--
-- Tables are empty (verified before running this migration), so we can just
-- drop and recreate constraints.
-- ============================================================================

-- Drop the old unique constraint on mpn (created as a column-level UNIQUE in 079).
ALTER TABLE public.inventory_parts DROP CONSTRAINT inventory_parts_mpn_key;

-- mpn becomes optional; operators may have a CPC slot without a current MPN
-- bound to it, and the field is informational (what's currently in the bin).
ALTER TABLE public.inventory_parts ALTER COLUMN mpn DROP NOT NULL;

-- cpc is now required and unique.
ALTER TABLE public.inventory_parts ALTER COLUMN cpc SET NOT NULL;
ALTER TABLE public.inventory_parts ADD CONSTRAINT inventory_parts_cpc_key UNIQUE (cpc);

-- Drop the old partial index on cpc — it's redundant with the new full unique
-- index. (079 created idx_inventory_parts_cpc as a partial because cpc was
-- nullable then.)
DROP INDEX IF EXISTS idx_inventory_parts_cpc;

-- Rebuild the view so its public column order reflects cpc-first identity.
DROP VIEW IF EXISTS public.inventory_part_stock;

CREATE VIEW public.inventory_part_stock AS
SELECT
  ip.id,
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
