-- Add Wix Members identity mapping to users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wix_member_id VARCHAR(255);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(30) NOT NULL DEFAULT 'other';

ALTER TABLE users
  ALTER COLUMN gender SET DEFAULT 'other',
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_wix_member_id
  ON users(wix_member_id)
  WHERE wix_member_id IS NOT NULL;
