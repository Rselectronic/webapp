-- ============================================================================
-- 105_address_country_codes_and_invoice_billing_snapshot.sql
--
-- Two related changes:
--
-- 1) Backfill country_code into customers.billing_addresses + shipping_addresses
--    JSONB. The address-form redesign stores ISO country codes ('CA', 'US',
--    'OTHER') alongside the legacy free-text country field. Existing rows that
--    only have free-text country need country_code populated so the new UI
--    can render their province dropdown correctly.
--
-- 2) Snapshot the BILLING ADDRESS used for each quote and invoice. Tax region
--    + currency are now derived from the address you billed to, not from a
--    customer-level default. We store the full resolved address as JSONB so
--    that future edits to the customer record never retro-mutate historic
--    documents.
--
-- The derived tax_region / currency columns added in migration 104 stay —
-- they're now populated FROM the snapshotted address rather than from the
-- customer record.
-- ============================================================================

-- ─── 1) Backfill country_code in customer addresses ─────────────────────────
-- For each address object missing 'country_code', synthesise one from the
-- 'country' free-text. We only handle the common spellings of CA / US;
-- anything else falls through to 'OTHER'. Customers can later open the
-- edit form and pick the correct country.

UPDATE public.customers
SET billing_addresses = (
  SELECT jsonb_agg(
    CASE
      WHEN addr ? 'country_code' THEN addr
      ELSE addr || jsonb_build_object(
        'country_code',
        CASE
          WHEN UPPER(COALESCE(addr->>'country', '')) IN ('CA', 'CAN', 'CANADA') THEN 'CA'
          WHEN UPPER(COALESCE(addr->>'country', '')) IN ('US', 'USA', 'U.S.', 'U.S.A.', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN 'US'
          WHEN COALESCE(addr->>'country', '') = '' THEN 'CA'
          ELSE 'OTHER'
        END
      )
    END
  )
  FROM jsonb_array_elements(COALESCE(billing_addresses, '[]'::jsonb)) AS addr
)
WHERE jsonb_typeof(billing_addresses) = 'array'
  AND jsonb_array_length(billing_addresses) > 0;

UPDATE public.customers
SET shipping_addresses = (
  SELECT jsonb_agg(
    CASE
      WHEN addr ? 'country_code' THEN addr
      ELSE addr || jsonb_build_object(
        'country_code',
        CASE
          WHEN UPPER(COALESCE(addr->>'country', '')) IN ('CA', 'CAN', 'CANADA') THEN 'CA'
          WHEN UPPER(COALESCE(addr->>'country', '')) IN ('US', 'USA', 'U.S.', 'U.S.A.', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN 'US'
          WHEN COALESCE(addr->>'country', '') = '' THEN 'CA'
          ELSE 'OTHER'
        END
      )
    END
  )
  FROM jsonb_array_elements(COALESCE(shipping_addresses, '[]'::jsonb)) AS addr
)
WHERE jsonb_typeof(shipping_addresses) = 'array'
  AND jsonb_array_length(shipping_addresses) > 0;

-- ─── 2) Billing-address snapshot on quotes + invoices ───────────────────────
-- A small JSONB column that captures the full address the document was
-- billed to. Future edits to the customer never affect historic documents.
-- Shape (matches the address objects in customers.billing_addresses):
--   { label, street, city, province, postal_code, country, country_code, is_default }

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS billing_address JSONB;
COMMENT ON COLUMN public.quotes.billing_address IS
  'Snapshot of the billing address used for this quote. Drives tax_region + currency. Immutable once set — protects historic figures from customer-record edits.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_address JSONB;
COMMENT ON COLUMN public.invoices.billing_address IS
  'Snapshot of the billing address the invoice was issued to. Drives tax_region + currency at creation. Never re-derived from the customer record.';
