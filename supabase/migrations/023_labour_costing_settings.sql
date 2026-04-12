-- Labour costing settings (TIME File V11 equivalent)
--
-- Adds new fields to the existing 'pricing' key in app_settings:
--   - smt_rate_per_hour: SMT machine rate (default $165/hr from VBA)
--   - nre_programming: Programming fees NRE
--   - nre_stencil: Stencil fees NRE
--   - nre_setup: Setup fees NRE
--   - nre_pcb_fab: PCB fabrication NRE
--   - nre_misc: Misc NRE
--   - setup_time_hours: Default setup time per job
--   - programming_time_hours: Default programming time per job
--
-- These are JSONB fields merged into the existing 'pricing' settings row.
-- The web app merges with defaults so this migration only needs to add
-- the new fields without overwriting existing values.

UPDATE public.app_settings
SET value = value || '{
  "smt_rate_per_hour": 165,
  "nre_programming": 100,
  "nre_stencil": 100,
  "nre_setup": 100,
  "nre_pcb_fab": 0,
  "nre_misc": 50,
  "setup_time_hours": 1,
  "programming_time_hours": 1
}'::jsonb
WHERE key = 'pricing'
  AND NOT (value ? 'smt_rate_per_hour');
