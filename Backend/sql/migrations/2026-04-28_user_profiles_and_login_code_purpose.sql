-- Migration: add user_profiles table + login_codes.purpose column
-- Date: 2026-04-28

BEGIN;

ALTER TABLE login_codes
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'login';

CREATE INDEX IF NOT EXISTS ix_login_codes_email_purpose ON login_codes(email, purpose);

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  profile_image_url TEXT DEFAULT '',
  resume_url TEXT DEFAULT '',
  college_name VARCHAR(150) DEFAULT '',
  branch VARCHAR(100) DEFAULT '',
  semester VARCHAR(50) DEFAULT '',
  year VARCHAR(50) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);

COMMIT;

