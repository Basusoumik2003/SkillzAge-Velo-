-- Persist mentor chat history per user and project.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

CREATE TABLE IF NOT EXISTS mentor_chat_messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name VARCHAR(160) NOT NULL,
  mentor_id INTEGER,
  agent_key VARCHAR(50) NOT NULL DEFAULT '',
  agent_name VARCHAR(100) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_mentor_chat_messages_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mentor_chat_messages_mentor
    FOREIGN KEY (mentor_id) REFERENCES project_mentors(id) ON DELETE SET NULL,
  CONSTRAINT chk_mentor_chat_messages_role
    CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS ix_mentor_chat_messages_user_project_created
  ON mentor_chat_messages(user_id, project_name, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_mentor_chat_messages_mentor_id
  ON mentor_chat_messages(mentor_id);

COMMIT;
