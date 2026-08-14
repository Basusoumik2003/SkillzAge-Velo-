-- Admin-managed payment coupons and payment coupon tracking.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  discount_amount_paisa INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_coupons_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_coupons_discount_amount_positive
    CHECK (discount_amount_paisa > 0)
);

CREATE INDEX IF NOT EXISTS ix_coupons_is_active ON coupons(is_active);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS coupon_id INTEGER,
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS coupon_discount_paisa INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_payments_coupon'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_coupon
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_payments_coupon_id ON payments(coupon_id);
CREATE INDEX IF NOT EXISTS ix_payments_coupon_code ON payments(coupon_code);

COMMIT;
