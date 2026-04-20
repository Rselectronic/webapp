-- Wizard + procurement-mode fields on the quotes table.
--
--   wizard_status     — tracks how far the user got through the 3-step wizard.
--                       Lets us resume on refresh and skip finished steps.
--   procurement_mode  — orthogonal to the existing `assembly_type` (which was
--                       a mix of physical orientation and procurement style).
--                       Drives which wizard steps are actually shown:
--                         turnkey                  → Step 2 + Step 3 (PCB)
--                         consign_parts_supplied   → skip Step 2; Step 3 PCB
--                         consign_pcb_supplied     → Step 2; no PCB price input
--                         assembly_only            → skip Step 2; no PCB price
--   pinned_preference — the pricing_preferences.id chosen for this quote's
--                       auto-pick pass on the component pricing step. NULL
--                       when the user hasn't applied a rule yet.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS wizard_status TEXT
    DEFAULT 'draft'
    CHECK (wizard_status IN ('draft', 'quantities_done', 'pricing_done', 'complete')),
  ADD COLUMN IF NOT EXISTS procurement_mode TEXT
    CHECK (procurement_mode IN (
      'turnkey',
      'consign_parts_supplied',
      'consign_pcb_supplied',
      'assembly_only'
    )),
  ADD COLUMN IF NOT EXISTS pinned_preference UUID REFERENCES public.pricing_preferences(id);

CREATE INDEX IF NOT EXISTS idx_quotes_wizard_status
  ON public.quotes(wizard_status);

COMMENT ON COLUMN public.quotes.wizard_status IS
  'Progress through the 3-step quote wizard. Existing non-wizard quotes default to ''complete''.';

COMMENT ON COLUMN public.quotes.procurement_mode IS
  'Who procures what. Replaces the overloaded `assembly_type` field for the wizard flow; old quotes may have this NULL.';

-- Backfill existing quotes as "complete" so they don't show up in any
-- in-progress wizard list when we add it.
UPDATE public.quotes SET wizard_status = 'complete' WHERE wizard_status IS NULL OR wizard_status = 'draft';
