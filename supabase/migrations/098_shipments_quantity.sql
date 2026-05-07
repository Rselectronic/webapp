-- ============================================================================
-- 098_shipments_quantity.sql
--
-- Partial-shipment support. A job (e.g. 100 boards) may be split into any
-- number of partial shipments (20 + 30 + 50, etc.). Today every shipment
-- implicitly covered the full job — wrong. Add a `quantity` column on
-- shipments so we can track how many boards are on each one and decide
-- whether the job is fully shipped by summing across rows.
-- ============================================================================

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- Backfill: any pre-existing shipment row covered the full job, so set its
-- quantity to the job's quantity. This is the only sane historical mapping.
UPDATE public.shipments s
   SET quantity = j.quantity
  FROM public.jobs j
 WHERE s.job_id = j.id
   AND s.quantity IS NULL;

-- Now lock it down.
ALTER TABLE public.shipments
  ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_quantity_check;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_quantity_check CHECK (quantity > 0);

COMMENT ON COLUMN public.shipments.quantity IS
  'Number of boards in this shipment. Sum across a job''s shipments determines whether the job is fully shipped.';
