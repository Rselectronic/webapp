-- ============================================================================
-- 104_currency_and_tax_regions.sql
--
-- Multi-currency invoicing (CAD/USD) and proper Canadian tax-by-region.
--
-- Customer ships-to province governs the tax rule:
--   QC               → 5% GST + 9.975% QST  (existing default)
--   CA_OTHER         → 5% GST only          (AB/BC/MB/SK/NT/NU/YT)
--   HST_ON           → 13% HST              (Ontario only)
--   HST_15           → 15% HST              (NB/NL/NS/PE)
--   INTERNATIONAL    → no tax               (US + ROW)
--
-- Currency: documents are billed in their native currency (CAD or USD). The
-- FX rate to CAD is captured at issue time so reports can derive CAD-
-- equivalent for tax filing without losing the original document fidelity.
--
-- Defaults are safe: every existing row gets currency='CAD', fx=1, region='QC'
-- (which preserves current behaviour exactly).
-- ============================================================================

-- ─── customers ──────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'CAD'
    CHECK (default_currency IN ('CAD', 'USD')),
  ADD COLUMN IF NOT EXISTS tax_region TEXT NOT NULL DEFAULT 'QC'
    CHECK (tax_region IN ('QC', 'CA_OTHER', 'HST_ON', 'HST_15', 'INTERNATIONAL'));

COMMENT ON COLUMN public.customers.default_currency IS
  'Default invoicing currency for this customer. Cascades to quotes/invoices at creation time.';
COMMENT ON COLUMN public.customers.tax_region IS
  'Tax jurisdiction for sales tax calculation. Snapshot onto each quote/invoice at creation; address changes do not retro-modify historic invoices.';

-- ─── quotes ─────────────────────────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CAD'
    CHECK (currency IN ('CAD', 'USD')),
  ADD COLUMN IF NOT EXISTS fx_rate_to_cad NUMERIC(10, 6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_region TEXT NOT NULL DEFAULT 'QC'
    CHECK (tax_region IN ('QC', 'CA_OTHER', 'HST_ON', 'HST_15', 'INTERNATIONAL'));

COMMENT ON COLUMN public.quotes.fx_rate_to_cad IS
  'FX rate locked at quote acceptance. 1.0 for CAD quotes; ~1.35 for USD at typical rates. Used by reports to compute CAD-equivalent.';

-- ─── invoices ───────────────────────────────────────────────────────────────
-- HST is stored separately from GST/QST so reports can break out federal vs.
-- harmonized tax. For HST regions, hst is populated and tps_gst/tvq_qst stay 0.
-- For QC, tps_gst + tvq_qst are populated and hst stays 0. For CA_OTHER, only
-- tps_gst is populated. For INTERNATIONAL, all three are 0.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CAD'
    CHECK (currency IN ('CAD', 'USD')),
  ADD COLUMN IF NOT EXISTS fx_rate_to_cad NUMERIC(10, 6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_region TEXT NOT NULL DEFAULT 'QC'
    CHECK (tax_region IN ('QC', 'CA_OTHER', 'HST_ON', 'HST_15', 'INTERNATIONAL')),
  ADD COLUMN IF NOT EXISTS hst NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.fx_rate_to_cad IS
  'FX rate snapshot at invoice issue date (Bank of Canada noon rate by default; manually overridable). Reports derive CAD-equivalent as total * fx_rate_to_cad.';
COMMENT ON COLUMN public.invoices.hst IS
  'Harmonized Sales Tax. Populated for HST_ON (13%) and HST_15 (15%) regions only. GST/QST columns are 0 in those cases.';

-- ─── payments ───────────────────────────────────────────────────────────────
-- Payments inherit the invoice's currency (you can't pay a USD invoice in
-- CAD without a separate FX-conversion record). fx_rate_to_cad on payment
-- captures the rate AT PAYMENT DATE, which differs from the invoice rate —
-- that delta is your FX gain/loss.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CAD'
    CHECK (currency IN ('CAD', 'USD')),
  ADD COLUMN IF NOT EXISTS fx_rate_to_cad NUMERIC(10, 6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.payments.fx_rate_to_cad IS
  'FX rate at payment date. Difference from invoices.fx_rate_to_cad = realized FX gain/loss. Phase-2 will post this to a GL account.';

-- ─── helpful index for revenue reporting by issued_date + currency ──────────
CREATE INDEX IF NOT EXISTS idx_invoices_issued_currency
  ON public.invoices (issued_date, currency)
  WHERE status <> 'cancelled';
