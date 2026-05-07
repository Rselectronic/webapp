-- 066_procurement_line_selection_order_status.sql
--
-- Adds order tracking to procurement_line_selections so operators can record
-- whether they've actually purchased the distributor-selected MPN yet.
--
-- Forward compatibility: future distributor buy-API integrations (DigiKey
-- MyLists / cart-submit, Mouser CartAPI, LCSC order API, etc.) will flip
-- order_status automatically and populate order_external_id with the
-- distributor's order/PO reference and ordered_at with the submit timestamp.
-- For now it's operator-driven.

ALTER TABLE public.procurement_line_selections
  ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'not_ordered'
    CHECK (order_status IN ('not_ordered','ordered','shipped','received','cancelled')),
  ADD COLUMN IF NOT EXISTS order_external_id TEXT,
  ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.procurement_line_selections.order_status IS
  'Order lifecycle for this PROC+MPN selection. Operator-driven today; distributor buy APIs will flip this automatically in the future. One of: not_ordered, ordered, shipped, received, cancelled.';
COMMENT ON COLUMN public.procurement_line_selections.order_external_id IS
  'External reference id from the distributor once an order is placed (e.g. DigiKey SalesOrderId, Mouser CartKey/OrderNumber). Null until ordered.';
COMMENT ON COLUMN public.procurement_line_selections.ordered_at IS
  'Timestamp when order_status first transitioned to ordered. Set by operator or buy-API integration.';
