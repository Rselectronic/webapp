-- suppliers.payment_terms: TEXT → TEXT[]
--
-- Many of RS's suppliers accept several payment methods (e.g. Credit Card
-- AND Net 30). The single-value column forced the operator to pick one or
-- jam them into a comma-separated string the system never parsed. Switch
-- to a real array so the UI can offer multi-select and the PDF can render
-- "Credit Card · Net 30" cleanly.
--
-- Backfill: existing single-value rows become a one-element array; NULLs
-- stay NULL. Wrap in CASE because ARRAY[NULL] would produce {NULL}, not
-- the SQL NULL we actually want.

ALTER TABLE public.suppliers
  ALTER COLUMN payment_terms
  TYPE TEXT[]
  USING CASE
    WHEN payment_terms IS NULL THEN NULL
    WHEN btrim(payment_terms) = '' THEN NULL
    ELSE ARRAY[btrim(payment_terms)]
  END;

COMMENT ON COLUMN public.suppliers.payment_terms IS
  'Accepted payment terms for this supplier — multiple values allowed (e.g. Credit Card, Net 30, Net 60).';
