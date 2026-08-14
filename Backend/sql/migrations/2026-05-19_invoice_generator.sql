-- Admin invoice generation and history.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number VARCHAR(80) NOT NULL UNIQUE,
  invoice_sequence INTEGER NOT NULL,
  invoice_period VARCHAR(20) NOT NULL,
  user_id UUID NOT NULL,
  payment_id INTEGER,
  provider_payment_id VARCHAR(120) NOT NULL DEFAULT '',
  subtotal_amount_paisa INTEGER NOT NULL DEFAULT 0,
  coupon_code VARCHAR(40) NOT NULL DEFAULT '',
  coupon_discount_paisa INTEGER NOT NULL DEFAULT 0,
  recipient_name VARCHAR(160) NOT NULL,
  recipient_address TEXT NOT NULL DEFAULT '',
  recipient_contact VARCHAR(40) NOT NULL DEFAULT '',
  recipient_email VARCHAR(160) NOT NULL DEFAULT '',
  program_name TEXT NOT NULL,
  project_credit INTEGER NOT NULL DEFAULT 1,
  credit_label VARCHAR(80) NOT NULL DEFAULT 'One',
  access_duration VARCHAR(120) NOT NULL DEFAULT '3 Months Fixed Term',
  platform_url TEXT NOT NULL DEFAULT 'https://www.internzbee.in',
  nature_of_service TEXT NOT NULL DEFAULT 'Online + Weekly Session Service',
  sac_code VARCHAR(20) NOT NULL DEFAULT '999249',
  place_of_supply VARCHAR(120) NOT NULL DEFAULT 'Odisha (21)',
  transaction_type TEXT NOT NULL DEFAULT 'Intra-State (CGST + SGST)',
  taxable_amount_paisa INTEGER NOT NULL,
  cgst_paisa INTEGER NOT NULL DEFAULT 0,
  sgst_paisa INTEGER NOT NULL DEFAULT 0,
  igst_paisa INTEGER NOT NULL DEFAULT 0,
  gross_amount_paisa INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_pdf_url TEXT NOT NULL DEFAULT '',
  invoice_pdf_public_id TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  emailed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_invoices_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT chk_invoices_project_credit CHECK (project_credit > 0),
  CONSTRAINT chk_invoices_status CHECK (status IN ('generated', 'emailed', 'void'))
);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_pdf_public_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS ix_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS ix_invoices_created_at ON invoices(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_period_sequence
  ON invoices(invoice_period, invoice_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_payment_id
  ON invoices(payment_id)
  WHERE payment_id IS NOT NULL;

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES
  ('invoice_company_name', 'Learning Bee Education Private Limited', 'string', 'Invoice company legal name.', NOW(), NOW()),
  ('invoice_registered_office', 'Reta Valley Apartment, Flat No: 212, Block B2, Gudiapokhari,
Puri 752104, Odisha.
GSTIN: 21AAAAAX0000A1Z1
State Code: 21 (Odisha)
Email: billing@skillzage.com', 'string', 'Invoice registered office address.', NOW(), NOW()),
  ('invoice_gstin', '21AAAAAX0000A1Z1', 'string', 'Invoice GSTIN.', NOW(), NOW()),
  ('invoice_state_code', '21 (Odisha)', 'string', 'Invoice company state code.', NOW(), NOW()),
  ('invoice_email', 'billing@skillzage.com', 'string', 'Invoice billing email.', NOW(), NOW()),
  ('invoice_platform_url', 'https://www.internzbee.in', 'string', 'Invoice platform URL.', NOW(), NOW()),
  ('invoice_nature_of_service', 'Online + Weekly Session Service', 'string', 'Invoice service nature.', NOW(), NOW()),
  ('invoice_sac_code', '999249', 'string', 'Invoice SAC code.', NOW(), NOW()),
  ('invoice_place_of_supply', 'Odisha (21)', 'string', 'Default invoice place of supply.', NOW(), NOW()),
  ('invoice_transaction_type', 'Intra-State (CGST + SGST)', 'string', 'Default invoice transaction type.', NOW(), NOW()),
  ('invoice_program_name', 'Internship Simulation Program', 'string', 'Default invoice program.', NOW(), NOW()),
  ('invoice_access_duration', '3 Months Fixed Term', 'string', 'Default invoice access duration.', NOW(), NOW()),
  ('invoice_credit_1_amount_paisa', '350000', 'integer', 'Invoice taxable value for one project credit.', NOW(), NOW()),
  ('invoice_credit_2_amount_paisa', '600000', 'integer', 'Invoice taxable value for two project credits.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
