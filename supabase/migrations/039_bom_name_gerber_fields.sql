-- Add BOM display name and Gerber fields to boms table
ALTER TABLE boms
  ADD COLUMN IF NOT EXISTS bom_name TEXT,
  ADD COLUMN IF NOT EXISTS gerber_name TEXT,
  ADD COLUMN IF NOT EXISTS gerber_revision TEXT;

COMMENT ON COLUMN boms.bom_name IS 'User-editable display name for this BOM (defaults to uploaded filename)';
COMMENT ON COLUMN boms.gerber_name IS 'Associated Gerber file/folder name';
COMMENT ON COLUMN boms.gerber_revision IS 'Gerber revision/version';
