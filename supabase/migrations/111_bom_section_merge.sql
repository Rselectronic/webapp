-- Per-line section tag. When a customer splits a board across multiple
-- files (typically SMT + TH), the parse route uploads ALL files at once
-- and writes every line into a single boms row. Each bom_lines row carries
-- the section it came from so the BOM detail page can show "this line was
-- in the SMT file, that line was in the TH file" without losing the
-- merge into one logical BOM.
ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS bom_section TEXT NOT NULL DEFAULT 'full';

ALTER TABLE public.bom_lines
  ADD CONSTRAINT bom_lines_bom_section_check
  CHECK (bom_section IN ('full', 'smt', 'th', 'other'));

-- Backfill: existing rows inherit their parent BOM's section so the
-- per-line tag is consistent with whatever was set in migration 110.
UPDATE public.bom_lines bl
SET bom_section = b.bom_section
FROM public.boms b
WHERE bl.bom_id = b.id
  AND b.bom_section IS NOT NULL
  AND bl.bom_section = 'full'
  AND b.bom_section <> 'full';

-- Track the per-file upload trail when a BOM was assembled from multiple
-- source files. Each entry: { file_name, file_path, section, component_count }.
-- For single-file uploads this stays empty (boms.file_path is the canonical
-- pointer); for multi-file uploads it lists every contributing file.
ALTER TABLE public.boms
  ADD COLUMN IF NOT EXISTS source_files JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bom_lines.bom_section IS
  'Which uploaded file this line came from. "full" = whole-board upload (default). "smt" / "th" = customer split this board across two files; both halves land on the same boms row.';

COMMENT ON COLUMN public.boms.source_files IS
  'Per-file upload trail when this BOM was assembled from multiple files. Each entry: { file_name, file_path, section, component_count }. Empty when only one file was uploaded.';
