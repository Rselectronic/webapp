-- ============================================================================
-- 091_drop_assembly_type.sql
--
-- Collapse the dual-classification confusion left over after migration 089.
--
-- Until now the codebase carried two near-overlapping classifications:
--   * `quotes.assembly_type` / `jobs.assembly_type`  ('TB' | 'TS')
--       — physical layout: top-only vs top+bottom SMT.
--   * `quotes.procurement_mode` / `procurements.procurement_mode`
--       ('turnkey' | 'consignment' | 'assembly_only') — billing model.
--
-- The TB/TS distinction is a property of the physical product (the GMP),
-- not the quote or the job. Migration 074 already added the canonical
-- `gmps.board_side` column ('single' | 'double') and migration 075
-- backfilled it from each GMP's most recent BOM. Any place in the code
-- that needs to know 'is this a one-pass or two-pass SMT board' should
-- read `gmps.board_side` directly.
--
-- After this migration:
--   * `gmps.board_side`           — physical layout (canonical)
--   * `quotes.procurement_mode`   — billing model on the quote
--   * `procurements.procurement_mode` — billing model on the procurement
--
-- Pre-flight verification (run before this migration):
--
--   -- 1. Confirm only TB/TS values remain after migration 089.
--   SELECT 'jobs' AS tbl, assembly_type, COUNT(*) FROM public.jobs   GROUP BY 2
--   UNION ALL
--   SELECT 'quotes',       assembly_type, COUNT(*) FROM public.quotes GROUP BY 2;
--
--   -- 2. Every GMP referenced by a non-null assembly_type quote/job
--   --    must already have board_side populated. (gmps.board_side is the
--   --    canonical store going forward — see migration 074.)
--   SELECT
--     (SELECT COUNT(*) FROM public.quotes q
--       LEFT JOIN public.gmps g ON g.id = q.gmp_id
--      WHERE q.assembly_type IS NOT NULL AND g.board_side IS NULL)
--       AS quotes_missing_board_side,
--     (SELECT COUNT(*) FROM public.jobs j
--       LEFT JOIN public.gmps g ON g.id = j.gmp_id
--      WHERE j.assembly_type IS NOT NULL AND g.board_side IS NULL)
--       AS jobs_missing_board_side;
--
-- ============================================================================

-- 1. Defensive backfill: derive gmps.board_side from any quote/job that
--    still has assembly_type populated when the linked GMP's board_side
--    is NULL. On the production DB this is a no-op (074/075 already did
--    the work), but keeps the migration idempotent across restores and
--    development branches with stale data.
UPDATE public.gmps g
   SET board_side = CASE q.assembly_type
                      WHEN 'TB' THEN 'double'
                      WHEN 'TS' THEN 'single'
                    END
  FROM public.quotes q
 WHERE g.id = q.gmp_id
   AND g.board_side IS NULL
   AND q.assembly_type IN ('TB', 'TS');

UPDATE public.gmps g
   SET board_side = CASE j.assembly_type
                      WHEN 'TB' THEN 'double'
                      WHEN 'TS' THEN 'single'
                    END
  FROM public.jobs j
 WHERE g.id = j.gmp_id
   AND g.board_side IS NULL
   AND j.assembly_type IN ('TB', 'TS');

-- 2. Drop the CHECK constraints first so DROP COLUMN doesn't trip over
--    them. (089 added these — 091 retires the column entirely.)
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_assembly_type_check;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_assembly_type_check;

-- 3. Drop the columns. Any code still reading them will fail at runtime
--    — see migration notes for the matching app-side sweep.
ALTER TABLE public.jobs   DROP COLUMN IF EXISTS assembly_type;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS assembly_type;

-- 4. Post-flight verification — surfaces a clear error in psql output if
--    something went sideways. Catalog reads only; no row-level cost.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   IN ('jobs', 'quotes')
       AND column_name  = 'assembly_type'
  ) THEN
    RAISE EXCEPTION '091: assembly_type column still present after drop';
  END IF;
END $$;
