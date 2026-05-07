-- ---------------------------------------------------------------------------
-- Procurement database migration.
--
-- Replaces RS's Excel "Procurement" sheet (~11k rows, per-customer part log)
-- and the flat "Manual M-Code" sheet with two DB tables. The classifier's
-- Layer-1 lookup now checks, in order:
--   1. customer_parts.m_code_manual      — per-customer override (strongest)
--   2. manual_m_code_overrides.m_code    — global CPC override (flat sheet)
--   3. components.m_code                 — physical-part cache (existing)
--   4. rule engine → API → human review  (unchanged)
--
-- Both tables are idempotent upserts by their natural keys so the import
-- script can re-run safely, and so the BOM parser + human-review flow can
-- keep writing to them without worrying about conflicts.
-- ---------------------------------------------------------------------------

-- 1. Per-customer procurement log. One row per (customer, CPC).
CREATE TABLE IF NOT EXISTS public.customer_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cpc TEXT NOT NULL,

  -- Customer-submitted values (never overwrite; this is the record of what
  -- their original BOM said).
  original_mpn TEXT,
  original_manufacturer TEXT,

  -- RS's curated choices. mpn_to_use/manufacturer_to_use differ from the
  -- originals when a part is obsolete, renamed, or has a known replacement.
  -- Pricing and procurement should prefer these.
  mpn_to_use TEXT,
  manufacturer_to_use TEXT,

  -- Known-good distributor part numbers. When present, the pricing fetch
  -- should use the direct part-number API path instead of keyword search.
  digikey_pn TEXT,
  mouser_pn TEXT,
  lcsc_pn TEXT,

  -- Per-customer manual M-Code override. Takes precedence over
  -- manual_m_code_overrides (global) when both exist for the same CPC.
  m_code_manual TEXT,
  m_code_manual_updated_at TIMESTAMPTZ,
  m_code_manual_by UUID REFERENCES public.users(id),

  through_hole_pins INT,
  notes TEXT,

  -- proc batch codes (legacy format like "260403 TLAN-TB085") where this
  -- part has been used. Written to by the job/proc creation flow.
  used_in_procs TEXT[] DEFAULT '{}',

  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  quote_count INT DEFAULT 0,
  job_count INT DEFAULT 0,

  UNIQUE (customer_id, cpc)
);

CREATE INDEX IF NOT EXISTS idx_customer_parts_customer_cpc
  ON public.customer_parts (customer_id, cpc);

-- Secondary lookup: "does any customer have this MPN on record?" Used by the
-- pricing engine when a BOM line has no CPC match but a global MPN match may
-- still carry a known-good Digi-Key PN we learned from another customer.
CREATE INDEX IF NOT EXISTS idx_customer_parts_mpn
  ON public.customer_parts (original_mpn);
CREATE INDEX IF NOT EXISTS idx_customer_parts_mpn_to_use
  ON public.customer_parts (mpn_to_use);

-- 2. Flat global CPC → M-Code overrides. Matches the RS Excel "Manual
--    Machine Code" sheet 1:1.
CREATE TABLE IF NOT EXISTS public.manual_m_code_overrides (
  cpc TEXT PRIMARY KEY,
  m_code TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id),
  notes TEXT
);

-- RLS — same access pattern as components. Operators read, CEO/ops writes.
ALTER TABLE public.customer_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_m_code_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_parts_read ON public.customer_parts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users
            WHERE id = auth.uid()
              AND role IN ('ceo', 'operations_manager', 'shop_floor'))
  );
CREATE POLICY customer_parts_write ON public.customer_parts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users
            WHERE id = auth.uid()
              AND role IN ('ceo', 'operations_manager'))
  );

CREATE POLICY manual_mcode_read ON public.manual_m_code_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users
            WHERE id = auth.uid()
              AND role IN ('ceo', 'operations_manager', 'shop_floor'))
  );
CREATE POLICY manual_mcode_write ON public.manual_m_code_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users
            WHERE id = auth.uid()
              AND role IN ('ceo', 'operations_manager'))
  );

COMMENT ON TABLE public.customer_parts IS
  'Per-customer procurement log (replaces the Excel Procurement sheet).';
COMMENT ON TABLE public.manual_m_code_overrides IS
  'Flat global CPC → M-Code overrides (replaces the Excel Manual Machine Code sheet).';
