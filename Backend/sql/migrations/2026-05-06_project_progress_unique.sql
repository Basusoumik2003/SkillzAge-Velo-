-- Required by dashboard progress upsert logic.
-- Prevents duplicate progress rows for the same user/project pair.

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_progress_user_project
  ON project_progress(user_id, project_name);
