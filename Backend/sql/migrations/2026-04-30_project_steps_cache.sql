-- Cache project steps JSON for faster reads
-- Date: 2026-04-30

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS steps_json JSONB NOT NULL DEFAULT '[]'::jsonb;

