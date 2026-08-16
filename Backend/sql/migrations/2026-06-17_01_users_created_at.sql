-- Add created_at to users table to track registration date.
-- Existing rows get the current timestamp as a reasonable default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
