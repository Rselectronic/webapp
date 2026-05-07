-- Physical stencil inventory. Maintained out of band via an Excel import
-- (see scripts/import-stencils-library.ts). Each row is one stencil sheet
-- on the shop shelves; one sheet may cover multiple GMPs.

CREATE TABLE IF NOT EXISTS public.stencils_library (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_no  INT,
  stencil_name TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stencils_library_gmps (
  stencil_id UUID NOT NULL REFERENCES public.stencils_library(id) ON DELETE CASCADE,
  gmp_number TEXT NOT NULL,
  PRIMARY KEY (stencil_id, gmp_number)
);

CREATE INDEX IF NOT EXISTS idx_stencils_library_gmp
  ON public.stencils_library_gmps(gmp_number);

ALTER TABLE public.stencils_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stencils_library_gmps ENABLE ROW LEVEL SECURITY;

CREATE POLICY stencils_lib_read ON public.stencils_library FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager','shop_floor')));
CREATE POLICY stencils_lib_write ON public.stencils_library FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')));

CREATE POLICY stencils_lib_gmps_read ON public.stencils_library_gmps FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager','shop_floor')));
CREATE POLICY stencils_lib_gmps_write ON public.stencils_library_gmps FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo','operations_manager')));

COMMENT ON TABLE public.stencils_library IS 'Physical stencil inventory — imported from the shop Excel. One row per stencil sheet on the shelves.';
COMMENT ON COLUMN public.stencils_library.position_no IS 'Shelf position number (column A of the source spreadsheet).';
COMMENT ON COLUMN public.stencils_library.stencil_name IS 'Stencil identifier (column B, e.g. 1118475_REV0). Unique — matches the physical label.';

COMMENT ON TABLE public.stencils_library_gmps IS 'Join table: which GMPs does each stencil sheet cover (column C of the source spreadsheet, split by ; or ,).';
COMMENT ON COLUMN public.stencils_library_gmps.gmp_number IS 'GMP number as written on the spreadsheet, trimmed. Matches gmps.gmp_number for lookup.';
