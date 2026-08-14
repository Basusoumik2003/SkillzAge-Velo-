-- Coin credit purchases

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_coins_purchased INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS coins_purchased INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_unit_amount_paisa INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_coin_balances (
  user_id UUID PRIMARY KEY,
  coin_balance INTEGER NOT NULL DEFAULT 0,
  total_coins_purchased INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_coin_balances_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_user_coin_balances_balance_nonnegative
    CHECK (coin_balance >= 0),
  CONSTRAINT ck_user_coin_balances_total_nonnegative
    CHECK (total_coins_purchased >= 0)
);

INSERT INTO user_coin_balances (user_id, coin_balance, total_coins_purchased, created_at, updated_at)
SELECT user_id, COALESCE(SUM(coins_purchased), 0)::integer, COALESCE(SUM(coins_purchased), 0)::integer, NOW(), NOW()
FROM payments
WHERE status = 'paid'
  AND purpose = 'coin_purchase'
  AND coins_purchased > 0
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
  coin_balance = EXCLUDED.coin_balance,
  total_coins_purchased = EXCLUDED.total_coins_purchased,
  updated_at = NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_payments_coins_nonnegative'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT ck_payments_coins_nonnegative CHECK (coins_purchased >= 0);
  END IF;
END $$;
