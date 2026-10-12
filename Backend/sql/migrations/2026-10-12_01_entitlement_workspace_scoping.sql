-- Keeps existing profiles as legacy rows (entitlement_id IS NULL) while
-- allowing each new purchased entitlement to have an independent workspace.

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.user_project_details
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.user_project_access
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.conversation_sessions
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.student_stage_progress
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.startup_ideas
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

ALTER TABLE public.mentor_chat_messages
  ADD COLUMN IF NOT EXISTS entitlement_id TEXT;

-- Replace the old one-profile-per-user constraint with compatibility indexes:
-- one legacy profile per user, or one profile per user/journey/purchase.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_legacy_user
  ON public.user_profiles(user_id)
  WHERE entitlement_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_entitlement
  ON public.user_profiles(user_id, journey_id, entitlement_id)
  WHERE entitlement_id IS NOT NULL;

ALTER TABLE public.user_project_details
  DROP CONSTRAINT IF EXISTS uq_user_project_details_user_project;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_project_details_legacy
  ON public.user_project_details(user_id, journey_id)
  WHERE entitlement_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_project_details_entitlement
  ON public.user_project_details(user_id, journey_id, entitlement_id)
  WHERE entitlement_id IS NOT NULL;

ALTER TABLE public.user_project_access
  DROP CONSTRAINT IF EXISTS uq_user_project_access_user_project;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_project_access_legacy
  ON public.user_project_access(user_id, journey_id)
  WHERE entitlement_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_project_access_entitlement
  ON public.user_project_access(user_id, journey_id, entitlement_id)
  WHERE entitlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_user_profiles_entitlement
  ON public.user_profiles(user_id, journey_id, entitlement_id);

CREATE INDEX IF NOT EXISTS ix_user_project_details_entitlement
  ON public.user_project_details(user_id, journey_id, entitlement_id);

CREATE INDEX IF NOT EXISTS ix_user_project_access_entitlement
  ON public.user_project_access(user_id, journey_id, entitlement_id);

CREATE INDEX IF NOT EXISTS ix_conversation_sessions_entitlement
  ON public.conversation_sessions(user_id, entitlement_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_student_stage_progress_entitlement
  ON public.student_stage_progress(user_id, entitlement_id, stage_id);

CREATE INDEX IF NOT EXISTS ix_startup_ideas_entitlement
  ON public.startup_ideas(user_id, entitlement_id, is_primary);

CREATE INDEX IF NOT EXISTS ix_mentor_chat_messages_entitlement
  ON public.mentor_chat_messages(user_id, entitlement_id, created_at DESC);

COMMIT;
