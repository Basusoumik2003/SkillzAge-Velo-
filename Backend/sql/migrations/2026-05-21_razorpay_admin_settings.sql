-- Razorpay credentials managed from the admin panel.

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES
  ('razorpay_key_id', '', 'secret', 'Razorpay key ID used for checkout orders.', NOW(), NOW()),
  ('razorpay_key_secret', '', 'secret', 'Razorpay key secret used for checkout signatures.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
