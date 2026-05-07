-- ============================================================================
-- 097_shipments_customer_pickup.sql
--
-- Allow shipments where the customer collects boards from the facility
-- in person. Two minimal changes:
--
--   1. Add 'Customer Pickup' to the carrier CHECK constraint.
--   2. Add a `picked_up_by` text column for the receiver's name (no
--      signature image — the user confirmed customers don't sign the
--      packing slip; this is just the paper trail).
--
-- No new shipment status is needed: pickups skip the in-transit stage
-- and land directly at 'delivered' the moment the customer walks out.
-- The API enforces that mapping.
-- ============================================================================

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS picked_up_by TEXT;

COMMENT ON COLUMN public.shipments.picked_up_by IS
  'Name of the person who collected the boards. Set when carrier = Customer Pickup; null for courier shipments.';

-- Replace the carrier CHECK constraint with the wider list.
ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_carrier_check;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_carrier_check
  CHECK (carrier IN ('FedEx', 'Purolator', 'UPS', 'Canada Post', 'Customer Pickup', 'Other'));
