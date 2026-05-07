-- Consolidate manual_m_code_overrides into customer_parts.
--
-- The original plan imagined the flat Excel "Manual Machine Code" sheet as a
-- standalone global table. In practice every CPC in that sheet also exists
-- in the procurement log (the Excel system always generated procurement
-- rows for anything quoted), so a per-customer m_code_manual on
-- customer_parts is a strict superset — no reason to keep two tables.
--
-- Strategy:
--   1. For each (cpc, m_code) in manual_m_code_overrides, update EVERY
--      matching customer_parts row (CPC might appear under multiple
--      customers). Only fill rows where m_code_manual is NULL so that
--      already-set per-customer overrides are not clobbered by the flat
--      sheet's older "best guess" value.
--   2. For any orphan CPCs (in manual_m_code_overrides but with no matching
--      customer_parts row), surface them via RAISE NOTICE so the operator
--      knows what won't migrate. These CPCs have historically had a manual
--      M-Code assigned but have never been procured — so we have no
--      customer context to attach them to. They'll just be re-learned the
--      next time a BOM containing that CPC comes through.
--   3. Drop manual_m_code_overrides.

DO $$
DECLARE
  orphan_count INT := 0;
  orphan_sample TEXT[];
BEGIN
  -- 1. Back-fill customer_parts.m_code_manual
  WITH updated AS (
    UPDATE public.customer_parts cp
    SET
      m_code_manual = mo.m_code,
      m_code_manual_updated_at = COALESCE(cp.m_code_manual_updated_at, mo.updated_at, NOW())
    FROM public.manual_m_code_overrides mo
    WHERE cp.cpc = mo.cpc
      AND cp.m_code_manual IS NULL
    RETURNING cp.id
  )
  SELECT COUNT(*) INTO orphan_count FROM updated;
  RAISE NOTICE 'Back-filled m_code_manual on % customer_parts rows', orphan_count;

  -- 2. Report orphans (manual M-Codes with no procurement row at all).
  SELECT COUNT(*), array_agg(mo.cpc ORDER BY mo.cpc) FILTER (WHERE rn <= 20)
  INTO orphan_count, orphan_sample
  FROM (
    SELECT mo.cpc, ROW_NUMBER() OVER (ORDER BY mo.cpc) AS rn
    FROM public.manual_m_code_overrides mo
    WHERE NOT EXISTS (
      SELECT 1 FROM public.customer_parts cp WHERE cp.cpc = mo.cpc
    )
  ) mo;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'Dropping % orphan manual M-Code entries with no matching customer_parts (sample: %). They will be re-learned on next BOM that includes the CPC.',
      orphan_count, orphan_sample;
  END IF;
END $$;

-- 3. Drop the now-redundant table.
DROP TABLE IF EXISTS public.manual_m_code_overrides;
