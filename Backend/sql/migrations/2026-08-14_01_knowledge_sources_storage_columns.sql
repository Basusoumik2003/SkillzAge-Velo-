BEGIN;

-- Lets an admin-uploaded global knowledge source point at an S3 object,
-- the same way stage_documents already does.
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS storage_url TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS storage_public_id TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '';

COMMIT;

-- Rollback (run separately):
-- ALTER TABLE knowledge_sources DROP COLUMN IF EXISTS original_filename, DROP COLUMN IF EXISTS storage_public_id, DROP COLUMN IF EXISTS storage_url;
