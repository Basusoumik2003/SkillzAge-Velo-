-- Payment ledger for dashboard/project access purchases
-- Keeps detailed provider records while preserving users.has_paid as the fast access flag.

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(120),
  provider_payment_id VARCHAR(120),
  amount_paisa INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  purpose VARCHAR(50) NOT NULL DEFAULT 'dashboard_access',
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT ck_payments_amount_positive
    CHECK (amount_paisa > 0)
);

CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS ix_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS ix_payments_purpose ON payments(purpose);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_order_id
  ON payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
  ON payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
