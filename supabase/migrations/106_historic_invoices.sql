-- ============================================================================
-- 106_historic_invoices.sql
--
-- Bulk import of pre-web-app invoices for revenue reporting continuity.
--
-- Two new columns on `invoices`:
--   is_historic       BOOLEAN — flags rows imported from legacy systems.
--                                Operational queries (Pending Invoice list,
--                                AR aging, customer detail) hide these by
--                                default; the Reports → Revenue section
--                                deliberately includes them so totals span
--                                the full RS history.
--   legacy_reference  TEXT    — pointer back to the source record so an
--                                accountant can trace any historic dollar
--                                back to its original Excel / QuickBooks
--                                cell. Free-form (e.g. "DM File V11 r142",
--                                "QB INV #4567").
--
-- We also drop the NOT NULL on invoices.job_id. Historic invoices precede
-- the web app's `jobs` table and have no production record to point at.
-- The denormalised job_id pointer was already nullable in spirit since
-- multi-job invoices (migration 100) only require the FIRST line's job_id;
-- this just lifts the schema constraint to match.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_historic BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_reference TEXT;

COMMENT ON COLUMN public.invoices.is_historic IS
  'True for invoices bulk-imported from pre-web-app systems. Operational queries filter these out by default; reports include them to span the full RS history.';
COMMENT ON COLUMN public.invoices.legacy_reference IS
  'Free-form pointer back to the source record (e.g. "DM File V11 r142", "QB INV #4567") so historic dollars can be traced to their original cell.';

ALTER TABLE public.invoices
  ALTER COLUMN job_id DROP NOT NULL;

-- Reports query by issued_date and currency. Bumping the partial index
-- to also exclude cancelled is_historic-irrelevant — keep the existing
-- one as-is and add a covering historic index for fast revenue rollups.
CREATE INDEX IF NOT EXISTS idx_invoices_historic_revenue
  ON public.invoices (issued_date)
  WHERE is_historic = true AND status <> 'cancelled';
