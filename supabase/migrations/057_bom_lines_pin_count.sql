-- Add pin_count to bom_lines.
--
-- The UI (BomTable) and the PATCH /api/bom/lines/[id] endpoint have both
-- been assuming this column exists, but no prior migration declared it.
-- Pin count on a BOM line is per-line data (the same TH part might be
-- counted differently on different BOMs if the customer's footprint
-- changed), so it lives on bom_lines rather than being looked up from
-- components every time. customer_parts.through_hole_pins is still the
-- cross-BOM memory: classifier seeds bom_lines.pin_count from there when
-- a new TH line appears.

ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS pin_count INT;

COMMENT ON COLUMN public.bom_lines.pin_count IS
  'Number of through-hole pins on this line. Required for TH parts so assembly time can be costed. Seeded from customer_parts.through_hole_pins on classify; editable by operators.';
