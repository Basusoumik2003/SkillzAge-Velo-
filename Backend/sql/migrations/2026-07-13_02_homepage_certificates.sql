-- Admin-managed homepage demo certificate images.
-- Idempotent: safe to run on existing databases.
CREATE TABLE IF NOT EXISTS homepage_certificates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(180) NOT NULL DEFAULT 'Demo Certificate',
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill for databases that ran an earlier draft of this migration.
ALTER TABLE homepage_certificates
  ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_public_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'homepage_certificates'
      AND column_name = 'recipient'
  ) THEN
    ALTER TABLE homepage_certificates
      ALTER COLUMN recipient SET DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_homepage_certificates_active_order
  ON homepage_certificates(is_active, display_order, id);
