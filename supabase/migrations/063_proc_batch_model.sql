-- 063_proc_batch_model.sql
-- Evolve procurements into a PROC Batch (parent of many jobs).
-- Jobs can be draft/pending (procurement_id NULL) until merged into a PROC Batch.
-- Note: legacy procurements.job_id is intentionally left in place; operator will clean up later.

-- ============================================
-- jobs: add procurement_id (many jobs -> one procurement batch)
-- ============================================
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS procurement_id UUID REFERENCES public.procurements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.procurement_id IS
  'NULL = pending PO not yet grouped into a PROC Batch. Set when user creates a PROC Batch that includes this order.';

-- ============================================
-- procurements: batch-level metadata
-- ============================================
ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS procurement_mode TEXT
    CHECK (procurement_mode IN ('turnkey','consign_parts_supplied','consign_pcb_supplied','assembly_only'));

ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS is_batch BOOLEAN DEFAULT FALSE;

ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 0;

ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS sequence_num INT;

ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS proc_date DATE;

COMMENT ON COLUMN public.procurements.customer_id IS
  'Customer this PROC Batch belongs to (all member jobs must share this customer).';
COMMENT ON COLUMN public.procurements.procurement_mode IS
  'Mode: turnkey, consign_parts_supplied, consign_pcb_supplied, or assembly_only. Drives the T/C/A letter in proc_code.';
COMMENT ON COLUMN public.procurements.is_batch IS
  'TRUE when this PROC groups more than one member job (member_count > 1).';
COMMENT ON COLUMN public.procurements.member_count IS
  'Count of member jobs rolled into this PROC Batch. Drives the S/B (single/batch) letter in proc_code.';
COMMENT ON COLUMN public.procurements.sequence_num IS
  'Per-day, per-customer sequential counter (NNN portion of proc_code).';
COMMENT ON COLUMN public.procurements.proc_date IS
  'The YYMMDD portion of proc_code expressed as a real date for indexing and per-day sequencing.';

-- ============================================
-- Enforce per-day-per-customer sequential numbering
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_procurements_date_customer_seq
  ON public.procurements(proc_date, customer_id, sequence_num);

-- ============================================
-- Drop legacy NOT NULL on procurements.job_id.
-- Old model was 1 procurement per job. New PROC Batch model has many jobs per
-- procurement via jobs.procurement_id, so job_id on procurement must be nullable.
-- ============================================
ALTER TABLE public.procurements ALTER COLUMN job_id DROP NOT NULL;
