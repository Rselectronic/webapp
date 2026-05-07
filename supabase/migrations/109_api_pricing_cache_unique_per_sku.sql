-- Distributors like Newark return multiple SKUs for the same MPN (e.g.
-- PMEG3020EJ,115 → 34R4560 / 35AH4828 / 01AM0319). Each SKU has its own
-- stock, lead time, MOQ, and price. The original UNIQUE(source, search_key)
-- collapsed all SKUs into a single cache row — the last write won, so the
-- in-stock SKU was silently overwritten by a zero-stock variant and made
-- invisible to auto-pick.
--
-- Move the uniqueness key down to the SKU level: (source, search_key,
-- supplier_part_number, warehouse_code). PostgreSQL 15+ NULLS NOT DISTINCT
-- treats two NULLs as equal, so negative-cache rows (no SPN, no warehouse)
-- still dedupe correctly.

ALTER TABLE public.api_pricing_cache
  DROP CONSTRAINT IF EXISTS api_pricing_cache_source_search_key_key;

ALTER TABLE public.api_pricing_cache
  ADD CONSTRAINT api_pricing_cache_source_key_spn_wh_unique
  UNIQUE NULLS NOT DISTINCT (source, search_key, supplier_part_number, warehouse_code);
