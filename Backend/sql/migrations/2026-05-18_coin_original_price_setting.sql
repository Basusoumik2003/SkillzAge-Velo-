-- Configurable original/struck display price for one coin.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES ('coin_original_amount_paisa', '1000000', 'integer', 'Original display price of one coin in paise.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;
