BEGIN;

-- Admin-authored keywords/topics that steer the stage-start web search (see
-- runStageStartWebSearch in adminService/src/routes/startupRoutes.js). Free
-- text, comma-separated by convention but stored as-is.
ALTER TABLE journey_stages ADD COLUMN IF NOT EXISTS search_focus TEXT NOT NULL DEFAULT '';

COMMIT;

-- Rollback (run separately):
-- ALTER TABLE journey_stages DROP COLUMN IF EXISTS search_focus;
