-- Migration: 2026-08-20_01_deliverable_management
-- Description: Adds the Deliverable Management System - admin-configured
-- deliverables per stage (stage_deliverables), student submissions against
-- them (student_deliverable_submissions), S3-backed file attachments
-- (submission_files), and AI/mentor review records (deliverable_reviews).
-- Purely additive - no existing table, column, or constraint is touched.

-- +up
BEGIN;

CREATE TABLE IF NOT EXISTS stage_deliverables (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    stage_id INTEGER NOT NULL
        REFERENCES journey_stages(id)
        ON DELETE CASCADE,

    deliverable_name VARCHAR(255) NOT NULL,

    deliverable_description TEXT NOT NULL DEFAULT '',

    deliverable_type VARCHAR(50) NOT NULL DEFAULT 'document',

    is_required BOOLEAN NOT NULL DEFAULT TRUE,

    display_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_stage_deliverable_order
        UNIQUE(stage_id, display_order),

    CONSTRAINT chk_stage_deliverables_type CHECK (
        deliverable_type IN (
            'document', 'pdf', 'image', 'video',
            'github_repository', 'url', 'text'
        )
    )
);

CREATE INDEX IF NOT EXISTS ix_stage_deliverables_stage_id ON stage_deliverables(stage_id);
CREATE INDEX IF NOT EXISTS ix_stage_deliverables_stage_order ON stage_deliverables(stage_id, display_order);

CREATE TABLE IF NOT EXISTS student_deliverable_submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    phase_id INTEGER NOT NULL
        REFERENCES journey_phases(id)
        ON DELETE CASCADE,

    stage_id INTEGER NOT NULL
        REFERENCES journey_stages(id)
        ON DELETE CASCADE,

    deliverable_id INTEGER NOT NULL
        REFERENCES stage_deliverables(id)
        ON DELETE CASCADE,

    submission_type VARCHAR(50) NOT NULL DEFAULT 'file',

    submission_text TEXT NOT NULL DEFAULT '',

    status VARCHAR(30) NOT NULL DEFAULT 'submitted',

    attempt_number INTEGER NOT NULL DEFAULT 1,

    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_student_deliverable_submissions_type CHECK (
        submission_type IN ('file', 'text', 'github_repository', 'url')
    ),

    CONSTRAINT chk_student_deliverable_submissions_status CHECK (
        status IN (
            'submitted', 'under_review', 'approved',
            'rejected', 'resubmission_required'
        )
    ),

    CONSTRAINT chk_student_deliverable_submissions_attempt CHECK (attempt_number >= 1)
);

CREATE INDEX IF NOT EXISTS ix_student_deliverable_submissions_user_id ON student_deliverable_submissions(user_id);
CREATE INDEX IF NOT EXISTS ix_student_deliverable_submissions_deliverable_id ON student_deliverable_submissions(deliverable_id);
CREATE INDEX IF NOT EXISTS ix_student_deliverable_submissions_stage_id ON student_deliverable_submissions(stage_id);
CREATE INDEX IF NOT EXISTS ix_student_deliverable_submissions_status ON student_deliverable_submissions(status);
-- One "current" submission per (user, deliverable) is the norm for the
-- workspace UI, but full submission history is kept (resubmissions insert a
-- new row rather than overwrite) - this index just makes "latest attempt"
-- lookups cheap, it does not constrain uniqueness.
CREATE INDEX IF NOT EXISTS ix_student_deliverable_submissions_user_deliverable
    ON student_deliverable_submissions(user_id, deliverable_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS submission_files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    submission_id BIGINT NOT NULL
        REFERENCES student_deliverable_submissions(id)
        ON DELETE CASCADE,

    file_name VARCHAR(255) NOT NULL,

    file_type VARCHAR(50) NOT NULL DEFAULT '',

    file_size BIGINT NOT NULL DEFAULT 0,

    s3_url TEXT NOT NULL,

    s3_key TEXT NOT NULL,

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_submission_files_size CHECK (file_size >= 0)
);

CREATE INDEX IF NOT EXISTS ix_submission_files_submission_id ON submission_files(submission_id);

CREATE TABLE IF NOT EXISTS deliverable_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    submission_id BIGINT NOT NULL
        REFERENCES student_deliverable_submissions(id)
        ON DELETE CASCADE,

    reviewer_type VARCHAR(20) NOT NULL,

    score INTEGER NOT NULL DEFAULT 0,

    review_status VARCHAR(20) NOT NULL DEFAULT 'pending',

    feedback TEXT NOT NULL DEFAULT '',

    reviewed_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_deliverable_reviews_reviewer_type CHECK (reviewer_type IN ('ai', 'mentor')),

    CONSTRAINT chk_deliverable_reviews_status CHECK (
        review_status IN ('pending', 'approved', 'rejected', 'resubmission_required')
    ),

    CONSTRAINT chk_deliverable_reviews_score CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS ix_deliverable_reviews_submission_id ON deliverable_reviews(submission_id);
CREATE INDEX IF NOT EXISTS ix_deliverable_reviews_reviewer_type ON deliverable_reviews(reviewer_type);
CREATE INDEX IF NOT EXISTS ix_deliverable_reviews_status ON deliverable_reviews(review_status);

COMMIT;

-- Rollback (run separately):
-- DROP TABLE IF EXISTS deliverable_reviews;
-- DROP TABLE IF EXISTS submission_files;
-- DROP TABLE IF EXISTS student_deliverable_submissions;
-- DROP TABLE IF EXISTS stage_deliverables;
