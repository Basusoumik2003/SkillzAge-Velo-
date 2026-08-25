BEGIN;

-- Admin toggle: does this stage require its deliverables to be
-- submitted+passed before a student can move to the next stage? When FALSE,
-- deliverable_review_service._maybe_complete_stage() never gates this stage
-- regardless of what individual stage_deliverables.is_required says.
ALTER TABLE journey_stages ADD COLUMN IF NOT EXISTS requires_deliverables BOOLEAN NOT NULL DEFAULT FALSE;

-- Admin-configured passing score for this stage's deliverable reviews
-- (0-100). Replaces the old hardcoded global PASSING_SCORE for the
-- deliverable-review path (stage_document_review.py's own PASSING_SCORE is
-- untouched - it serves a different, older reviewer).
ALTER TABLE journey_stages ADD COLUMN IF NOT EXISTS pass_score_threshold INTEGER NOT NULL DEFAULT 60;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_journey_stages_pass_score_threshold'
  ) THEN
    ALTER TABLE journey_stages
      ADD CONSTRAINT chk_journey_stages_pass_score_threshold CHECK (pass_score_threshold >= 0 AND pass_score_threshold <= 100);
  END IF;
END $$;

-- Admin-uploaded demo/template file a student can download before filling
-- out a deliverable (e.g. a blank pitch-deck template).
ALTER TABLE stage_deliverables ADD COLUMN IF NOT EXISTS template_url TEXT NOT NULL DEFAULT '';
ALTER TABLE stage_deliverables ADD COLUMN IF NOT EXISTS template_original_filename VARCHAR(255) NOT NULL DEFAULT '';

COMMIT;

-- Rollback (run separately):
-- ALTER TABLE journey_stages DROP COLUMN IF EXISTS requires_deliverables, DROP COLUMN IF EXISTS pass_score_threshold;
-- ALTER TABLE stage_deliverables DROP COLUMN IF EXISTS template_url, DROP COLUMN IF EXISTS template_original_filename;
