-- RS PCB Assembly ERP — Payment Tracking
-- Migration 016: payments table

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cheque', 'wire', 'eft', 'credit_card')),
  reference_number TEXT,                -- Cheque #, transaction ref, etc.
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

-- Indexes
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_date ON public.payments(payment_date);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- CEO: full access (invoices/payments are CEO-only per spec)
CREATE POLICY payments_ceo_all ON public.payments
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');
