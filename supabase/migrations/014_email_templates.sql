-- RS PCB Assembly ERP — Email Templates System
-- Migration 013: email_templates table + seed data

-- ============================================
-- EMAIL_TEMPLATES
-- ============================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,                   -- Supports {{variable}} placeholders
  category TEXT NOT NULL CHECK (category IN ('quote', 'invoice', 'shipping', 'procurement', 'general')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup by category
CREATE INDEX idx_email_templates_category ON public.email_templates(category);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- CEO: full access
CREATE POLICY email_templates_ceo_all ON public.email_templates
  FOR ALL
  USING (public.get_user_role() = 'ceo')
  WITH CHECK (public.get_user_role() = 'ceo');

-- Operations Manager: read + create + update
CREATE POLICY email_templates_ops_select ON public.email_templates
  FOR SELECT
  USING (public.get_user_role() = 'operations_manager');

CREATE POLICY email_templates_ops_insert ON public.email_templates
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'operations_manager');

CREATE POLICY email_templates_ops_update ON public.email_templates
  FOR UPDATE
  USING (public.get_user_role() = 'operations_manager')
  WITH CHECK (public.get_user_role() = 'operations_manager');

-- ============================================
-- SEED TEMPLATES
-- ============================================
INSERT INTO public.email_templates (name, subject, body, category) VALUES
(
  'Quote Submission',
  'RS PCB Assembly — Quotation {{quote_number}} for {{customer_name}}',
  'Dear {{contact_name}},

Thank you for your interest in RS PCB Assembly services.

Please find attached our quotation {{quote_number}} for the assembly of {{gmp_number}}{{board_name}}.

Quotation Summary:
- Board: {{gmp_number}}
- Quantities quoted: {{quantities}}
- Valid until: {{expiry_date}}

Please do not hesitate to contact us if you have any questions or require modifications.

Best regards,
Anas Patel
R.S. Électronique Inc.
+1 (438) 833-8477
info@rspcbassembly.com',
  'quote'
),
(
  'Invoice Reminder',
  'RS PCB Assembly — Invoice {{invoice_number}} Payment Reminder',
  'Dear {{contact_name}},

This is a friendly reminder that invoice {{invoice_number}} in the amount of {{total_amount}} was issued on {{issued_date}} and is due on {{due_date}}.

Invoice Details:
- Invoice #: {{invoice_number}}
- Job #: {{job_number}}
- Amount Due: {{total_amount}}
- Due Date: {{due_date}}

Payment can be made via wire transfer or cheque. Please contact us if you have any questions regarding this invoice.

Thank you for your continued business.

Best regards,
Anas Patel
R.S. Électronique Inc.
+1 (438) 833-8477
info@rspcbassembly.com',
  'invoice'
),
(
  'Shipping Notification',
  'RS PCB Assembly — Shipment Notification for Job {{job_number}}',
  'Dear {{contact_name}},

We are pleased to inform you that your order has been shipped.

Shipment Details:
- Job #: {{job_number}}
- Board: {{gmp_number}}
- Quantity: {{quantity}}
- Carrier: {{carrier}}
- Tracking #: {{tracking_number}}
- Ship Date: {{ship_date}}
- Estimated Delivery: {{estimated_delivery}}

Please find the packing slip and certificate of compliance attached.

Best regards,
Anas Patel
R.S. Électronique Inc.
+1 (438) 833-8477
info@rspcbassembly.com',
  'shipping'
),
(
  'PO Confirmation',
  'RS PCB Assembly — Purchase Order {{po_number}} Confirmation',
  'Dear {{supplier_contact}},

Please find attached purchase order {{po_number}} for the following components.

PO Summary:
- PO #: {{po_number}}
- Total Amount: {{total_amount}}
- Required By: {{required_date}}

Please confirm receipt of this order and provide estimated delivery dates.

Thank you,
Piyush Tayal
R.S. Électronique Inc.
orders@rspcbassembly.com',
  'procurement'
),
(
  'Payment Receipt',
  'RS PCB Assembly — Payment Received for Invoice {{invoice_number}}',
  'Dear {{contact_name}},

Thank you for your payment. We confirm receipt of {{payment_amount}} for invoice {{invoice_number}}.

Payment Details:
- Invoice #: {{invoice_number}}
- Amount Received: {{payment_amount}}
- Payment Date: {{payment_date}}
- Payment Method: {{payment_method}}
- Remaining Balance: {{remaining_balance}}

Thank you for your continued business.

Best regards,
Anas Patel
R.S. Électronique Inc.
+1 (438) 833-8477
info@rspcbassembly.com',
  'invoice'
);
