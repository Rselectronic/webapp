-- ============================================================================
-- 107_invoice_nre_billing.sql
--
-- Bill non-recurring engineering (NRE) as a separate line item on the FIRST
-- invoice for a job, instead of dividing it across the per-unit price of every
-- board.
--
-- Rationale: the NRE charge (stencil + programming + PCB fab setup) is owed
-- the moment the first board ships, regardless of whether the customer
-- accepts the rest in partial shipments. Today the pricing engine bakes NRE
-- into per_unit (subtotal/board_qty), which silently splits the $800 NRE
-- across all 100 boards — meaning a partial 50-board invoice only collects
-- half the NRE, with the other half deferred to the second shipment. RS
-- wants the full NRE on shipment #1.
--
-- After this migration:
--   - invoice_lines.is_nre = TRUE marks a synthetic NRE row (qty=1,
--     unit_price=tier.nre_charge). is_nre=FALSE is the normal board line.
--   - jobs.nre_invoiced caches "has this job's NRE been billed on a non-
--     cancelled invoice?" — flipped TRUE on auto-add, re-evaluated on
--     cancel/delete from the remaining non-cancelled is_nre lines.
--
-- Backfill: every job that already has a non-cancelled invoice line is
-- treated as if NRE was already billed (because pre-migration NRE was baked
-- into the per-unit and is implicitly collected). This prevents double-
-- charging on the next invoice for an in-flight partial-shipment job.
-- ============================================================================

-- 1. is_nre flag on invoice_lines
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS is_nre BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_job_is_nre
  ON public.invoice_lines(job_id, is_nre);

COMMENT ON COLUMN public.invoice_lines.is_nre IS
  'TRUE = synthetic NRE line (non-recurring engineering, qty=1, unit_price=tier.nre_charge). Excluded from per-job board-quantity guards.';

-- 2. nre_invoiced cache on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS nre_invoiced BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.jobs.nre_invoiced IS
  'TRUE iff at least one non-cancelled invoice_line with is_nre=TRUE exists for this job. Denormalised cache — invoice POST/PATCH/DELETE/cancel keeps it in sync.';

-- 3. Backfill — pre-migration jobs with any live invoice line are treated
--    as if NRE was already collected (it was, baked into per-unit).
UPDATE public.jobs j
SET nre_invoiced = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.invoice_lines il
  JOIN public.invoices i ON i.id = il.invoice_id
  WHERE il.job_id = j.id
    AND i.status <> 'cancelled'
);
