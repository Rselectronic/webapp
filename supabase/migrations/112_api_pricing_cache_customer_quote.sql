-- Customer-quote import support.
--
-- Adds three nullable fields to api_pricing_cache so a price imported from
-- a real distributor quote (emailed PDF, rep quote, WMD ad-hoc) carries the
-- metadata needed to display it distinctly in the pricing review and to
-- audit it later. The CHECK constraint on `source` was already dropped in
-- migration 058, so a new value 'customer_quote' inserts without further
-- schema work.
--
-- Why not bolt this onto the existing `manual` source? Manual prices are
-- "I typed this number in"; customer-quote rows are "we have an actual
-- quote from supplier X, ref Y, valid until Z." The review screen needs to
-- distinguish them so reviewers can tell at a glance which lines were
-- priced from a real quote vs. a hand-entered guess.

ALTER TABLE public.api_pricing_cache
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS quote_ref TEXT,
  ADD COLUMN IF NOT EXISTS valid_until DATE;

COMMENT ON COLUMN public.api_pricing_cache.supplier_name IS
  'The distributor whose quote this represents. For built-in API rows (digikey, mouser, ...) this duplicates `source`; for source=''customer_quote'' rows it identifies which distributor the customer''s quote came from (e.g. ''wmd'', ''future'', ''digikey rep'').';

COMMENT ON COLUMN public.api_pricing_cache.quote_ref IS
  'Free-text reference for the source quote (PO #, email subject, rep quote #). Surfaced in the pricing review badge tooltip.';

COMMENT ON COLUMN public.api_pricing_cache.valid_until IS
  'Quote expiry date as stated by the distributor. Once past, the pricing review surfaces a warning so the operator knows to re-quote.';
