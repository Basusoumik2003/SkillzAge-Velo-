-- Store Cloudinary avatar metadata for admin-managed mentors.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_mentors
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_public_id TEXT NOT NULL DEFAULT '';

COMMIT;
