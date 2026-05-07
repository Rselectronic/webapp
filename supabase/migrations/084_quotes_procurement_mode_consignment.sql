-- ============================================================================
-- Mirror migration 070 onto the `quotes` table. 070 consolidated procurement
-- mode values to {turnkey, consignment, assembly_only} on `procurements` but
-- never touched the matching CHECK constraint on `quotes.procurement_mode`.
-- The wizard PATCH route writes 'consignment' there → CHECK violation →
-- "Failed to update quote".
-- ============================================================================

-- Backfill legacy values to the canonical 'consignment'.
UPDATE public.quotes
   SET procurement_mode = 'consignment'
 WHERE procurement_mode IN ('consign_parts_supplied', 'consign_pcb_supplied');

-- Replace the CHECK constraint.
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_procurement_mode_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_procurement_mode_check
  CHECK (procurement_mode IS NULL OR procurement_mode IN (
    'turnkey', 'consignment', 'assembly_only'
  ));
