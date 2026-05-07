-- Move board-level details (boards_per_panel, board_side, ipc_class,
-- solder_type) from boms onto the GMP. These describe the physical
-- product, not a single BOM revision — every BOM uploaded under the same
-- GMP is the same physical board, so the operator should fill these once
-- per GMP and have them auto-apply to every future BOM and quote.
--
-- The boms columns stay in place (read-only legacy) so we don't have to
-- coordinate a multi-step rollout. New writes go to gmps; reads fall back
-- to gmps with the boms columns ignored.

ALTER TABLE gmps
  ADD COLUMN IF NOT EXISTS boards_per_panel INT,
  ADD COLUMN IF NOT EXISTS board_side  TEXT CHECK (board_side IN ('single', 'double')),
  ADD COLUMN IF NOT EXISTS ipc_class   TEXT CHECK (ipc_class IN ('1', '2', '3')),
  ADD COLUMN IF NOT EXISTS solder_type TEXT CHECK (solder_type IN ('leaded', 'lead-free'));

COMMENT ON COLUMN gmps.boards_per_panel IS 'Number of individual boards per manufactured panel.';
COMMENT ON COLUMN gmps.board_side       IS 'single = one-sided SMT, double = top + bottom SMT.';
COMMENT ON COLUMN gmps.ipc_class        IS 'IPC-A-610 class: 1=General, 2=Dedicated, 3=High Reliability.';
COMMENT ON COLUMN gmps.solder_type      IS 'leaded or lead-free (RoHS).';

-- Backfill: for each GMP, lift the most recent non-null value from any of
-- its existing BOMs. Done per column so a partial fill on one BOM still
-- contributes whatever it has, even if a more-recent BOM left the field
-- blank.
UPDATE gmps g
SET boards_per_panel = sub.boards_per_panel
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, boards_per_panel
  FROM boms
  WHERE boards_per_panel IS NOT NULL
  ORDER BY gmp_id, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.boards_per_panel IS NULL;

UPDATE gmps g
SET board_side = sub.board_side
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, board_side
  FROM boms
  WHERE board_side IS NOT NULL
  ORDER BY gmp_id, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.board_side IS NULL;

UPDATE gmps g
SET ipc_class = sub.ipc_class
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, ipc_class
  FROM boms
  WHERE ipc_class IS NOT NULL
  ORDER BY gmp_id, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.ipc_class IS NULL;

UPDATE gmps g
SET solder_type = sub.solder_type
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, solder_type
  FROM boms
  WHERE solder_type IS NOT NULL
  ORDER BY gmp_id, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.solder_type IS NULL;
