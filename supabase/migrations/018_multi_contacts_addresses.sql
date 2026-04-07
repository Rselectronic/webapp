-- RS PCB Assembly ERP — Multiple Contacts & Addresses per Customer
-- Migration 018: Add contacts, billing_addresses, shipping_addresses JSONB arrays

-- Add new JSONB array columns
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS billing_addresses JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS shipping_addresses JSONB DEFAULT '[]';

-- Migrate existing single contact into contacts array
UPDATE public.customers
SET contacts = jsonb_build_array(
  jsonb_build_object(
    'name', COALESCE(contact_name, ''),
    'email', COALESCE(contact_email, ''),
    'phone', COALESCE(contact_phone, ''),
    'role', 'Sales Rep',
    'is_primary', true
  )
)
WHERE contact_name IS NOT NULL OR contact_email IS NOT NULL OR contact_phone IS NOT NULL;

-- Migrate existing billing_address into billing_addresses array
UPDATE public.customers
SET billing_addresses = jsonb_build_array(
  billing_address || jsonb_build_object('label', 'Primary', 'is_default', true)
)
WHERE billing_address IS NOT NULL AND billing_address != '{}'::jsonb;

-- Migrate existing shipping_address into shipping_addresses array
UPDATE public.customers
SET shipping_addresses = jsonb_build_array(
  shipping_address || jsonb_build_object('label', 'Primary', 'is_default', true)
)
WHERE shipping_address IS NOT NULL AND shipping_address != '{}'::jsonb;
