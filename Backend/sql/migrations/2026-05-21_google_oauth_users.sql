-- Store Google OAuth identity metadata for passwordless Google login/signup.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) NOT NULL DEFAULT 'otp',
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_id
  ON users(google_id)
  WHERE google_id IS NOT NULL;
