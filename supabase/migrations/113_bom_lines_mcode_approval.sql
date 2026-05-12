-- AI-classification approval workflow. When the AI tags a line with an
-- m_code, the row stays at m_code_source='ai' until an operator approves
-- it. On approval the source flips to 'manual' and the m_code is cached
-- in `components` + `customer_parts` so the next BOM with the same CPC
-- skips the AI entirely. These columns capture WHO approved and WHEN so
-- the audit trail survives.
ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS m_code_approved_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS m_code_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bom_lines_mcode_approval
  ON public.bom_lines(bom_id)
  WHERE m_code_source = 'ai' AND m_code_approved_at IS NULL;

COMMENT ON COLUMN public.bom_lines.m_code_approved_by IS
  'User who approved the AI-classified m_code. NULL until approved.';
COMMENT ON COLUMN public.bom_lines.m_code_approved_at IS
  'Timestamp of approval. NULL until approved. Pair with m_code_approved_by for the audit trail.';
