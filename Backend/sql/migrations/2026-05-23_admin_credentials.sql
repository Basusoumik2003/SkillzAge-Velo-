CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL DEFAULT '',
  password_salt VARCHAR(128) NOT NULL DEFAULT '',
  can_access_admin BOOLEAN NOT NULL DEFAULT TRUE,
  bypass_otp BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_credentials
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_salt VARCHAR(128) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_admin_credentials_active ON admin_credentials(is_active);


INSERT INTO admin_credentials (
  email,
  password_hash,
  password_salt,
  can_access_admin,
  bypass_otp,
  is_active
)
VALUES (
  'accounts.main.k4x7z2q9@skillzage.com',
  '2fd8e93f60c0a9656df8502587ec9402333a442b6580e98e71697b162ee9f154b31b1b9775824b430c58a53954796c8d31a6af76891f2761999cf743bd19e867',
  'fbaa55401d005dc7e59fcefbb206cbc4',
  TRUE,
  TRUE,
  TRUE
);