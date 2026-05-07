-- Migration 074 backfilled gmps board details from boms, but on environments
-- where the operator only ever entered those values via the quote wizard
-- (calculate route saved them to quotes.* before we mirrored to boms.*),
-- the boms columns are blank and the GMP ends up empty even though the
-- values are sitting on a prior quote.
--
-- This migration adds a second backfill pass that lifts each value from the
-- most recent non-null quote under the same GMP. Runs after 074 so any value
-- already set on the GMP (from boms) wins.

UPDATE gmps g
SET boards_per_panel = sub.boards_per_panel
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, boards_per_panel
  FROM quotes
  WHERE boards_per_panel IS NOT NULL
  ORDER BY gmp_id, updated_at DESC NULLS LAST, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.boards_per_panel IS NULL;

-- quotes.assembly_type uses TB/TS/CS/CB/AS; gmps.board_side is single/double.
-- Only TB and TS map cleanly; consignment / customer-board / assembly-only
-- modes don't say anything about the physical board side, so skip them.
UPDATE gmps g
SET board_side = CASE sub.assembly_type
  WHEN 'TB' THEN 'double'
  WHEN 'TS' THEN 'single'
END
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, assembly_type
  FROM quotes
  WHERE assembly_type IN ('TB', 'TS')
  ORDER BY gmp_id, updated_at DESC NULLS LAST, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.board_side IS NULL;

-- quotes.ipc_class is INT (1/2/3); gmps.ipc_class is TEXT ('1'/'2'/'3').
UPDATE gmps g
SET ipc_class = sub.ipc_class::text
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, ipc_class
  FROM quotes
  WHERE ipc_class IN (1, 2, 3)
  ORDER BY gmp_id, updated_at DESC NULLS LAST, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.ipc_class IS NULL;

-- quotes.solder_type uses 'leadfree'; gmps.solder_type uses 'lead-free'.
UPDATE gmps g
SET solder_type = CASE sub.solder_type
  WHEN 'leaded'   THEN 'leaded'
  WHEN 'leadfree' THEN 'lead-free'
  WHEN 'lead-free' THEN 'lead-free'
END
FROM (
  SELECT DISTINCT ON (gmp_id) gmp_id, solder_type
  FROM quotes
  WHERE solder_type IN ('leaded', 'leadfree', 'lead-free')
  ORDER BY gmp_id, updated_at DESC NULLS LAST, created_at DESC
) sub
WHERE g.id = sub.gmp_id AND g.solder_type IS NULL;
