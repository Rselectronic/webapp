-- ============================================================================
-- 108_historic_invoices_mark_paid.sql
--
-- Backfill: mark every imported legacy invoice (is_historic = TRUE) as paid.
--
-- Why: historic invoices are pre-web-app records imported for revenue
-- continuity (Reports → Revenue, FY/tax filing). They were collected long
-- before this app existed, so by definition the customer paid them — there's
-- no scenario where a 2024 invoice imported in 2026 is still outstanding.
-- Leaving them at the import-default status was inflating the Total
-- Outstanding KPI and adding noise to the AR aging tiles (now keyed off
-- issued_date — see migration trail / page query).
--
-- Behaviour:
--   - status            → 'paid' (only when not already paid/cancelled)
--   - paid_date         → COALESCE(paid_date, issued_date) — never overwrite
--   - payment_method    → 'historic_import' when blank — visible audit hint
--                          on the invoice detail page
--
-- One-shot data migration. Idempotent: re-running is a no-op because the
-- WHERE clause filters out anything already paid or cancelled.
-- ============================================================================

UPDATE public.invoices
SET
  status = 'paid',
  paid_date = COALESCE(paid_date, issued_date, CURRENT_DATE),
  payment_method = COALESCE(payment_method, 'historic_import'),
  updated_at = NOW()
WHERE is_historic = TRUE
  AND status NOT IN ('paid', 'cancelled');
