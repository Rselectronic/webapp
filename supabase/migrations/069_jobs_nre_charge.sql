ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS nre_charge_cad NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS nre_included_on_po BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN public.jobs.nre_charge_cad IS 'NRE charge (CAD) the customer is paying on this job. Operator-entered at PO ingest; defaults from the matched quote when the customer includes NRE on the PO.';
COMMENT ON COLUMN public.jobs.nre_included_on_po IS 'True if the customer included the NRE amount on their PO. Drives invoicing: when true, nre_charge_cad is added to the invoice line items for this job.';
