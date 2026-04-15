-- ============================================================================
-- Migration 036 — DM V11 Programming fee lookup + REAL markup values
-- ============================================================================
-- Source of truth: supabase/seed-data/dm-file/_SOURCE_DM_Common_File_V11_2026-04-15.xlsm
--                  supabase/seed-data/dm-file/_SOURCE_TIME_V11_2026-04-15.xlsm
--
-- Two corrections on top of migration 034's VBA-sourced pricing:
--
-- 1. MARKUP IS 25%, NOT 30%.
--    Migration 034 used VBA commented-out defaults (0.3) from
--    Generate_TIME_File_V4.bas lines 862-863. But the live Settings sheet in
--    TIME V11 shows 0.25 in cells C15..C18 (labour rate 130, SMT rate 165,
--    PCB markup 0.25, component markup 0.25 for all 4 qty tiers). The VBA
--    comments were stale — 25% is the current value. Fixing.
--
-- 2. PROGRAMMING FEES ARE A BOM-LINE-COUNT LOOKUP.
--    The DM workbook's "Programming" sheet has a 28-row lookup table:
--    BOM lines -> (additional_cost, standard_price, double_side_price).
--    The VBA pipeline runs the BOM through this table at quote time to pull
--    the programming NRE. Previously the web app used a flat $100 default.
--    Now the lookup is queryable from app code via programming_fees table.
--
-- Also seeds the standalone "Type of Board" setup fees from the same sheet:
--    Standard: $250, Double Side: $350.
-- ============================================================================

-- Part 1: Programming fee lookup table ---------------------------------------
CREATE TABLE IF NOT EXISTS public.programming_fees (
  bom_lines INT PRIMARY KEY,              -- lookup key: find row where bom_lines <= N <= next.bom_lines
  additional_cost INT NOT NULL,           -- per-additional-line surcharge at this tier
  standard_price INT NOT NULL,            -- total programming fee for a standard (single-side) board
  double_side_price INT NOT NULL,         -- total programming fee for a double-side board
  source TEXT NOT NULL DEFAULT 'DM V11 Programming sheet 2026-04-15'
);

COMMENT ON TABLE public.programming_fees IS
  'DM V11 Programming sheet lookup: BOM line count -> programming NRE fee. '
  'Query pattern: SELECT * FROM programming_fees WHERE bom_lines <= $1 ORDER BY bom_lines DESC LIMIT 1; '
  'Pick standard_price or double_side_price based on assembly_type.';

-- Read-only for all authenticated users (it's a reference table, not transactional)
ALTER TABLE public.programming_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY programming_fees_read ON public.programming_fees FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.programming_fees (bom_lines, additional_cost, standard_price, double_side_price) VALUES
  (1,   50, 300,  400),
  (40,  50, 350,  450),
  (50,  50, 400,  500),
  (60,  50, 450,  550),
  (70,  75, 525,  625),
  (80,  75, 600,  700),
  (90,  75, 675,  775),
  (100, 75, 750,  850),
  (110, 75, 825,  925),
  (120, 75, 900,  1000),
  (130, 75, 975,  1075),
  (140, 75, 1050, 1150),
  (150, 75, 1125, 1225),
  (160, 75, 1200, 1300),
  (170, 75, 1275, 1375),
  (180, 75, 1350, 1450),
  (190, 75, 1425, 1525),
  (200, 75, 1500, 1600),
  (210, 75, 1575, 1675),
  (220, 75, 1650, 1750),
  (230, 75, 1725, 1825),
  (240, 75, 1800, 1900),
  (250, 75, 1875, 1975),
  (260, 75, 1950, 2050),
  (270, 75, 2025, 2125),
  (280, 75, 2100, 2200),
  (290, 75, 2175, 2275),
  (300, 75, 2250, 2350)
ON CONFLICT (bom_lines) DO NOTHING;


-- Part 2: Fix the markups that migration 034 got wrong ----------------------
-- Migration 034 used VBA commented-out defaults (0.3). The real live values
-- from TIME V11 final sheet rows 15-18 are 0.25 for both PCB and component.
UPDATE public.app_settings
SET value = value
    || jsonb_build_object('component_markup_pct', 25)
    || jsonb_build_object('pcb_markup_pct', 25)
    || jsonb_build_object('_xlsm_sourced', true)
    || jsonb_build_object('_xlsm_sourced_at', '2026-04-15')
    || jsonb_build_object('_xlsm_sources', jsonb_build_array(
         'DM Common File V11 Programming sheet',
         'TIME V11 final sheet rows 15-18'
       ))
    || jsonb_build_object('board_setup_fee_standard', 250)
    || jsonb_build_object('board_setup_fee_double_side', 350),
    updated_at = NOW()
WHERE key = 'pricing';


-- Part 3: Sanity check ------------------------------------------------------
DO $$
DECLARE
  pf_count INT;
  markup TEXT;
BEGIN
  SELECT COUNT(*) INTO pf_count FROM public.programming_fees;
  SELECT value->>'component_markup_pct' INTO markup FROM public.app_settings WHERE key = 'pricing';
  RAISE NOTICE 'Migration 036 complete: % programming fee rows, component_markup_pct = %',
    pf_count, markup;
END $$;
