-- =====================================================================
-- Migration 051: Add MPN + alt-MPN columns to public.components
-- =====================================================================
--
-- Context:
--   public.components is the web app's "manual machine code" store — the
--   master component library that holds RS's verified M-Code classifications
--   for each part. It will eventually absorb the user's ~11k historical
--   parts CSV ("part number to use" spreadsheet from the Excel system).
--
-- Why cpc is the lookup key (not mpn):
--   In migration 049 (049_components_rename_mpn_to_cpc.sql) the column
--   formerly named `mpn` on public.components was renamed to `cpc`. The
--   reason: in RS's workflow the Customer Part Code (CPC) is the stable
--   lookup identifier used across BOMs, procurement, and pricing — the raw
--   manufacturer part number on a customer BOM is often EOL, custom, or
--   mis-typed, so it cannot be trusted as the primary key into the
--   component library. `cpc` stays the unique lookup key.
--
-- What this migration adds:
--   Three new nullable text columns that let each component row record both
--   the original MPN the customer gave us AND the substitute MPN RS actually
--   buys against ("part number to use" in the legacy Excel system):
--
--     mpn             — original manufacturer part number as it appeared on
--                       the customer BOM. NOT a lookup key, NOT unique —
--                       multiple components may share the same printed MPN
--                       across customers/revisions. Purely informational /
--                       traceability.
--
--     alt_mpn         — RS-verified substitute MPN used for pricing lookups
--                       (DigiKey / Mouser / LCSC) when the original MPN is
--                       EOL, custom, private-label, or otherwise not findable
--                       on distributor APIs. This is the "part number to use"
--                       value from the legacy Excel system.
--
--     alt_mpn_reason  — short free-text explanation of why a substitute is in
--                       use. Examples: "original EOL on DigiKey", "custom PN
--                       — equivalent 0603 10k 1%", "customer private label,
--                       sourced generic".
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS so re-running is safe.
-- No indexes added — these columns are not lookup keys. Follow-on code
-- (pricing lookups preferring alt_mpn, 11k CSV import) is a separate step.
-- =====================================================================

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS mpn TEXT;

COMMENT ON COLUMN public.components.mpn IS
  'Original manufacturer part number as supplied by the customer on the BOM. '
  'Nullable, NOT unique, NOT a lookup key — cpc remains the lookup key (see migration 049). '
  'Informational / traceability only.';

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS alt_mpn TEXT;

COMMENT ON COLUMN public.components.alt_mpn IS
  'RS-verified substitute MPN used for distributor pricing lookups (DigiKey/Mouser/LCSC) '
  'when the original mpn is EOL, custom, or not findable. Equivalent to the '
  '"part number to use" column in the legacy Excel system.';

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS alt_mpn_reason TEXT;

COMMENT ON COLUMN public.components.alt_mpn_reason IS
  'Short free-text explanation of why alt_mpn was chosen over mpn. '
  'Examples: "original EOL on DigiKey", "custom PN — equivalent 0603 10k 1%".';
