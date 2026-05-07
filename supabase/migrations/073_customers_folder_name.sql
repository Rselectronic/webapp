-- 073_customers_folder_name.sql
-- Adds folder_name to customers — the manually-assigned shorthand RS uses
-- when filing customer documents (e.g. "Cevians" for Cevians LLC).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS folder_name TEXT;

COMMENT ON COLUMN public.customers.folder_name IS
  'Manually-assigned folder name used when filing customer documents on disk. Shorter than company_name (e.g. "Cevians" for "Cevians LLC"). Operator-maintained.';
