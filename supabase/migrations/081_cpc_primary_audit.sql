-- ============================================================================
-- Phase 1 of the CPC-vs-MPN refactor (audit follow-up).
--
-- Goals:
--   • Drop the legacy bg_stock + bg_stock_log tables (replaced by inventory_*).
--   • Add cpc to every operational table that was MPN-keyed but should be
--     CPC-keyed: procurement_lines, procurement_line_selections, ai_call_log.
--   • Backfill cpc on existing rows where possible (best-effort JOIN against
--     bom_lines / parent procurement_lines). New rows from the application
--     will populate cpc directly going forward.
--   • Add indexes on cpc to support the upcoming code-side switch.
--
-- NOT in this migration (intentionally — keeps risk bounded):
--   • Switching UNIQUE indexes from (..., mpn) to (..., cpc). That happens
--     after the application code is updated to write cpc on every insert,
--     so we don't risk constraint violations on legacy rows that didn't
--     get a cpc backfill. Targeted as a follow-up migration once Phase 2/3
--     code lands.
--   • Making cpc NOT NULL. Same reasoning — gradual tightening.
--   • procurement_batch_lines / quote_batch_lines already have cpc columns
--     (added during their original creation) — and both tables are empty —
--     so no schema change needed today; the application code refactor is
--     the only fix needed there.
-- ============================================================================

-- 1. Drop the legacy bg_stock tables (both empty; verified before running).
DROP TABLE IF EXISTS public.bg_stock_log;
DROP TABLE IF EXISTS public.bg_stock;

-- 2. Add cpc to procurement_lines (118 existing rows, nullable for now).
ALTER TABLE public.procurement_lines
  ADD COLUMN IF NOT EXISTS cpc TEXT;

-- Best-effort backfill from bom_lines: pick the most-common cpc per mpn.
-- Some procurement_lines may have no matching bom_line, in which case cpc
-- stays null and the operator will need to fill it later (manual cleanup
-- prompt happens via the inventory / proc UI when the user revisits).
UPDATE public.procurement_lines pl
SET cpc = sub.cpc
FROM (
  SELECT DISTINCT ON (UPPER(bl.mpn)) UPPER(bl.mpn) AS mpn_upper, bl.cpc
  FROM public.bom_lines bl
  WHERE bl.cpc IS NOT NULL AND bl.mpn IS NOT NULL
  ORDER BY UPPER(bl.mpn), bl.created_at DESC
) sub
WHERE pl.mpn IS NOT NULL
  AND UPPER(pl.mpn) = sub.mpn_upper
  AND pl.cpc IS NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_lines_cpc
  ON public.procurement_lines(procurement_id, cpc)
  WHERE cpc IS NOT NULL;

-- 3. Add cpc to procurement_line_selections (39 existing rows).
ALTER TABLE public.procurement_line_selections
  ADD COLUMN IF NOT EXISTS cpc TEXT;

-- Backfill from the parent procurement_lines row sharing (procurement_id, mpn).
UPDATE public.procurement_line_selections pls
SET cpc = pl.cpc
FROM public.procurement_lines pl
WHERE pls.procurement_id = pl.procurement_id
  AND pls.mpn = pl.mpn
  AND pl.cpc IS NOT NULL
  AND pls.cpc IS NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_line_selections_cpc
  ON public.procurement_line_selections(procurement_id, cpc)
  WHERE cpc IS NOT NULL;

-- 4. ai_call_log — add cpc for traceability. No backfill (105 rows, but the
-- audit signal is more valuable going forward than reconstructing history).
ALTER TABLE public.ai_call_log
  ADD COLUMN IF NOT EXISTS cpc TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_call_log_cpc
  ON public.ai_call_log(cpc)
  WHERE cpc IS NOT NULL;

COMMENT ON COLUMN public.procurement_lines.cpc IS
  'Customer Part Code — the business identity at RS. New rows must populate; legacy rows backfilled best-effort from bom_lines.';
COMMENT ON COLUMN public.procurement_line_selections.cpc IS
  'CPC mirror from procurement_lines so selections can move with the canonical part identity, not whatever MPN was current at pick time.';
COMMENT ON COLUMN public.ai_call_log.cpc IS
  'CPC tag for AI calls — added so the audit trail traces back to the canonical part rather than a (possibly rotated) MPN.';
