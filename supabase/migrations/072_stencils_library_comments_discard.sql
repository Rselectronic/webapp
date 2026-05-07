ALTER TABLE public.stencils_library
  ADD COLUMN IF NOT EXISTS comments TEXT,
  ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discarded_reason TEXT,
  ADD COLUMN IF NOT EXISTS discarded_by UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.stencils_library.comments IS
  'Free-text notes about the stencil (e.g. "bottom side only valid for rev A — top side shared with rev B"). Operator-maintained. Used until a proper side-tracking schema lands.';
COMMENT ON COLUMN public.stencils_library.discarded_at IS
  'When this stencil was physically discarded. NULL = still in inventory. Discarded rows stay in the table as an audit record and their position_no is free for reuse by new stencils.';
COMMENT ON COLUMN public.stencils_library.discarded_reason IS 'Why the stencil was discarded (operator-entered).';
COMMENT ON COLUMN public.stencils_library.discarded_by IS 'User who flagged the stencil as discarded.';

-- Allow the stencil_name UNIQUE constraint to be reused by a different
-- stencil once the old one is discarded. Since discarded rows still exist,
-- we need a partial unique index filtering to active rows only.
ALTER TABLE public.stencils_library
  DROP CONSTRAINT IF EXISTS stencils_library_stencil_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS stencils_library_active_stencil_name_key
  ON public.stencils_library(stencil_name)
  WHERE discarded_at IS NULL;
