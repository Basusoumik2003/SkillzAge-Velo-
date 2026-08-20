-- Migration: 2026-08-19_01_journey_scoping
-- Description: Makes journey_phases (and therefore journey_stages) actually
-- belong to a specific journeys row, and lets a student be on a specific
-- journey. Backfills existing data onto one "default" journey so today's
-- single-journey behavior is unchanged until an admin/student explicitly
-- creates/picks a second one.

BEGIN;

ALTER TABLE journeys ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS journey_id INTEGER REFERENCES journeys(id) ON DELETE SET NULL;

DO $$
DECLARE
  default_journey_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journeys) THEN
    INSERT INTO journeys (journey_key, journey_name, is_default)
    VALUES ('default-journey', 'Startup Journey', TRUE)
    RETURNING id INTO default_journey_id;
  ELSIF NOT EXISTS (SELECT 1 FROM journeys WHERE is_default = TRUE) THEN
    SELECT id INTO default_journey_id FROM journeys ORDER BY id ASC LIMIT 1;
    UPDATE journeys SET is_default = TRUE WHERE id = default_journey_id;
  ELSE
    SELECT id INTO default_journey_id FROM journeys WHERE is_default = TRUE LIMIT 1;
  END IF;

  UPDATE journey_phases SET journey_id = default_journey_id WHERE journey_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journeys_single_default ON journeys(is_default) WHERE is_default = TRUE;

-- phase_order was globally unique (sql/migrations/2026-08-13_01_startup_journey_schema.sql),
-- so two journeys could never both have a "Phase 1" - scope it per journey instead.
ALTER TABLE journey_phases DROP CONSTRAINT IF EXISTS uq_journey_phases_order;
CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_phases_journey_order ON journey_phases(journey_id, phase_order);

COMMIT;

-- Rollback (run separately):
-- DROP INDEX IF EXISTS uq_journey_phases_journey_order;
-- ALTER TABLE journey_phases ADD CONSTRAINT uq_journey_phases_order UNIQUE (phase_order);
-- DROP INDEX IF EXISTS uq_journeys_single_default;
-- ALTER TABLE student_profiles DROP COLUMN IF EXISTS journey_id;
-- ALTER TABLE journeys DROP COLUMN IF EXISTS is_default;
