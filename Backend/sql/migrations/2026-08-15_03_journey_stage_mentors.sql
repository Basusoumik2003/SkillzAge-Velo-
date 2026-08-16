-- Assign one startup mentor to each startup journey stage.
ALTER TABLE journey_stages
  ADD COLUMN IF NOT EXISTS mentor_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_journey_stages_mentor'
  ) THEN
    ALTER TABLE journey_stages
      ADD CONSTRAINT fk_journey_stages_mentor
      FOREIGN KEY (mentor_id)
      REFERENCES startup_mentors(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_journey_stages_mentor_id
  ON journey_stages(mentor_id);
