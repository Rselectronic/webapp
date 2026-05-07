-- ============================================================================
-- 089_assembly_type_two_values.sql
--
-- Tighten `assembly_type` to only the two physical-layout values:
--   'TB' = Top + Bottom (double-sided)
--   'TS' = Top-side only (single-sided)
--
-- The legacy values 'CS' / 'CB' / 'AS' were billing-model carry-overs.
-- Billing model now lives entirely in `procurement_mode` (canonicalised by
-- migrations 070 + 084 to {turnkey, consignment, assembly_only}). Keeping
-- both fields meant two ways to say the same thing — confusing.
--
-- Pre-flight check (run in this branch before applying):
--   SELECT assembly_type, COUNT(*) FROM jobs   GROUP BY 1;
--   SELECT assembly_type, COUNT(*) FROM quotes GROUP BY 1;
-- Confirmed: 0 rows currently use CS/CB/AS on either table, so no data
-- backfill is required. The migration is constraint-only.
--
-- If a future restore brings back legacy rows (e.g. from a backup), the
-- defensive UPDATE statements below will normalise them to 'TB' (the safe
-- default — most boards in this shop are double-sided). Operators who
-- need the actual physical layout can re-classify by hand.
-- ============================================================================

-- 1. Defensive backfill — no-ops on a clean DB but keeps the migration
--    idempotent across restores / branches.
UPDATE public.jobs
   SET assembly_type = 'TB'
 WHERE assembly_type IN ('CS', 'CB', 'AS');

UPDATE public.quotes
   SET assembly_type = 'TB'
 WHERE assembly_type IN ('CS', 'CB', 'AS');

-- 2. Drop existing CHECK constraints, replace with the tighter pair.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_assembly_type_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_assembly_type_check
  CHECK (assembly_type IN ('TB', 'TS'));

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_assembly_type_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_assembly_type_check
  CHECK (assembly_type IN ('TB', 'TS'));

-- 3. Update the column comment so anyone inspecting via psql or schema
--    tooling sees the new contract.
COMMENT ON COLUMN public.jobs.assembly_type IS
  'Physical layout: TB=Top+Bottom (double-sided), TS=Top-side only (single-sided). Billing model lives on procurements.procurement_mode.';

COMMENT ON COLUMN public.quotes.assembly_type IS
  'Physical layout: TB=Top+Bottom (double-sided), TS=Top-side only (single-sided). Billing model lives on quotes.procurement_mode.';
