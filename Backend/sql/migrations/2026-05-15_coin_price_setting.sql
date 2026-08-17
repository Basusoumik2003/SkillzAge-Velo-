CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_app_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES ('coin_unit_amount_paisa', '350000', 'integer', 'Price of one coin in paise.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
