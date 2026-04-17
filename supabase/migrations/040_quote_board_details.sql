-- Add board detail fields to quotes for assembly pricing
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS assembly_type TEXT DEFAULT 'TB' CHECK (assembly_type IN ('TB', 'TS', 'CS', 'CB', 'AS')),
  ADD COLUMN IF NOT EXISTS boards_per_panel INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ipc_class TEXT DEFAULT '2',
  ADD COLUMN IF NOT EXISTS solder_type TEXT DEFAULT 'lead-free';

COMMENT ON COLUMN quotes.assembly_type IS 'TB=Top+Bottom (double), TS=Top-side (single), CS=Consignment, AS=Assembly-only';
COMMENT ON COLUMN quotes.boards_per_panel IS 'Number of individual boards per panel (affects total board count)';
COMMENT ON COLUMN quotes.ipc_class IS 'IPC-A-610 class: 1=General, 2=Dedicated, 3=High Reliability';
COMMENT ON COLUMN quotes.solder_type IS 'lead-free (RoHS) or leaded';
