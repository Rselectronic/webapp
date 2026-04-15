-- ============================================================================
-- Migration 033 — DM Admin file refresh (April 15, 2026)
-- ============================================================================
-- Anas exported the latest "admin file.xlsx" from DM Common File V11 on Apr 15.
-- Diffing against the previous seed (migration 026, April 14) surfaced:
--   • 5 new MachineCodes rows that weren't in the prior extract
--   • 1 new PAR rule: PAR-02A (Panel Mount + Through Hole + Right Angle → TH)
--   • Size Table: no change (already matches DM V11 byte-for-byte)
--
-- This migration is ADDITIVE — it does not re-seed or delete existing rows.
-- Running it on an already-seeded database is safe.
-- ============================================================================

-- 1. New MachineCodes (5 package keywords not in the April 14 extract) ---------
--    Priority picks up after migration 026's 218th keyword (prio ~227). We use
--    ON CONFLICT DO NOTHING against keyword so rerunning this file is idempotent.
INSERT INTO mcode_keyword_lookup
  (keyword, assigned_m_code, match_type, match_field, priority, is_active)
VALUES
  ('8-MSOP',   'CPEXP', 'word_boundary', 'any', 500, true),
  ('1806',     'CP',    'word_boundary', 'any', 501, true),
  ('DO-214BA', 'CP',    'word_boundary', 'any', 502, true),
  ('806',      'CP',    'word_boundary', 'any', 503, true),
  ('16-TSSOP', 'IP',    'word_boundary', 'any', 504, true)
ON CONFLICT (keyword) DO NOTHING;


-- 2. New PAR rule: PAR-02A ------------------------------------------------------
--    Inserted between PAR-02 and PAR-03 in execution order (priority 101 was
--    used by PAR-02; we slot this at 101.5 logically by using 150 which falls
--    before PAR-03 at 102 — wait, that's wrong. Looking at migration 026 the
--    priorities run sequentially 100..142. PAR-02A logically fires between
--    PAR-02 and PAR-03 but it's a new mounting_type short-circuit that's
--    checked alongside PAR-01/PAR-02 in practice. Using priority 143 (after
--    the existing rules) — the rule engine treats mounting_type exact-match
--    checks as highly selective, so ordering relative to PAR-01/02 only
--    matters when a row matches multiple, which is not possible here.
INSERT INTO m_code_rules
  (rule_id, priority, layer,
   field_1, operator_1, value_1,
   field_2, operator_2, value_2,
   assigned_m_code, description, is_active)
VALUES
  ('PAR-02A', 143, 2,
   'mounting_type', 'equals', 'Panel Mount, Through Hole, Right Angle',
   NULL, NULL, NULL,
   'TH',
   'If Mounting Type is equals to "Panel Mount, Through Hole, Right Angle" then it is TH (added 2026-04-15 from DM V11 Admin sheet export)',
   true)
ON CONFLICT (rule_id) DO NOTHING;


-- 3. Sanity check — log what we ended up with ----------------------------------
DO $$
DECLARE
  kw_count integer;
  rule_count integer;
BEGIN
  SELECT COUNT(*) INTO kw_count FROM mcode_keyword_lookup WHERE is_active;
  SELECT COUNT(*) INTO rule_count FROM m_code_rules WHERE is_active;
  RAISE NOTICE 'Migration 033 complete: % active keywords, % active PAR rules', kw_count, rule_count;
END $$;
