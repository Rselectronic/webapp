-- Rename components.mpn → components.cpc.
-- The components table is used by the M-Code classifier as its Layer-1 lookup.
-- The BOM carries a CPC (Customer Part Code) per line; when no CPC column is
-- provided by the customer, the importer falls back to the MPN. Either way,
-- the key we want to match on is the customer-facing CPC.

ALTER TABLE public.components RENAME COLUMN mpn TO cpc;

-- Rebuild the unique constraint on the renamed column.
ALTER TABLE public.components DROP CONSTRAINT IF EXISTS components_mpn_manufacturer_key;
ALTER TABLE public.components
  ADD CONSTRAINT components_cpc_manufacturer_key UNIQUE (cpc, manufacturer);

-- Rename the supporting index so tooling stays consistent with the column.
ALTER INDEX IF EXISTS idx_components_mpn RENAME TO idx_components_cpc;
