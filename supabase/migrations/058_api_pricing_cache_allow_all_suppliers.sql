-- Drop the CHECK constraint on api_pricing_cache.source.
--
-- Originally pinned to the first three built-in suppliers (DigiKey / Mouser /
-- LCSC). Later migrations (028, 038) bumped it to include 'manual' and
-- 'procurement_history' but never kept up as new suppliers were wired in
-- (Future, Avnet, Arrow, Samtec, TTI, TME, e-sonic, Newark,
-- Texas Instruments, etc.). The outcome: every upsert from those suppliers
-- was silently rejected with a 23514 check-constraint violation, so their
-- cache was always empty and cache_first always fell through to live.
--
-- The supplier name is already validated by TypeScript (BuiltInSupplierName
-- union + user-defined custom_suppliers table), and the CHECK provides no
-- real safety — a typo still gets rejected today via the application's own
-- validation. Drop it entirely.

ALTER TABLE public.api_pricing_cache
  DROP CONSTRAINT IF EXISTS api_pricing_cache_source_check;
