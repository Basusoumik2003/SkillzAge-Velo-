-- Migration: 2026-09-18_01_reconcile_startup_profile_schema
-- Description: Aligns existing databases with the startup profile upserts.

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS education_level VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS skills TEXT[],
  ADD COLUMN IF NOT EXISTS interests TEXT[],
  ADD COLUMN IF NOT EXISTS available_hours_per_week NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS has_laptop BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_internet BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_team BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_funding BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS participation VARCHAR(20),
  ADD COLUMN IF NOT EXISTS current_idea TEXT,
  ADD COLUMN IF NOT EXISTS startup_stage VARCHAR(50),
  ADD COLUMN IF NOT EXISTS goals TEXT[],
  ADD COLUMN IF NOT EXISTS journey_id INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_profiles'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum
         FROM pg_attribute
         WHERE attrelid = 'public.user_profiles'::regclass
           AND attname = 'user_id'
           AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    IF EXISTS (
      SELECT user_id
      FROM public.user_profiles
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add unique user_profiles.user_id constraint: duplicate user_id values exist';
    END IF;

    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_project_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  journey_id INTEGER NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  access_status VARCHAR(20) NOT NULL DEFAULT 'active',
  project_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_project_access_user_project UNIQUE (user_id, journey_id)
);

CREATE TABLE IF NOT EXISTS public.user_project_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  journey_id INTEGER NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_project_details_user_project UNIQUE (user_id, journey_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_project_access'::regclass
      AND conname = 'uq_user_project_access_user_project'
  ) THEN
    ALTER TABLE public.user_project_access
      ADD CONSTRAINT uq_user_project_access_user_project
      UNIQUE (user_id, journey_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_project_details'::regclass
      AND conname = 'uq_user_project_details_user_project'
  ) THEN
    ALTER TABLE public.user_project_details
      ADD CONSTRAINT uq_user_project_details_user_project
      UNIQUE (user_id, journey_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_startup_ideas_primary_per_user
  ON public.startup_ideas(user_id)
  WHERE is_primary = TRUE;

COMMIT;