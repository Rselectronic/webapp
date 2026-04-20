-- Enriches api_pricing_cache so every supplier response can persist its full
-- pricing / availability payload (not just a single unit_price). The Component
-- Pricing Review page needs price_breaks, lead time, MOQ, etc. per supplier.
--
-- Safe-by-default: all new columns are nullable — existing cache rows remain
-- valid, new supplier clients write these fields going forward.

ALTER TABLE public.api_pricing_cache
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS supplier_part_number TEXT,
  ADD COLUMN IF NOT EXISTS price_breaks JSONB,
  ADD COLUMN IF NOT EXISTS lead_time_days INT,
  ADD COLUMN IF NOT EXISTS moq INT,
  ADD COLUMN IF NOT EXISTS order_multiple INT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
  ADD COLUMN IF NOT EXISTS ncnr BOOLEAN,
  ADD COLUMN IF NOT EXISTS franchised BOOLEAN,
  ADD COLUMN IF NOT EXISTS warehouse_code TEXT;

COMMENT ON COLUMN public.api_pricing_cache.price_breaks IS
  'JSONB array: [{ min_qty, max_qty, unit_price, currency }]. Populated by new unified supplier clients (Phase 1+).';

COMMENT ON COLUMN public.api_pricing_cache.warehouse_code IS
  'Distributor-specific warehouse identifier. Lets multi-warehouse suppliers (Arrow, Newark) persist distinct quotes per location.';

COMMENT ON COLUMN public.api_pricing_cache.ncnr IS
  'Non-Cancelable / Non-Returnable flag — surfaced to users on the pricing review page.';

COMMENT ON COLUMN public.api_pricing_cache.franchised IS
  'True when the distributor sources this part through authorized manufacturer channels (matters for CSA / aerospace customers).';
