-- Migration: 002_add_wix_member_id_to_users
-- Description: Links SkillzAge users to Wix Members accounts.

-- +up
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wix_member_id VARCHAR(255);

ALTER TABLE users
  ALTER COLUMN gender SET DEFAULT 'other',
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wix_member_id
  ON users (wix_member_id)
  WHERE wix_member_id IS NOT NULL;

-- +down
DROP INDEX IF EXISTS idx_users_wix_member_id;

ALTER TABLE users
  ALTER COLUMN gender DROP DEFAULT,
  ALTER COLUMN password_hash DROP DEFAULT,
  DROP COLUMN IF EXISTS wix_member_id;
