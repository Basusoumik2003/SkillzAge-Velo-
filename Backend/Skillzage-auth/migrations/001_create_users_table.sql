-- Migration: 001_create_users_table
-- Description: Creates the users table for the SkillzAge authentication service.

-- +up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    gender gender_type NOT NULL DEFAULT 'other',
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    wix_member_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wix_member_id
    ON users (wix_member_id)
    WHERE wix_member_id IS NOT NULL;

-- +down
DROP INDEX IF EXISTS idx_users_wix_member_id;
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS gender_type;


