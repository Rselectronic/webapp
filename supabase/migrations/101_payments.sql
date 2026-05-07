-- ============================================================================
-- Migration 101 — Payments: bring schema to spec for partial-payment support
-- ============================================================================
-- A `payments` table was first introduced in 017_payments.sql with a single-
-- payment-per-invoice mental model. This migration evolves it into a true
-- ledger-style table where one invoice can receive many partial payments and
-- `invoices.status` is derived from SUM(payments.amount) >= invoices.total.
--
-- Changes:
--   1. Rename `payment_method` → `method`, `reference_number` → `reference`,
--      `created_by` → `recorded_by` (matches spec; aligns with shipments).
--   2. Add CHECK (amount > 0) — payments are positive money in.
--   3. Expand `method` enum to include 'cash' and 'other' (real-world cheques
--      get hand-delivered as cash on occasion).
--   4. Add `updated_at` for parity with the rest of the schema.
--   5. Backfill from existing invoices.status='paid' rows so the ledger never
--      lies about a fully-paid legacy invoice.
--
-- Idempotent: each ALTER is guarded so re-running is a no-op.
-- ============================================================================

-- ── 1. Rename legacy columns ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='payment_method'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='method'
  ) THEN
    ALTER TABLE public.payments RENAME COLUMN payment_method TO method;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='reference_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='reference'
  ) THEN
    ALTER TABLE public.payments RENAME COLUMN reference_number TO reference;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments'
      AND column_name='recorded_by'
  ) THEN
    ALTER TABLE public.payments RENAME COLUMN created_by TO recorded_by;
  END IF;
END $$;

-- ── 2. Tighten amount with a positive-only CHECK ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.payments'::regclass
      AND conname='payments_amount_positive_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_positive_check CHECK (amount > 0);
  END IF;
END $$;

-- ── 3. Expand the method CHECK to include 'cash' and 'other' ────────────────
DO $$
DECLARE
  c text;
BEGIN
  -- Drop whatever we currently have on `method` (legacy name is
  -- payments_payment_method_check; if RENAME COLUMN happened in this migration
  -- the constraint name still references payment_method).
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.payments'::regclass
      AND contype='c'
      AND (conname='payments_payment_method_check'
           OR conname='payments_method_check')
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', c);
  END LOOP;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_method_check
    CHECK (method IN ('cheque','wire','eft','credit_card','cash','other'));
END $$;

-- ── 4. Ensure NOT NULL on method (the original CHECK already implied it,
--      but a renamed column may have lost the NOT NULL on some clusters) ────
ALTER TABLE public.payments ALTER COLUMN method SET NOT NULL;

-- ── 5. Add updated_at ───────────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- And tighten created_at default + NOT NULL to match the rest of the schema.
ALTER TABLE public.payments ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.payments ALTER COLUMN created_at SET NOT NULL;

-- ── 6. Indexes (idempotent) ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);

-- ── 7. RLS — admin-only (mirrors invoices) ──────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop any pre-existing policies so the final state is exactly:
  --   payments_admin_all  USING is_admin()  WITH CHECK is_admin()
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid='public.payments'::regclass
      AND polname='payments_admin_all'
  ) THEN
    DROP POLICY payments_admin_all ON public.payments;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid='public.payments'::regclass
      AND polname='payments_ceo_all'
  ) THEN
    DROP POLICY payments_ceo_all ON public.payments;
  END IF;
END $$;

CREATE POLICY payments_admin_all ON public.payments
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 8. Backfill from invoices that were marked paid the legacy way ──────────
-- Only insert rows that don't already have a corresponding payment for the
-- same invoice — re-running the migration must be a no-op.
INSERT INTO public.payments (
  invoice_id, amount, payment_date, method, reference, recorded_by, notes
)
SELECT
  i.id,
  i.total,
  i.paid_date,
  CASE
    WHEN i.payment_method IN ('cheque','wire','eft','credit_card','cash','other')
      THEN i.payment_method
    ELSE 'other'
  END,
  'Backfill from invoices.payment_method',
  NULL,
  'Backfilled by migration 101 — single payment event for legacy mark-paid'
FROM public.invoices i
WHERE i.status = 'paid'
  AND i.paid_date IS NOT NULL
  AND i.total IS NOT NULL
  AND i.total > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id
  );
