-- Migration: 068_jobs_po_unit_price.sql
-- Purpose: Record the unit price stated by the customer on their PO, independent
-- of our internal matched/frozen unit price. Operator-entered at PO ingest.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS po_unit_price NUMERIC(12,4);

COMMENT ON COLUMN public.jobs.po_unit_price IS 'Unit price (CAD) the customer stated on their purchase order. Operator-entered at PO ingest. Independent of our internal frozen_unit_price which comes from the matched quote.';
