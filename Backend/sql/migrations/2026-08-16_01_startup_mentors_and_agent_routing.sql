BEGIN;

-- DB-driven mentor personas for the Startup Journey (parallels the older
-- project_mentors table used by the mentor-project workspace, but kept
-- separate since the two features have different owners/fields).
CREATE TABLE IF NOT EXISTS startup_mentors (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_key VARCHAR(80) UNIQUE NOT NULL,
  mentor_name VARCHAR(120) NOT NULL,
  role TEXT NOT NULL,
  goal TEXT NOT NULL,
  backstory TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  output_format VARCHAR(20) NOT NULL DEFAULT 'markdown',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_startup_mentors_output_format CHECK (output_format IN ('markdown', 'plain_text', 'json'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_startup_mentors_single_default
  ON startup_mentors(is_default)
  WHERE is_default = TRUE;

-- Which mentor persona answers questions asked on a given stage/phase.
-- Resolution order at query time: stage.agent_key -> phase.default_agent_key
-- -> startup_mentors.is_default row -> hardcoded last-resort persona.
ALTER TABLE journey_stages ADD COLUMN IF NOT EXISTS agent_key VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE journey_phases ADD COLUMN IF NOT EXISTS default_agent_key VARCHAR(80) NOT NULL DEFAULT '';

COMMIT;

-- Rollback (run separately):
-- ALTER TABLE journey_phases DROP COLUMN IF EXISTS default_agent_key;
-- ALTER TABLE journey_stages DROP COLUMN IF EXISTS agent_key;
-- DROP TABLE IF EXISTS startup_mentors;
