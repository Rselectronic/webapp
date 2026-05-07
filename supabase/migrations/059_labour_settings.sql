-- ============================================
-- 059: labour_settings
-- ============================================
-- Versioned labour/cycle-time settings that drive the assembly pricing engine.
-- Each edit inserts a new row (keyed by effective_date); only one row has
-- is_active=TRUE at a time. Historical quotes can reference the row that was
-- active at quote creation for reproducible pricing.
--
-- The burdened shop rate is derived from a single bundled monthly overhead
-- figure (rent + salaries + utilities + insurance + depreciation + everything
-- else) divided by realized production capacity (staff * h/day * days/mo * util%).

CREATE TABLE IF NOT EXISTS public.labour_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Company overhead (single bundled number — all fixed costs)
  monthly_overhead NUMERIC(12, 2) NOT NULL,

  -- Capacity inputs
  production_staff_count INT NOT NULL,
  hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 8,
  days_per_month INT NOT NULL DEFAULT 21,
  utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 75,

  -- Derived (computed + stored for historical reference)
  available_hours_per_month NUMERIC(10, 2) GENERATED ALWAYS AS (
    production_staff_count * hours_per_day * days_per_month * utilization_pct / 100
  ) STORED,
  burdened_rate_per_hour NUMERIC(10, 4) GENERATED ALWAYS AS (
    monthly_overhead / NULLIF(
      production_staff_count * hours_per_day * days_per_month * utilization_pct / 100, 0
    )
  ) STORED,

  -- SMT line parameters
  conveyor_mm_per_sec NUMERIC(8, 3),
  oven_length_mm NUMERIC(8, 1),
  reflow_passes_default INT DEFAULT 1,

  -- Per-part cycle times (seconds/part)
  cycle_cp_seconds NUMERIC(6, 3),
  cycle_0402_seconds NUMERIC(6, 3),
  cycle_0201_seconds NUMERIC(6, 3),
  cycle_ip_seconds NUMERIC(6, 3),
  cycle_mansmt_seconds NUMERIC(6, 3),
  cycle_th_base_seconds NUMERIC(6, 3),
  cycle_th_per_pin_seconds NUMERIC(6, 3),

  -- Setup (per job, one-time)
  smt_line_setup_minutes NUMERIC(6, 2),
  feeder_setup_minutes_each NUMERIC(5, 2),
  first_article_minutes NUMERIC(6, 2),

  -- Per-board manual operations (minutes/board)
  inspection_minutes_per_board NUMERIC(5, 2),
  touchup_minutes_per_board NUMERIC(5, 2),
  packing_minutes_per_board NUMERIC(5, 2),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id)
);

-- Only one row can be active at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_labour_settings_active
  ON public.labour_settings (is_active)
  WHERE is_active = TRUE;

ALTER TABLE public.labour_settings ENABLE ROW LEVEL SECURITY;

-- CEO full access
DROP POLICY IF EXISTS labour_settings_ceo_all ON public.labour_settings;
CREATE POLICY labour_settings_ceo_all ON public.labour_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo'));

-- Operations manager read-only
DROP POLICY IF EXISTS labour_settings_ops_read ON public.labour_settings;
CREATE POLICY labour_settings_ops_read ON public.labour_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager')));

-- Seed an initial active row using the numbers Anas provided ($50K bundled overhead).
-- Cycle times are left NULL — to be filled in from TIME V11.
INSERT INTO public.labour_settings (
  effective_date,
  is_active,
  monthly_overhead,
  production_staff_count,
  hours_per_day,
  days_per_month,
  utilization_pct,
  reflow_passes_default
)
SELECT
  CURRENT_DATE,
  TRUE,
  50000,
  4,
  8,
  21,
  75,
  1
WHERE NOT EXISTS (SELECT 1 FROM public.labour_settings WHERE is_active = TRUE);
