-- Add board-level details to boms. These describe the physical PCB and
-- belong with the BOM/GMP, not the quote. The quotes table still carries
-- its own copies because a given quote can override (e.g. run a 2-layer
-- board at IPC Class 3 for a customer sample) but the BOMs listing reads
-- these directly so operators can scan the fleet at a glance.

ALTER TABLE boms
  ADD COLUMN IF NOT EXISTS boards_per_panel INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS board_side TEXT CHECK (board_side IN ('single', 'double')) DEFAULT 'double',
  ADD COLUMN IF NOT EXISTS ipc_class TEXT CHECK (ipc_class IN ('1', '2', '3')) DEFAULT '2',
  ADD COLUMN IF NOT EXISTS solder_type TEXT CHECK (solder_type IN ('leaded', 'lead-free')) DEFAULT 'lead-free';

COMMENT ON COLUMN boms.boards_per_panel IS 'Number of individual boards per manufactured panel.';
COMMENT ON COLUMN boms.board_side IS 'single = one-sided SMT, double = top + bottom SMT.';
COMMENT ON COLUMN boms.ipc_class IS 'IPC-A-610 class: 1=General, 2=Dedicated, 3=High Reliability.';
COMMENT ON COLUMN boms.solder_type IS 'leaded or lead-free (RoHS).';
