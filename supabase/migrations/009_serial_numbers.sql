-- ============================================
-- Serial Number Tracking for manufactured boards
-- Each board produced in a job gets a unique serial number
-- ============================================

CREATE TABLE public.serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  board_number INT NOT NULL,
  status TEXT DEFAULT 'produced' CHECK (status IN ('produced', 'inspected', 'shipped', 'returned')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, serial_number)
);

CREATE INDEX idx_serial_job ON public.serial_numbers(job_id);
CREATE INDEX idx_serial_number ON public.serial_numbers(serial_number);

ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;

-- CEO sees all serial numbers
CREATE POLICY serial_ceo_all ON public.serial_numbers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations manager can read and insert serial numbers
CREATE POLICY serial_ops_read ON public.serial_numbers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY serial_ops_insert ON public.serial_numbers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

CREATE POLICY serial_ops_update ON public.serial_numbers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Shop floor can view serial numbers for jobs in production/inspection
CREATE POLICY serial_shop_floor_read ON public.serial_numbers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shop_floor')
  AND EXISTS (
    SELECT 1 FROM public.jobs WHERE id = serial_numbers.job_id AND status IN ('production', 'inspection')
  )
);
