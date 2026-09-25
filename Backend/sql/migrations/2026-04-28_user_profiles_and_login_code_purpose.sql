-- Migration: add user_profiles table + login_codes.purpose column
-- Date: 2026-04-28

BEGIN;

-- ALTER TABLE login_codes
--   ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'login';

-- CREATE INDEX IF NOT EXISTS ix_login_codes_email_purpose ON login_codes(email, purpose);

-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  education_level VARCHAR(100),
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  skills TEXT[],
  interests TEXT[],
  available_hours_per_week NUMERIC(5, 2),
  has_laptop BOOLEAN NOT NULL DEFAULT FALSE,
  has_internet BOOLEAN NOT NULL DEFAULT FALSE,
  has_team BOOLEAN NOT NULL DEFAULT FALSE,
  has_funding BOOLEAN NOT NULL DEFAULT FALSE,
  participation VARCHAR(20),
  current_idea TEXT,
  startup_stage VARCHAR(50),
  goals TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  journey_id INTEGER
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);

COMMIT;

