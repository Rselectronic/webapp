-- Migration: 062_jobs_po_source.sql
-- Purpose: Record the source quote/tier a job was priced from when created from a
-- customer PO, plus a frozen price snapshot so the job stays stable even if the
-- source quote is later edited.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source_quote_id UUID REFERENCES public.quotes(id),
  ADD COLUMN IF NOT EXISTS source_tier_qty INT,
  ADD COLUMN IF NOT EXISTS frozen_unit_price NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS frozen_subtotal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS po_date DATE,
  ADD COLUMN IF NOT EXISTS price_match_reason TEXT;

COMMENT ON COLUMN public.jobs.source_quote_id IS
  'The quote this job was created from when a customer PO was received. Nullable because some jobs may be created without a prior quote (e.g., direct orders, legacy imports).';

COMMENT ON COLUMN public.jobs.source_tier_qty IS
  'The tier quantity (from quotes.quantities, e.g. 50/100/250/500) that was selected to price this job. Preserves which pricing tier the PO was matched against.';

COMMENT ON COLUMN public.jobs.frozen_unit_price IS
  'Per-board unit price (CAD) captured at the moment the PO was received and the job was created. Frozen so later edits to the source quote do not change historical job pricing.';

COMMENT ON COLUMN public.jobs.frozen_subtotal IS
  'Frozen subtotal for the job: frozen_unit_price * jobs.quantity. Stored to avoid recomputation drift and to make invoicing deterministic.';

COMMENT ON COLUMN public.jobs.po_date IS
  'Date of the customer purchase order that triggered this job.';

COMMENT ON COLUMN public.jobs.price_match_reason IS
  'How the tier/price was chosen when converting PO to job. Expected values: "exact" (PO qty matched a quoted tier), "closest-not-greater" (nearest tier <= PO qty used), "manual-override" (user selected tier/price manually), "no-match" (no quoted tier available; priced manually).';
