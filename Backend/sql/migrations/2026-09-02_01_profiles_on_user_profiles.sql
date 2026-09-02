-- The Wix member/profile form writes public.user_profiles. The startup-journey
-- backend previously used a parallel public.student_profiles table, so a
-- Wix-onboarded student had a user_profiles row but no student_profiles row and
-- every /chat endpoint 404'd ("Please select a project first"), and the mentor
-- context could not read the profile. Point the startup-journey code at
-- user_profiles instead.
--
-- Column map (student_profiles -> user_profiles):
--   state_region                 -> state
--   skills / interests (text)    -> skills / interests (text[])
--   available_time_hours_per_week -> available_hours_per_week
--   available_resources (text)   -> has_laptop / has_internet / has_team / has_funding
--   participation_mode           -> participation
--   current_idea_text            -> current_idea
--   goal_type (varchar)          -> goals (text[])
--   preferred_language / profile_summary / readiness_score / location_text  -> (dropped; unused or defaulted in code)

BEGIN;

-- journey_id is the only column the startup-journey code needs that
-- user_profiles lacks (student_profiles.journey_id came from
-- 2026-08-19_01_journey_scoping.sql).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS journey_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_user_profiles_journey_id
  ON public.user_profiles(journey_id);

-- Carry over any rows that only exist in student_profiles (usually none).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_profiles'
  ) THEN
    INSERT INTO public.user_profiles (
      id, user_id, age, education_level, country, state, city,
      skills, interests, available_hours_per_week, participation,
      current_idea, startup_stage, goals, journey_id, created_at, updated_at
    )
    SELECT
      sp.id, sp.user_id, sp.age, sp.education_level, sp.country, sp.state_region, sp.city,
      CASE WHEN COALESCE(sp.skills, '') = '' THEN NULL
           ELSE string_to_array(sp.skills, ',') END,
      CASE WHEN COALESCE(sp.interests, '') = '' THEN NULL
           ELSE string_to_array(sp.interests, ',') END,
      sp.available_time_hours_per_week::numeric,
      sp.participation_mode, sp.current_idea_text, sp.startup_stage,
      CASE WHEN COALESCE(sp.goal_type, '') = '' THEN NULL
           ELSE ARRAY[sp.goal_type] END,
      sp.journey_id, sp.created_at, sp.updated_at
    FROM public.student_profiles sp
    ON CONFLICT (user_id) DO UPDATE
      SET journey_id = COALESCE(user_profiles.journey_id, EXCLUDED.journey_id);
  END IF;
END $$;

-- Repoint every profile_id foreign key that still targets student_profiles
-- (startup_ideas, conversation_sessions, memory_summaries, student_stage_progress,
-- agent_runs - depending on which migrations this DB has applied).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname, cl.relname AS child_table
    FROM pg_constraint con
    JOIN pg_class cl  ON cl.oid  = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE con.contype = 'f'
      AND ref.relname = 'student_profiles'
      AND ns.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.child_table, r.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (profile_id) '
      || 'REFERENCES public.user_profiles(id) ON DELETE SET NULL',
      r.child_table, r.conname
    );
  END LOOP;
END $$;

COMMIT;

-- Rollback (manual):
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS journey_id;
--   (FKs would need to be pointed back at student_profiles by hand.)
