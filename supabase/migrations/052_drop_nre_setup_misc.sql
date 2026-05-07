-- Remove nre_setup / nre_misc from the pricing settings JSON blob.
-- Only three NRE types remain: programming, stencil, pcb_fab.
UPDATE public.app_settings
SET value = value
            - 'nre_setup'
            - 'nre_misc'
WHERE key = 'pricing'
  AND (value ? 'nre_setup' OR value ? 'nre_misc');
