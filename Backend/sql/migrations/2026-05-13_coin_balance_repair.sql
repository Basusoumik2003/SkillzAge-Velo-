-- Repair coin balances so purchases minus project unlocks become the live wallet balance.

WITH purchased AS (
  SELECT
    user_id,
    COALESCE(SUM(coins_purchased), 0)::integer AS total_purchased
  FROM payments
  WHERE status = 'paid'
    AND purpose = 'coin_purchase'
    AND coins_purchased > 0
  GROUP BY user_id
),
spent AS (
  SELECT
    pp.user_id,
    COALESCE(SUM(COALESCE(p.project_coins, 1)), 0)::integer AS total_spent
  FROM project_progress pp
  LEFT JOIN projects p ON p.title = pp.project_name
  GROUP BY pp.user_id
)
INSERT INTO user_coin_balances (user_id, coin_balance, total_coins_purchased, created_at, updated_at)
SELECT
  u.id AS user_id,
  GREATEST(COALESCE(purchased.total_purchased, 0) - COALESCE(spent.total_spent, 0), 0)::integer AS coin_balance,
  COALESCE(purchased.total_purchased, 0)::integer AS total_coins_purchased,
  NOW(),
  NOW()
FROM users u
LEFT JOIN purchased ON purchased.user_id = u.id
LEFT JOIN spent ON spent.user_id = u.id
WHERE COALESCE(purchased.total_purchased, 0) > 0 OR COALESCE(spent.total_spent, 0) > 0
ON CONFLICT (user_id) DO UPDATE SET
  coin_balance = EXCLUDED.coin_balance,
  total_coins_purchased = EXCLUDED.total_coins_purchased,
  updated_at = NOW();
