-- ============================================
-- NCR (Non-Conformance Report) System
-- ============================================

CREATE TABLE public.ncr_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.jobs(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  ncr_number TEXT UNIQUE NOT NULL,        -- "NCR-2604-001" auto-generated
  category TEXT NOT NULL,                 -- Soldering Defect, Component, PCB, Assembly, Cosmetic, Other
  subcategory TEXT,                       -- Cold Joint, Bridge, Wrong Part, etc.
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'corrective_action', 'closed')),
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.ncr_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ncr_customer ON public.ncr_reports(customer_id);
CREATE INDEX idx_ncr_status ON public.ncr_reports(status);
CREATE INDEX idx_ncr_job ON public.ncr_reports(job_id);

-- CEO sees everything
CREATE POLICY ncr_ceo_all ON public.ncr_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations Manager can read and create NCRs
CREATE POLICY ncr_ops_select ON public.ncr_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'operations_manager')
);

CREATE POLICY ncr_ops_insert ON public.ncr_reports FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'operations_manager')
);

CREATE POLICY ncr_ops_update ON public.ncr_reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'operations_manager')
);
