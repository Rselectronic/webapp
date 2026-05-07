-- Remove the DEFAULTs added in 053. They caused every new BOM to ship with
-- fabricated values (Double / 2 / Lead-free / 1) that the operator never
-- entered, which the BOMs list then displayed as if they were real data.
-- The columns must stay nullable — an unfilled field should render as "—"
-- until somebody explicitly sets it.

ALTER TABLE boms
  ALTER COLUMN boards_per_panel DROP DEFAULT,
  ALTER COLUMN board_side       DROP DEFAULT,
  ALTER COLUMN ipc_class        DROP DEFAULT,
  ALTER COLUMN solder_type      DROP DEFAULT;

-- Null-out rows that were inserted between 053 and 054 and therefore got
-- populated from the defaults. We can't tell those apart from rows a user
-- actually chose those exact values for, but given the defaults are the most
-- common real answer AND the feature for editing them hasn't been wired up
-- yet, any row currently carrying the default value could only have come
-- from the default. Clear them so the UI reflects reality.
UPDATE boms
SET
  boards_per_panel = NULL,
  board_side       = NULL,
  ipc_class        = NULL,
  solder_type      = NULL
WHERE
  (boards_per_panel = 1       OR boards_per_panel IS NULL)
  AND (board_side   = 'double'    OR board_side IS NULL)
  AND (ipc_class    = '2'         OR ipc_class IS NULL)
  AND (solder_type  = 'lead-free' OR solder_type IS NULL);
