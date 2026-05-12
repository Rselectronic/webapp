-- Add bom_section to support customers who split a single board's BOM into
-- multiple files (most commonly Through-Hole + SMT). Each BOM under a given
-- GMP carries a section tag so downstream code can merge them when pricing
-- or producing the board.
ALTER TABLE public.boms
  ADD COLUMN IF NOT EXISTS bom_section TEXT NOT NULL DEFAULT 'full';

ALTER TABLE public.boms
  ADD CONSTRAINT boms_bom_section_check
  CHECK (bom_section IN ('full', 'smt', 'th', 'other'));

COMMENT ON COLUMN public.boms.bom_section IS
  'Scope of this BOM file. "full" = entire board (default). "smt" / "th" = customer split the board across two files. "other" = catch-all (e.g. mechanical-only).';
