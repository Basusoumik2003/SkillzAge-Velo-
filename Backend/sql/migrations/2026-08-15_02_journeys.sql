-- Add reusable top-level journeys and attach phases to a journey.
CREATE TABLE IF NOT EXISTS journeys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journey_key VARCHAR(80) NOT NULL UNIQUE,
  journey_name VARCHAR(160) NOT NULL,
  journey_description TEXT NOT NULL DEFAULT '',
  journey_objective TEXT NOT NULL DEFAULT '',
  intended_audience TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_journeys_active ON journeys(is_active);

ALTER TABLE journey_phases ADD COLUMN IF NOT EXISTS journey_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_journey_phases_journey'
  ) THEN
    ALTER TABLE journey_phases
      ADD CONSTRAINT fk_journey_phases_journey
      FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_journey_phases_journey_id ON journey_phases(journey_id);
