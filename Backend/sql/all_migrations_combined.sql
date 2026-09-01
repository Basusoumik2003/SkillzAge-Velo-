-- InternLabs single-file schema and migrations
-- Base schema followed by all forward migrations through 2026-08-25.
-- The SkillzAge users table must exist before this file is executed.

-- InternLabs database schema (PostgreSQL)
-- Generated on: 2026-04-28

-- 1) Users
-- SkillzAge already owns its `users` table (001_create_users_table:
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), full_name, email, gender,
--   password_hash, created_at, updated_at).
-- Do NOT run a CREATE TABLE users here. All workspace tables below reference
-- users(id) as UUID to match it. This block only bolts on the extra columns
-- the workspace backend code reads/writes that SkillzAge's users table
-- doesn't have yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wix_member_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN gender SET DEFAULT 'other';
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_wix_member_id
  ON users(wix_member_id)
  WHERE wix_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS ix_users_last_seen_at
  ON users(last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;

-- 2) Project progress
CREATE TABLE IF NOT EXISTS project_progress (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name VARCHAR(120) NOT NULL,
  current_step INTEGER DEFAULT 1,
  completed_tasks TEXT DEFAULT '',
  CONSTRAINT fk_project_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_project_progress_user_id ON project_progress(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_progress_user_project ON project_progress(user_id, project_name);

-- 3) Project stage progress
CREATE TABLE IF NOT EXISTS project_stage_progress (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'undone',
  understood BOOLEAN NOT NULL DEFAULT FALSE,
  document_required BOOLEAN NOT NULL DEFAULT FALSE,
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  document_submission_group_id TEXT NOT NULL DEFAULT '',
  document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  document_review_feedback TEXT NOT NULL DEFAULT '',
  document_reviewed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_stage_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_stage_progress_status CHECK (status IN ('undone', 'working', 'completed')),
  CONSTRAINT chk_project_stage_progress_document_review_status
    CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  CONSTRAINT chk_project_stage_progress_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_progress_stage CHECK (stage_index >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_stage_progress_user_project_stage
  ON project_stage_progress(user_id, project_name, step_number, stage_index);
CREATE INDEX IF NOT EXISTS ix_project_stage_progress_user_project
  ON project_stage_progress(user_id, project_name);

CREATE TABLE IF NOT EXISTS project_stage_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  submission_group_id TEXT NOT NULL DEFAULT '',
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  document_review_feedback TEXT NOT NULL DEFAULT '',
  document_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_stage_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_stage_documents_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_documents_stage CHECK (stage_index >= 0),
  CONSTRAINT chk_project_stage_documents_review_status CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_stage
  ON project_stage_documents(user_id, project_name, step_number, stage_index);
CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

CREATE TABLE IF NOT EXISTS stage_document_review_audits (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  submission_group_id TEXT NOT NULL DEFAULT '',
  document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  parser_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_markdown TEXT NOT NULL DEFAULT '',
  optimized_text TEXT NOT NULL DEFAULT '',
  prompt_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_prompt TEXT NOT NULL DEFAULT '',
  llm_raw_output TEXT NOT NULL DEFAULT '',
  llm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_source TEXT NOT NULL DEFAULT '',
  review_status VARCHAR(20) NOT NULL DEFAULT 'rejected',
  review_score INTEGER NOT NULL DEFAULT 0,
  review_feedback TEXT NOT NULL DEFAULT '',
  github_required BOOLEAN NOT NULL DEFAULT FALSE,
  github_connected BOOLEAN NOT NULL DEFAULT FALSE,
  stage_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_stage_document_review_audits_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_stage_document_review_audits_stage CHECK (stage_index >= 0),
  CONSTRAINT chk_stage_document_review_audits_step CHECK (step_number >= 1),
  CONSTRAINT chk_stage_document_review_audits_status CHECK (review_status IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_user_project
  ON stage_document_review_audits(user_id, project_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_group
  ON stage_document_review_audits(user_id, project_name, step_number, stage_index, submission_group_id);

-- 4) GitHub application credentials/settings
CREATE TABLE IF NOT EXISTS github_app_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  github_token TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_github_app_settings_active_updated
  ON github_app_settings(is_active, updated_at DESC);

-- 5) GitHub repositories (one per user/project)
CREATE TABLE IF NOT EXISTS github_repositories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name VARCHAR(160) NOT NULL DEFAULT '',
  github_username VARCHAR(120) NOT NULL,
  repository_url VARCHAR(255) NOT NULL,
  branch_name VARCHAR(120) NOT NULL DEFAULT 'main',
  webhook_id BIGINT,
  last_commit_hash VARCHAR(120),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_github_repositories_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_github_repositories_user_id ON github_repositories(user_id);
CREATE INDEX IF NOT EXISTS ix_github_repositories_project_name ON github_repositories(project_name);
CREATE INDEX IF NOT EXISTS ix_github_repositories_webhook_id ON github_repositories(webhook_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_github_repositories_user_project
  ON github_repositories(user_id, project_name);

-- 4) Code reviews
CREATE TABLE IF NOT EXISTS code_reviews (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name VARCHAR(120) NOT NULL,
  commit_hash VARCHAR(120) NOT NULL,
  changed_files TEXT NOT NULL DEFAULT '[]',
  review_feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_code_reviews_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_code_reviews_user_id ON code_reviews(user_id);
CREATE INDEX IF NOT EXISTS ix_code_reviews_commit_hash ON code_reviews(commit_hash);

-- 5) Passwordless login codes (OTP)
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(120) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: older databases may already have login_codes without `purpose`.
ALTER TABLE IF EXISTS login_codes
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'login';

CREATE INDEX IF NOT EXISTS ix_login_codes_email ON login_codes(email);
CREATE INDEX IF NOT EXISTS ix_login_codes_email_purpose ON login_codes(email, purpose);
CREATE INDEX IF NOT EXISTS ix_login_codes_expires_at ON login_codes(expires_at);

-- 6) Refresh tokens (rotation + revocation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  token_id VARCHAR(128) NOT NULL UNIQUE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- 7) Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  provider VARCHAR(50),
  provider_customer_id VARCHAR(120),
  provider_subscription_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_subscriptions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_status ON subscriptions(status);

-- 8) Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID,
  action VARCHAR(120) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);
-- 6) User profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  profile_image_url TEXT DEFAULT '',
  resume_url TEXT DEFAULT '',
  college_name VARCHAR(150) DEFAULT '',
  branch VARCHAR(100) DEFAULT '',
  semester VARCHAR(50) DEFAULT '',
  year VARCHAR(50) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);

-- Platform settings
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_app_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES ('coin_unit_amount_paisa', '350000', 'integer', 'Price of one coin in paise.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES ('coin_original_amount_paisa', '1000000', 'integer', 'Original display price of one coin in paise.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES
  ('invoice_company_name', 'Learning Bee Education Private Limited', 'string', 'Invoice company legal name.', NOW(), NOW()),
  ('invoice_registered_office', 'Reta Valley Apartment, Flat No: 212, Block B2, Gudiapokhari,
Puri 752104, Odisha.
GSTIN: 21AAAAAX0000A1Z1
State Code: 21 (Odisha)
Email: billing@skillzage.com', 'string', 'Invoice registered office address.', NOW(), NOW()),
  ('invoice_gstin', '21AAAAAX0000A1Z1', 'string', 'Invoice GSTIN.', NOW(), NOW()),
  ('invoice_state_code', '21 (Odisha)', 'string', 'Invoice company state code.', NOW(), NOW()),
  ('invoice_email', 'billing@skillzage.com', 'string', 'Invoice billing email.', NOW(), NOW()),
  ('invoice_platform_url', 'https://www.internzbee.in', 'string', 'Invoice platform URL.', NOW(), NOW()),
  ('invoice_nature_of_service', 'Online + Weekly Session Service', 'string', 'Invoice service nature.', NOW(), NOW()),
  ('invoice_sac_code', '999249', 'string', 'Invoice SAC code.', NOW(), NOW()),
  ('invoice_place_of_supply', 'Odisha (21)', 'string', 'Default invoice place of supply.', NOW(), NOW()),
  ('invoice_transaction_type', 'Intra-State (CGST + SGST)', 'string', 'Default invoice transaction type.', NOW(), NOW()),
  ('invoice_program_name', 'Internship Simulation Program', 'string', 'Default invoice program.', NOW(), NOW()),
  ('invoice_access_duration', '3 Months Fixed Term', 'string', 'Default invoice access duration.', NOW(), NOW()),
  ('invoice_credit_1_amount_paisa', '350000', 'integer', 'Invoice taxable value for one project credit.', NOW(), NOW()),
  ('invoice_credit_2_amount_paisa', '600000', 'integer', 'Invoice taxable value for two project credits.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;


-- 7) Contact messages
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_contact_messages_email ON contact_messages(email);
CREATE INDEX IF NOT EXISTS ix_contact_messages_created_at ON contact_messages(created_at);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'subscribed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_newsletter_subscribers_status CHECK (status IN ('subscribed', 'unsubscribed'))
);

CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_created_at ON newsletter_subscribers(created_at);
CREATE TABLE IF NOT EXISTS admin_newsletters (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject VARCHAR(180) NOT NULL,
  title VARCHAR(180) NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  image_original_filename VARCHAR(255) NOT NULL DEFAULT '',
  image_mime_type VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_admin_newsletters_status CHECK (status IN ('draft', 'sending', 'sent', 'partial', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_admin_newsletters_created_at ON admin_newsletters(created_at);
CREATE INDEX IF NOT EXISTS ix_admin_newsletters_status ON admin_newsletters(status);

-- 8) Company and project catalog (admin-managed)
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  industry VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_companies_is_active ON companies(is_active);

INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
VALUES ('InternzBee Default', 'internzbee-default', '', 'Default company for existing projects.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timeline_weeks INTEGER NOT NULL DEFAULT 4,
  project_coins INTEGER NOT NULL DEFAULT 1,
  category VARCHAR(40) NOT NULL DEFAULT 'normal',
  global_category VARCHAR(80) NOT NULL DEFAULT '',
  complexity VARCHAR(40) NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  skills_required TEXT NOT NULL DEFAULT '',
  skills_gained TEXT NOT NULL DEFAULT '',
  target_branch TEXT NOT NULL DEFAULT '',
  target_year TEXT NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL DEFAULT '',
  short_summary TEXT NOT NULL DEFAULT '',
  domain VARCHAR(80) NOT NULL DEFAULT '',
  prerequisites TEXT NOT NULL DEFAULT '',
  learning_outcomes TEXT NOT NULL DEFAULT '',
  difficulty_score INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo_project BOOLEAN NOT NULL DEFAULT FALSE,
  introduction_document TEXT NOT NULL DEFAULT '',
  introduction_document_url TEXT NOT NULL DEFAULT '',
  company_profile_text TEXT NOT NULL DEFAULT '',
  private_brd_document TEXT NOT NULL DEFAULT '',
  private_brd_document_url TEXT NOT NULL DEFAULT '',
  solution_document TEXT NOT NULL DEFAULT '',
  solution_document_url TEXT NOT NULL DEFAULT '',
  -- Cached steps for fast reads (source of truth remains project_steps table)
  steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_projects_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS ix_projects_company_active ON projects(company_id, is_active);
CREATE INDEX IF NOT EXISTS ix_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS ix_projects_demo_active ON projects(is_demo_project, is_active);
CREATE INDEX IF NOT EXISTS ix_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS ix_projects_global_category ON projects(global_category);
CREATE INDEX IF NOT EXISTS ix_projects_domain ON projects(domain);
CREATE INDEX IF NOT EXISTS ix_projects_complexity ON projects(complexity);

CREATE TABLE IF NOT EXISTS project_recommendation_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  project_title VARCHAR(160) NOT NULL DEFAULT '',
  rank INTEGER NOT NULL DEFAULT 1,
  match_percent INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  source VARCHAR(60) NOT NULL DEFAULT '',
  resume_url TEXT NOT NULL DEFAULT '',
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_recommendation_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_recommendation_logs_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_user_shown
  ON project_recommendation_logs(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_shown
  ON project_recommendation_logs(shown_at DESC);

CREATE TABLE IF NOT EXISTS demo_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(240) NOT NULL,
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_demo_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_demo_documents_active_updated
  ON demo_documents(is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_steps (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  title VARCHAR(140) NOT NULL,
  agent_key VARCHAR(60) NOT NULL DEFAULT 'pm_agent',
  step_context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_steps_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_steps_project_order ON project_steps(project_id, step_order);
CREATE INDEX IF NOT EXISTS ix_project_steps_project_id ON project_steps(project_id);

-- 9) Mentor catalog (admin-managed CrewAI definitions)
CREATE TABLE IF NOT EXISTS project_mentors (
  id SERIAL PRIMARY KEY,
  agent_key VARCHAR(50) UNIQUE NOT NULL,
  mentor_name VARCHAR(100) NOT NULL,
  role TEXT NOT NULL,
  goal TEXT NOT NULL,
  backstory TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_public_id TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  output_format VARCHAR(20) NOT NULL DEFAULT 'markdown',
  CONSTRAINT chk_project_mentors_output_format
    CHECK (output_format IN ('markdown', 'plain_text', 'json'))
);

CREATE INDEX IF NOT EXISTS ix_project_mentors_is_hidden ON project_mentors(is_hidden);

-- 10) Project document catalog, chunks, and agent access
CREATE TABLE IF NOT EXISTS project_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  scope VARCHAR(30) NOT NULL DEFAULT 'project',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  indexing_error TEXT NOT NULL DEFAULT '',
  ingestion_attempted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_documents_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_project_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_project_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_project_documents_scope
    CHECK (scope IN ('project', 'company')),
  CONSTRAINT chk_project_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_project_documents_company_project
  ON project_documents(company_id, project_id);
CREATE INDEX IF NOT EXISTS ix_project_documents_project_status
  ON project_documents(project_id, status);
CREATE INDEX IF NOT EXISTS ix_project_documents_project_type
  ON project_documents(project_id, document_type);
CREATE INDEX IF NOT EXISTS ix_project_documents_active
  ON project_documents(is_active);
CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_type
  ON project_documents(company_id, scope, document_type);
CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_hash
  ON project_documents(company_id, scope, content_hash);

CREATE TABLE IF NOT EXISTS project_document_links (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  link_type VARCHAR(30) NOT NULL DEFAULT 'attached',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_document_links_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_document_links_type
    CHECK (link_type IN ('attached', 'owner', 'inherited')),
  CONSTRAINT uq_project_document_links_project_document
    UNIQUE (project_id, document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_document_links_company_project
  ON project_document_links(company_id, project_id);
CREATE INDEX IF NOT EXISTS ix_project_document_links_document
  ON project_document_links(document_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_document_chunks_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_document_chunks_document_chunk
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_document_chunks_company_project
  ON document_chunks(company_id, project_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id
  ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_metadata
  ON document_chunks USING GIN (document_metadata);

CREATE TABLE IF NOT EXISTS global_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  indexing_error TEXT NOT NULL DEFAULT '',
  ingestion_attempted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_global_documents_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_global_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_global_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_global_documents_category_status
  ON global_documents(global_category, status);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_type
  ON global_documents(global_category, document_type);
CREATE INDEX IF NOT EXISTS ix_global_documents_active
  ON global_documents(is_active);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_hash
  ON global_documents(global_category, content_hash);

CREATE TABLE IF NOT EXISTS global_document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_document_chunks_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_global_document_chunks_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_global_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_global_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_global_document_chunks_document_chunk
    UNIQUE (global_document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_global_document_chunks_category
  ON global_document_chunks(global_category);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_document_id
  ON global_document_chunks(global_document_id);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_metadata
  ON global_document_chunks USING GIN (document_metadata);

CREATE TABLE IF NOT EXISTS project_global_document_access_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_settings_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_settings_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access_settings
    UNIQUE (project_id, global_category)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_project
  ON project_global_document_access_settings(project_id);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_category
  ON project_global_document_access_settings(global_category);

CREATE TABLE IF NOT EXISTS project_global_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_global_document_access_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access
    UNIQUE (project_id, global_document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_project_category
  ON project_global_document_access(project_id, global_category);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_document
  ON project_global_document_access(global_document_id);

CREATE TABLE IF NOT EXISTS agent_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  access_level VARCHAR(30) NOT NULL DEFAULT 'read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_agent_document_access_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_mentor
    FOREIGN KEY (mentor_id) REFERENCES project_mentors(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_agent_document_access_level
    CHECK (access_level IN ('read', 'review', 'hidden_review'))
);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_project_mentor
  ON agent_document_access(project_id, mentor_id);
CREATE INDEX IF NOT EXISTS ix_agent_document_access_document
  ON agent_document_access(document_id);
CREATE INDEX IF NOT EXISTS ix_agent_document_access_company_project
  ON agent_document_access(company_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_document_access_mentor_project_document
  ON agent_document_access(mentor_id, project_id, document_id);

-- 11) Mentor chat history
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

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(160) NOT NULL,
  feature VARCHAR(80) NOT NULL,
  route VARCHAR(160) NOT NULL DEFAULT '',
  user_id UUID,
  project_name VARCHAR(160) NOT NULL DEFAULT '',
  related_table VARCHAR(120) NOT NULL DEFAULT '',
  related_id INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  billable_units INTEGER NOT NULL DEFAULT 0,
  raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ai_usage_events_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_ai_usage_events_prompt_tokens CHECK (prompt_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_completion_tokens CHECK (completion_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_total_tokens CHECK (total_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_input_tokens CHECK (input_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_output_tokens CHECK (output_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_cached_tokens CHECK (cached_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_billable_units CHECK (billable_units >= 0)
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_events_created_at
  ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_provider_model
  ON ai_usage_events(provider, model);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_feature_created
  ON ai_usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_created
  ON ai_usage_events(user_id, created_at DESC);

-- 12) Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  discount_amount_paisa INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_coupons_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_coupons_discount_amount_positive
    CHECK (discount_amount_paisa > 0)
);

CREATE INDEX IF NOT EXISTS ix_coupons_is_active ON coupons(is_active);

-- 12) Payments ledger
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(120),
  provider_payment_id VARCHAR(120),
  amount_paisa INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  purpose VARCHAR(50) NOT NULL DEFAULT 'dashboard_access',
  coins_purchased INTEGER NOT NULL DEFAULT 0,
  coin_unit_amount_paisa INTEGER NOT NULL DEFAULT 0,
  coupon_id INTEGER,
  coupon_code VARCHAR(40) NOT NULL DEFAULT '',
  coupon_discount_paisa INTEGER NOT NULL DEFAULT 0,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_coupon
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL,
  CONSTRAINT ck_payments_amount_positive
    CHECK (amount_paisa > 0),
  CONSTRAINT ck_payments_coins_nonnegative
    CHECK (coins_purchased >= 0)
);

CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS ix_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS ix_payments_purpose ON payments(purpose);
CREATE INDEX IF NOT EXISTS ix_payments_coupon_id ON payments(coupon_id);
CREATE INDEX IF NOT EXISTS ix_payments_coupon_code ON payments(coupon_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_order_id
  ON payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
  ON payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number VARCHAR(80) NOT NULL UNIQUE,
  invoice_sequence INTEGER NOT NULL,
  invoice_period VARCHAR(20) NOT NULL,
  user_id UUID NOT NULL,
  payment_id INTEGER,
  provider_payment_id VARCHAR(120) NOT NULL DEFAULT '',
  subtotal_amount_paisa INTEGER NOT NULL DEFAULT 0,
  coupon_code VARCHAR(40) NOT NULL DEFAULT '',
  coupon_discount_paisa INTEGER NOT NULL DEFAULT 0,
  recipient_name VARCHAR(160) NOT NULL,
  recipient_address TEXT NOT NULL DEFAULT '',
  recipient_contact VARCHAR(40) NOT NULL DEFAULT '',
  recipient_email VARCHAR(160) NOT NULL DEFAULT '',
  program_name TEXT NOT NULL,
  project_credit INTEGER NOT NULL DEFAULT 1,
  credit_label VARCHAR(80) NOT NULL DEFAULT 'One',
  access_duration VARCHAR(120) NOT NULL DEFAULT '3 Months Fixed Term',
  platform_url TEXT NOT NULL DEFAULT 'https://www.internzbee.in',
  nature_of_service TEXT NOT NULL DEFAULT 'Online + Weekly Session Service',
  sac_code VARCHAR(20) NOT NULL DEFAULT '999249',
  place_of_supply VARCHAR(120) NOT NULL DEFAULT 'Odisha (21)',
  transaction_type TEXT NOT NULL DEFAULT 'Intra-State (CGST + SGST)',
  taxable_amount_paisa INTEGER NOT NULL,
  cgst_paisa INTEGER NOT NULL DEFAULT 0,
  sgst_paisa INTEGER NOT NULL DEFAULT 0,
  igst_paisa INTEGER NOT NULL DEFAULT 0,
  gross_amount_paisa INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_pdf_url TEXT NOT NULL DEFAULT '',
  invoice_pdf_public_id TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  emailed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_invoices_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT chk_invoices_project_credit CHECK (project_credit > 0),
  CONSTRAINT chk_invoices_status CHECK (status IN ('generated', 'emailed', 'void'))
);

CREATE INDEX IF NOT EXISTS ix_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS ix_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS ix_invoices_created_at ON invoices(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_period_sequence
  ON invoices(invoice_period, invoice_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_payment_id
  ON invoices(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_coin_balances (
  user_id UUID PRIMARY KEY,
  coin_balance INTEGER NOT NULL DEFAULT 0,
  total_coins_purchased INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_coin_balances_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_user_coin_balances_balance_nonnegative
    CHECK (coin_balance >= 0),
  CONSTRAINT ck_user_coin_balances_total_nonnegative
    CHECK (total_coins_purchased >= 0)
);

-- 10) Project assignment requests (admin assigns project after payment)
CREATE TABLE IF NOT EXISTS project_assignment_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | assigned | closed
  assigned_project_id INTEGER,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT fk_project_assignment_requests_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_assignment_requests_project
    FOREIGN KEY (assigned_project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_assignment_requests_resolved_by
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_project_assignment_requests_user_id ON project_assignment_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_project_assignment_requests_status ON project_assignment_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_assignment_requests_open_user
  ON project_assignment_requests(user_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  testimonial_type VARCHAR(20) NOT NULL DEFAULT 'text',
  name VARCHAR(160) NOT NULL,
  role VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  video_public_id TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_testimonials_type CHECK (testimonial_type IN ('text', 'video'))
);

CREATE INDEX IF NOT EXISTS ix_testimonials_active_order
  ON testimonials(is_active, display_order, id);

CREATE TABLE IF NOT EXISTS homepage_certificates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(180) NOT NULL DEFAULT 'Demo Certificate',
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_homepage_certificates_active_order
  ON homepage_certificates(is_active, display_order, id);


ALTER TABLE projects
ADD COLUMN IF NOT EXISTS company_profile_text TEXT NOT NULL DEFAULT '';

-- 13) Self introduction / interview preparation
CREATE TABLE IF NOT EXISTS self_intro_submissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  video_s3_key TEXT NOT NULL DEFAULT '',
  video_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  analysis_provider VARCHAR(60) NOT NULL DEFAULT 'gemini',
  analysis_model VARCHAR(120) NOT NULL DEFAULT '',
  job_id VARCHAR(160) NOT NULL DEFAULT '',
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_submissions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_submissions_status
    CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_self_intro_submissions_file_size
    CHECK (file_size_bytes >= 0),
  CONSTRAINT chk_self_intro_submissions_duration
    CHECK (duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_user_created
  ON self_intro_submissions(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_status_created
  ON self_intro_submissions(status, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_job_id
  ON self_intro_submissions(job_id);

CREATE TABLE IF NOT EXISTS self_intro_reports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  transcript TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  overall_score INTEGER NOT NULL DEFAULT 0,
  clarity_score INTEGER NOT NULL DEFAULT 0,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  communication_score INTEGER NOT NULL DEFAULT 0,
  body_language_score INTEGER NOT NULL DEFAULT 0,
  structure_score INTEGER NOT NULL DEFAULT 0,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  filler_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_intro TEXT NOT NULL DEFAULT '',
  interview_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_reports_submission
    FOREIGN KEY (submission_id) REFERENCES self_intro_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_self_intro_reports_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_reports_overall_score
    CHECK (overall_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_clarity_score
    CHECK (clarity_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_confidence_score
    CHECK (confidence_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_communication_score
    CHECK (communication_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_body_language_score
    CHECK (body_language_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_structure_score
    CHECK (structure_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_reports_user_created
  ON self_intro_reports(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS self_intro_analysis_jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  queue_provider VARCHAR(40) NOT NULL DEFAULT 'local',
  external_job_id VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT NOT NULL DEFAULT '',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_analysis_jobs_submission
    FOREIGN KEY (submission_id) REFERENCES self_intro_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_self_intro_analysis_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_analysis_jobs_status
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_self_intro_analysis_jobs_attempts
    CHECK (attempts >= 0),
  CONSTRAINT chk_self_intro_analysis_jobs_max_attempts
    CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_status_available
  ON self_intro_analysis_jobs(status, available_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_submission
  ON self_intro_analysis_jobs(submission_id);
CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_user_created
  ON self_intro_analysis_jobs(user_id, created_at DESC, id DESC);\r\n\r\n-- =====================================================================
-- Migration: 2026-04-28_user_profiles_and_login_code_purpose.sql
-- =====================================================================
-- Migration: add user_profiles table
-- Date: 2026-04-28

BEGIN;

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  profile_image_url TEXT DEFAULT '',
  resume_url TEXT DEFAULT '',
  college_name VARCHAR(150) DEFAULT '',
  branch VARCHAR(100) DEFAULT '',
  semester VARCHAR(50) DEFAULT '',
  year VARCHAR(50) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);

COMMIT;


-- =====================================================================
-- Migration: 2026-04-30_project_catalog.sql
-- =====================================================================
-- Admin-managed project catalog
-- Date: 2026-04-30

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timeline_weeks INTEGER NOT NULL DEFAULT 4,
  category VARCHAR(40) NOT NULL DEFAULT 'normal',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS ix_projects_category ON projects(category);

CREATE TABLE IF NOT EXISTS project_steps (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  title VARCHAR(140) NOT NULL,
  agent_key VARCHAR(60) NOT NULL DEFAULT 'pm_agent',
  step_context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_steps_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_steps_project_order ON project_steps(project_id, step_order);
CREATE INDEX IF NOT EXISTS ix_project_steps_project_id ON project_steps(project_id);


-- =====================================================================
-- Migration: 2026-04-30_project_steps_cache.sql
-- =====================================================================
-- Cache project steps JSON for faster reads
-- Date: 2026-04-30

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS steps_json JSONB NOT NULL DEFAULT '[]'::jsonb;


-- =====================================================================
-- Migration: 2026-04-30_user_payments.sql
-- =====================================================================
-- Add payment tracking + access gating
-- Date: 2026-04-30

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS has_paid BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS paid_amount_paisa INTEGER;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS paid_currency VARCHAR(10) DEFAULT 'INR';

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(30);

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30);

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120);

CREATE INDEX IF NOT EXISTS ix_users_has_paid ON users(has_paid);

-- =====================================================================
-- Migration: 2026-05-06_payments_table.sql
-- =====================================================================
-- Payment ledger for dashboard/project access purchases
-- Keeps detailed provider records while preserving users.has_paid as the fast access flag.

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(120),
  provider_payment_id VARCHAR(120),
  amount_paisa INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  purpose VARCHAR(50) NOT NULL DEFAULT 'dashboard_access',
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT ck_payments_amount_positive
    CHECK (amount_paisa > 0)
);

CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS ix_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS ix_payments_purpose ON payments(purpose);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_order_id
  ON payments(provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
  ON payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- =====================================================================
-- Migration: 2026-05-06_project_documents.sql
-- =====================================================================
-- Project documents and private reference material for catalog projects
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS introduction_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS introduction_document_url TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS private_brd_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS private_brd_document_url TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS solution_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS solution_document_url TEXT NOT NULL DEFAULT '';

-- =====================================================================
-- Migration: 2026-05-06_project_progress_unique.sql
-- =====================================================================
-- Required by dashboard progress upsert logic.
-- Prevents duplicate progress rows for the same user/project pair.

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_progress_user_project
  ON project_progress(user_id, project_name);

-- =====================================================================
-- Migration: 2026-05-12_project_stage_documents.sql
-- =====================================================================
ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS document_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_public_id TEXT NOT NULL DEFAULT '';

-- =====================================================================
-- Migration: 2026-05-12_project_stage_progress.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_stage_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'undone',
  understood BOOLEAN NOT NULL DEFAULT FALSE,
  document_required BOOLEAN NOT NULL DEFAULT FALSE,
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_stage_progress_status CHECK (status IN ('undone', 'working', 'completed')),
  CONSTRAINT chk_project_stage_progress_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_progress_stage CHECK (stage_index >= 0),
  CONSTRAINT uq_project_stage_progress_user_project_stage UNIQUE (user_id, project_name, step_number, stage_index)
);

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_user_project
  ON project_stage_progress(user_id, project_name);

-- =====================================================================
-- Migration: 2026-05-13_project_coin_costs.sql
-- =====================================================================
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS project_coins INTEGER NOT NULL DEFAULT 1;

-- =====================================================================
-- Migration: 2026-05-14_mentor_management.sql
-- =====================================================================
-- Move hardcoded CrewAI mentor definitions into an admin-manageable table.
-- Safety: fail fast instead of waiting on table/catalog locks during deploy.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

CREATE TABLE IF NOT EXISTS project_mentors (
  id SERIAL PRIMARY KEY,
  agent_key VARCHAR(50) UNIQUE NOT NULL,
  mentor_name VARCHAR(100) NOT NULL,
  role TEXT NOT NULL,
  goal TEXT NOT NULL,
  backstory TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_public_id TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  output_format VARCHAR(20) NOT NULL DEFAULT 'markdown',
  CONSTRAINT chk_project_mentors_output_format
    CHECK (output_format IN ('markdown', 'plain_text', 'json'))
);

ALTER TABLE project_mentors
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_public_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_project_mentors_is_hidden
  ON project_mentors(is_hidden);

INSERT INTO project_mentors (agent_key, mentor_name, role, goal, backstory, is_hidden, output_format)
VALUES
  (
    'arjun',
    'Arjun',
    'Arjun - Product Manager Mentor',
    'Convert project goals into clear incremental milestones.',
    'You are Arjun, the Product Manager mentor agent. Guide the student through project workflow, requirements, stage progress, and product thinking. Do not reveal final answers, official solutions, or full implementation code. Keep replies practical and concise.',
    FALSE,
    'plain_text'
  ),
  (
    'meera',
    'Meera',
    'Meera - Architect and System Design Mentor',
    'Help students design clean architecture, data models, APIs, and scalable module boundaries.',
    'You are Meera, the Architect and System Design mentor agent. Guide the student on architecture, database design, component boundaries, data models, and scalability. Do not reveal the official architecture or complete final design.',
    FALSE,
    'plain_text'
  ),
  (
    'rohan',
    'Rohan',
    'Rohan - Tech Lead Mentor',
    'Guide students on technical implementation, debugging, APIs, structure, and maintainability using safe hints only.',
    'You are Rohan, the Tech Lead mentor agent. Guide technical implementation, debugging, backend/frontend structure, APIs, data flow, and code quality. Do not provide complete runnable code or solve the whole task.',
    FALSE,
    'plain_text'
  ),
  (
    'priya',
    'Priya',
    'Priya - QA Engineer Mentor',
    'Help students think through testing strategy, acceptance criteria, edge cases, and validation.',
    'You are Priya, the QA Engineer mentor agent. Guide testing strategy, edge cases, validation, bug discovery, acceptance criteria, and quality checks. Do not reveal hidden reviewer details or complete test suites that solve the task.',
    FALSE,
    'plain_text'
  ),
  (
    'neha',
    'Neha',
    'Neha - Hidden Code Reviewer and Evaluator',
    'Compare student work against provided evaluation context and return only controlled JSON insights.',
    'You are Neha, the hidden Code Reviewer and evaluator agent. Compare student submissions with supplied evaluation context and rubric. Never expose official solution text or code. Return controlled JSON only.',
    TRUE,
    'json'
  )
ON CONFLICT (agent_key) DO NOTHING;

COMMIT;

-- =====================================================================
-- Migration: 2026-05-15_coin_price_setting.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_app_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES ('coin_unit_amount_paisa', '350000', 'integer', 'Price of one coin in paise.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- Migration: 2026-05-18_mentor_chat_messages.sql
-- =====================================================================
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

-- =====================================================================
-- Migration: 2026-05-18_project_mentor_avatars.sql
-- =====================================================================
-- Store Cloudinary avatar metadata for admin-managed mentors.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_mentors
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_public_id TEXT NOT NULL DEFAULT '';

COMMIT;

-- =====================================================================
-- Migration: 2026-05-18_stage_document_review.sql
-- =====================================================================
-- Track mentor review status for required stage documents.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_stage_progress_document_review_status'
  ) THEN
    ALTER TABLE project_stage_progress
      ADD CONSTRAINT chk_project_stage_progress_document_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

COMMIT;

-- =====================================================================
-- Migration: 2026-05-21_razorpay_admin_settings.sql
-- =====================================================================
-- Razorpay credentials managed from the admin panel.

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES
  ('razorpay_key_id', '', 'secret', 'Razorpay key ID used for checkout orders.', NOW(), NOW()),
  ('razorpay_key_secret', '', 'secret', 'Razorpay key secret used for checkout signatures.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- Migration: 2026-05-23_admin_credentials.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL DEFAULT '',
  password_salt VARCHAR(128) NOT NULL DEFAULT '',
  can_access_admin BOOLEAN NOT NULL DEFAULT TRUE,
  bypass_otp BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_credentials
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_salt VARCHAR(128) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_admin_credentials_active ON admin_credentials(is_active);


INSERT INTO admin_credentials (
  email,
  password_hash,
  password_salt,
  can_access_admin,
  bypass_otp,
  is_active
)
VALUES (
  'accounts.main.k4x7z2q9@skillzage.com',
  '2fd8e93f60c0a9656df8502587ec9402333a442b6580e98e71697b162ee9f154b31b1b9775824b430c58a53954796c8d31a6af76891f2761999cf743bd19e867',
  'fbaa55401d005dc7e59fcefbb206cbc4',
  TRUE,
  TRUE,
  TRUE
);

-- =====================================================================
-- Migration: 2026-05-26_admin_project_drafts.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_project_drafts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  draft_key VARCHAR(120) NOT NULL DEFAULT 'project_create',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_admin_project_drafts_admin_user
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_admin_project_drafts_admin_user_key
    UNIQUE (admin_user_id, draft_key)
);

CREATE INDEX IF NOT EXISTS ix_admin_project_drafts_updated_at
  ON admin_project_drafts(updated_at DESC);

-- =====================================================================
-- Migration: 2026-05-29_stage_multiple_documents.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_stage_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_stage_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_stage_documents_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_documents_stage CHECK (stage_index >= 0)
);

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_stage
  ON project_stage_documents(user_id, project_name, step_number, stage_index);

INSERT INTO project_stage_documents (
  user_id,
  project_name,
  step_number,
  stage_index,
  document_url,
  document_name,
  document_public_id,
  created_at,
  updated_at
)
SELECT
  psp.user_id,
  psp.project_name,
  psp.step_number,
  psp.stage_index,
  psp.document_url,
  psp.document_name,
  psp.document_public_id,
  COALESCE(psp.updated_at, NOW()),
  COALESCE(psp.updated_at, NOW())
FROM project_stage_progress psp
WHERE COALESCE(psp.document_url, '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM project_stage_documents psd
    WHERE psd.user_id = psp.user_id
      AND psd.project_name = psp.project_name
      AND psd.step_number = psp.step_number
      AND psd.stage_index = psp.stage_index
      AND psd.document_url = psp.document_url
  );

-- =====================================================================
-- Migration: 2026-06-02_02_projects_company_id.sql
-- =====================================================================
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS company_id INTEGER;

UPDATE projects
SET company_id = (
  SELECT id
  FROM companies
  WHERE slug = 'internzbee-default'
  LIMIT 1
)
WHERE company_id IS NULL;

ALTER TABLE IF EXISTS projects
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_projects_company'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT fk_projects_company
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_projects_company_id
  ON projects(company_id);

CREATE INDEX IF NOT EXISTS ix_projects_company_active
  ON projects(company_id, is_active);

-- =====================================================================
-- Migration: 2026-06-02_03_project_documents.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_documents_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_project_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_project_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_project_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_project_documents_company_project
  ON project_documents(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_project_documents_project_status
  ON project_documents(project_id, status);

CREATE INDEX IF NOT EXISTS ix_project_documents_project_type
  ON project_documents(project_id, document_type);

CREATE INDEX IF NOT EXISTS ix_project_documents_active
  ON project_documents(is_active);

-- =====================================================================
-- Migration: 2026-06-02_04_document_chunks.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_document_chunks_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_document_chunks_document_chunk
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_document_chunks_company_project
  ON document_chunks(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id
  ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS ix_document_chunks_metadata
  ON document_chunks USING GIN (document_metadata);

-- =====================================================================
-- Migration: 2026-06-02_05_agent_document_access.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS agent_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  access_level VARCHAR(30) NOT NULL DEFAULT 'read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_agent_document_access_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_mentor
    FOREIGN KEY (mentor_id) REFERENCES project_mentors(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_agent_document_access_level
    CHECK (access_level IN ('read', 'review', 'hidden_review')),
  CONSTRAINT uq_agent_document_access_mentor_document
    UNIQUE (mentor_id, document_id)
);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_project_mentor
  ON agent_document_access(project_id, mentor_id);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_document
  ON agent_document_access(document_id);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_company_project
  ON agent_document_access(company_id, project_id);

-- =====================================================================
-- Migration: 2026-06-02_06_projects_company_default.sql
-- =====================================================================
DO $$
DECLARE
  default_company_id INTEGER;
BEGIN
  INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
  VALUES ('InternzBee Default', 'internzbee-default', '', 'Default company for existing projects.', TRUE, NOW(), NOW())
  ON CONFLICT (slug) DO UPDATE SET updated_at = companies.updated_at
  RETURNING id INTO default_company_id;

  IF default_company_id IS NULL THEN
    SELECT id INTO default_company_id
    FROM companies
    WHERE slug = 'internzbee-default'
    LIMIT 1;
  END IF;

  IF default_company_id IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects ALTER COLUMN company_id SET DEFAULT %s', default_company_id);
  END IF;
END $$;

-- =====================================================================
-- Migration: 2026-06-02_07_migrate_legacy_project_documents.sql
-- =====================================================================
INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Company Overview',
  'introduction',
  CASE
    WHEN COALESCE(p.introduction_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.introduction_document_url, ''),
  '',
  COALESCE(p.introduction_document, ''),
  CASE
    WHEN COALESCE(p.introduction_document, '') <> '' THEN 'uploaded'
    ELSE 'uploaded'
  END,
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.introduction_document, '') <> '' OR COALESCE(p.introduction_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'introduction'
      AND d.source_type IN ('legacy_text', 'url')
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Company Profile',
  'company_profile',
  'legacy_text',
  '',
  '',
  COALESCE(p.company_profile_text, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE COALESCE(p.company_profile_text, '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'company_profile'
      AND d.source_type = 'legacy_text'
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Private BRD',
  'private_brd',
  CASE
    WHEN COALESCE(p.private_brd_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.private_brd_document_url, ''),
  '',
  COALESCE(p.private_brd_document, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.private_brd_document, '') <> '' OR COALESCE(p.private_brd_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'private_brd'
      AND d.source_type IN ('legacy_text', 'url')
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Solution Document',
  'solution',
  CASE
    WHEN COALESCE(p.solution_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.solution_document_url, ''),
  '',
  COALESCE(p.solution_document, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.solution_document, '') <> '' OR COALESCE(p.solution_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'solution'
      AND d.source_type IN ('legacy_text', 'url')
  );

-- =====================================================================
-- Migration: 2026-06-02_08_default_agent_document_access.sql
-- =====================================================================
INSERT INTO agent_document_access (
  company_id,
  project_id,
  mentor_id,
  document_id,
  access_level,
  created_at,
  updated_at
)
SELECT
  d.company_id,
  d.project_id,
  m.id,
  d.id,
  CASE
    WHEN m.is_hidden = TRUE THEN 'hidden_review'
    WHEN d.document_type = 'private_brd' THEN 'review'
    ELSE 'read'
  END,
  NOW(),
  NOW()
FROM project_documents d
CROSS JOIN project_mentors m
WHERE d.is_active = TRUE
  AND (
    m.is_hidden = TRUE
    OR d.document_type <> 'solution'
  )
ON CONFLICT (mentor_id, document_id) DO NOTHING;

-- =====================================================================
-- Migration: 2026-06-02_09_project_document_ingestion_metadata.sql
-- =====================================================================
ALTER TABLE IF EXISTS project_documents
  ADD COLUMN IF NOT EXISTS indexing_error TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS project_documents
  ADD COLUMN IF NOT EXISTS ingestion_attempted_at TIMESTAMPTZ;

-- =====================================================================
-- Migration: 2026-06-02_10_project_document_links.sql
-- =====================================================================
ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'project';

ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(80) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_documents_scope'
  ) THEN
    ALTER TABLE project_documents
      ADD CONSTRAINT chk_project_documents_scope
      CHECK (scope IN ('project', 'company'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_type
  ON project_documents(company_id, scope, document_type);

CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_hash
  ON project_documents(company_id, scope, content_hash);

CREATE TABLE IF NOT EXISTS project_document_links (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  link_type VARCHAR(30) NOT NULL DEFAULT 'attached',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_document_links_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_document_links_type
    CHECK (link_type IN ('attached', 'owner', 'inherited')),
  CONSTRAINT uq_project_document_links_project_document
    UNIQUE (project_id, document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_document_links_company_project
  ON project_document_links(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_project_document_links_document
  ON project_document_links(document_id);

INSERT INTO project_document_links (company_id, project_id, document_id, link_type, created_at, updated_at)
SELECT company_id, project_id, id, 'owner', NOW(), NOW()
FROM project_documents
ON CONFLICT (project_id, document_id) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_document_access_mentor_project_document
  ON agent_document_access(mentor_id, project_id, document_id);

-- =====================================================================
-- Migration: 2026-06-16_02_stage_document_history.sql
-- =====================================================================
-- Preserve every stage document upload and store review results per submission batch.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_submission_group_id TEXT NOT NULL DEFAULT '';

ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_stage_documents_review_status'
  ) THEN
    ALTER TABLE project_stage_documents
      ADD CONSTRAINT chk_project_stage_documents_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;

-- =====================================================================
-- Migration: 2026-06-17_01_users_created_at.sql
-- =====================================================================
-- Add created_at to users table to track registration date.
-- Existing rows get the current timestamp as a reasonable default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =====================================================================
-- Migration: 2026-06-19_01_project_stage_progress_columns.sql
-- =====================================================================
-- Migration: Add missing columns to project_stage_progress table
-- Date: 2026-06-19

BEGIN;

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS document_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_public_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

COMMIT;

-- =====================================================================
-- Migration: 2026-06-19_01_stage_progress_document_columns.sql
-- =====================================================================
-- Catch-up migration: adds all document review + submission group columns
-- that may be missing if 2026-05-18_stage_document_review.sql or
-- 2026-06-16_02_stage_document_history.sql were not applied.
-- All statements use IF NOT EXISTS / DO blocks so running twice is safe.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- 1) project_stage_progress: review columns (from 2026-05-18)
ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_review_status    VARCHAR(20)  NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback  TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at      TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_project_stage_progress_document_review_status'
  ) THEN
    ALTER TABLE project_stage_progress
      ADD CONSTRAINT chk_project_stage_progress_document_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

-- 2) project_stage_progress: submission group column (from 2026-06-16_02)
ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_submission_group_id TEXT NOT NULL DEFAULT '';

-- 3) project_stage_documents: submission group + review columns (from 2026-06-16_02)
ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id       TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status    VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback  TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at      TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_project_stage_documents_review_status'
  ) THEN
    ALTER TABLE project_stage_documents
      ADD CONSTRAINT chk_project_stage_documents_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;

-- =====================================================================
-- Migration: 2026-06-19_02_add_submission_group_to_documents.sql
-- =====================================================================
-- Migration: Add submission_group_id to project_stage_documents table
-- Date: 2026-06-19

BEGIN;

ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;

-- =====================================================================
-- Migration: 2026-06-25_01_ai_usage_events.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(160) NOT NULL,
  feature VARCHAR(80) NOT NULL,
  route VARCHAR(160) NOT NULL DEFAULT '',
  user_id UUID,
  project_name VARCHAR(160) NOT NULL DEFAULT '',
  related_table VARCHAR(120) NOT NULL DEFAULT '',
  related_id INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  billable_units INTEGER NOT NULL DEFAULT 0,
  raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ai_usage_events_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_ai_usage_events_prompt_tokens CHECK (prompt_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_completion_tokens CHECK (completion_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_total_tokens CHECK (total_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_input_tokens CHECK (input_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_output_tokens CHECK (output_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_cached_tokens CHECK (cached_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_billable_units CHECK (billable_units >= 0)
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_events_created_at
  ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_provider_model
  ON ai_usage_events(provider, model);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_feature_created
  ON ai_usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_created
  ON ai_usage_events(user_id, created_at DESC);

-- =====================================================================
-- Migration: 2026-07-07_01_users_last_seen_at.sql
-- =====================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_users_last_seen_at
  ON users(last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;

-- =====================================================================
-- Migration: 2026-07-09_01_project_recommendation_fields.sql
-- =====================================================================
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS complexity VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills_required TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills_gained TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_branch TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_year TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tech_stack TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS short_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS domain VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prerequisites TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS learning_outcomes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty_score INTEGER NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS ix_projects_domain ON projects(domain);
CREATE INDEX IF NOT EXISTS ix_projects_complexity ON projects(complexity);

CREATE TABLE IF NOT EXISTS project_recommendation_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  project_title VARCHAR(160) NOT NULL DEFAULT '',
  rank INTEGER NOT NULL DEFAULT 1,
  match_percent INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  source VARCHAR(60) NOT NULL DEFAULT '',
  resume_url TEXT NOT NULL DEFAULT '',
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_recommendation_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_recommendation_logs_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_user_shown
  ON project_recommendation_logs(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_shown
  ON project_recommendation_logs(shown_at DESC);

-- =====================================================================
-- Migration: 2026-07-13_01_users_account_management_columns.sql
-- =====================================================================
-- Account management support for existing databases.
-- Idempotent: safe to run even if one or both columns already exist.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ix_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS ix_users_created_at ON users(created_at DESC);

-- =====================================================================
-- Migration: 2026-07-20_01_stage_document_review_audits.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS stage_document_review_audits (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  submission_group_id TEXT NOT NULL DEFAULT '',
  document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  parser_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_markdown TEXT NOT NULL DEFAULT '',
  optimized_text TEXT NOT NULL DEFAULT '',
  prompt_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_prompt TEXT NOT NULL DEFAULT '',
  llm_raw_output TEXT NOT NULL DEFAULT '',
  llm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_source TEXT NOT NULL DEFAULT '',
  review_status VARCHAR(20) NOT NULL DEFAULT 'rejected',
  review_score INTEGER NOT NULL DEFAULT 0,
  review_feedback TEXT NOT NULL DEFAULT '',
  github_required BOOLEAN NOT NULL DEFAULT FALSE,
  github_connected BOOLEAN NOT NULL DEFAULT TRUE,
  stage_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_stage_document_review_audits_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_stage_document_review_audits_stage CHECK (stage_index >= 0),
  CONSTRAINT chk_stage_document_review_audits_step CHECK (step_number >= 1),
  CONSTRAINT chk_stage_document_review_audits_status CHECK (review_status IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_user_project
  ON stage_document_review_audits(user_id, project_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_group
  ON stage_document_review_audits(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;

-- =====================================================================
-- Migration: 2026-07-21_01_global_category_documents.sql
-- =====================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS global_category VARCHAR(80) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_projects_global_category
  ON projects(global_category);

CREATE TABLE IF NOT EXISTS global_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  indexing_error TEXT NOT NULL DEFAULT '',
  ingestion_attempted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_global_documents_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_global_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_global_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_global_documents_category_status
  ON global_documents(global_category, status);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_type
  ON global_documents(global_category, document_type);
CREATE INDEX IF NOT EXISTS ix_global_documents_active
  ON global_documents(is_active);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_hash
  ON global_documents(global_category, content_hash);

CREATE TABLE IF NOT EXISTS global_document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_document_chunks_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_global_document_chunks_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_global_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_global_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_global_document_chunks_document_chunk
    UNIQUE (global_document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_global_document_chunks_category
  ON global_document_chunks(global_category);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_document_id
  ON global_document_chunks(global_document_id);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_metadata
  ON global_document_chunks USING GIN (document_metadata);

-- =====================================================================
-- Migration: 2026-07-21_02_global_document_access_matrix.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_global_document_access_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_settings_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_settings_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access_settings
    UNIQUE (project_id, global_category)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_project
  ON project_global_document_access_settings(project_id);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_category
  ON project_global_document_access_settings(global_category);

CREATE TABLE IF NOT EXISTS project_global_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_global_document_access_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access
    UNIQUE (project_id, global_document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_project_category
  ON project_global_document_access(project_id, global_category);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_document
  ON project_global_document_access(global_document_id);

-- =====================================================================
-- Migration: 2026-07-22_01_global_category_document_access.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS global_category_document_access_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_global_category_document_access_settings_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_global_category_document_access_settings
    UNIQUE (global_category)
);

CREATE TABLE IF NOT EXISTS global_category_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  global_document_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_category_document_access_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_global_category_document_access_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_global_category_document_access
    UNIQUE (global_category, global_document_id)
);

CREATE INDEX IF NOT EXISTS ix_global_category_document_access_category
  ON global_category_document_access(global_category);
CREATE INDEX IF NOT EXISTS ix_global_category_document_access_document
  ON global_category_document_access(global_document_id);

-- =====================================================================
-- Migration: 2026-07-27_01_stage_review_github_connected_default.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

ALTER TABLE stage_document_review_audits
  ALTER COLUMN github_connected SET DEFAULT FALSE;

COMMIT;

-- =====================================================================
-- Migration: 2026-07-27_02_project_category_icons.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_category_icons (
  global_category VARCHAR(80) PRIMARY KEY,
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_category_icons_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'))
);

-- =====================================================================
-- Migration: 2026-07-27_create_notification_history.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  github_repository_id INTEGER,
  github_review_job_id BIGINT,
  github_review_job_result_id BIGINT,
  stage_id INTEGER,
  scheduler_log_id BIGINT,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  delivery_status TEXT NOT NULL DEFAULT 'queued',
  dedupe_key VARCHAR(240) NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_notification_history_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_history_repository
    FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_job
    FOREIGN KEY (github_review_job_id) REFERENCES github_review_jobs(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_result
    FOREIGN KEY (github_review_job_result_id) REFERENCES github_review_job_results(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_stage
    FOREIGN KEY (stage_id) REFERENCES project_stage_progress(id) ON DELETE SET NULL,
  CONSTRAINT uq_notification_history_dedupe_key
    UNIQUE (dedupe_key),
  CONSTRAINT chk_notification_history_type
    CHECK (notification_type IN (
      'github_connect_required',
      'review_ready',
      'review_failed',
      'inactive_reminder',
      'scheduler_summary'
    )),
  CONSTRAINT chk_notification_history_channel
    CHECK (channel IN ('in_app', 'email', 'push', 'sms')),
  CONSTRAINT chk_notification_history_delivery_status
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  CONSTRAINT chk_notification_history_dedupe_key
    CHECK (btrim(dedupe_key) <> '')
);

CREATE INDEX IF NOT EXISTS ix_notification_history_user_created
  ON notification_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_status_created
  ON notification_history(delivery_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_type_created
  ON notification_history(notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_unread
  ON notification_history(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_history_payload_gin
  ON notification_history USING GIN (payload);

COMMENT ON TABLE notification_history IS 'Append-only notification ledger for connection prompts, review outcomes, and inactivity reminders.';

COMMIT;

-- =====================================================================
-- Migration: 2026-07-27_create_scheduler_logs.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS scheduler_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheduler_name TEXT NOT NULL DEFAULT 'inactive_student_scheduler',
  run_type TEXT NOT NULL DEFAULT 'inactive_student_scan',
  run_status TEXT NOT NULL DEFAULT 'running',
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inactive_count INTEGER NOT NULL DEFAULT 0,
  notification_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  initiated_by_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_scheduler_logs_initiated_by_user
    FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_scheduler_logs_name_scheduled_for
    UNIQUE (scheduler_name, scheduled_for),
  CONSTRAINT chk_scheduler_logs_status
    CHECK (run_status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT chk_scheduler_logs_processed_count
    CHECK (processed_count >= 0 AND inactive_count >= 0 AND notification_count >= 0 AND error_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_status_started
  ON scheduler_logs(run_status, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_name_started
  ON scheduler_logs(scheduler_name, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_scheduled_for
  ON scheduler_logs(scheduled_for DESC);

COMMENT ON TABLE scheduler_logs IS 'Execution history for the 3-day inactivity scheduler and reminder dispatches.';

COMMIT;

-- =====================================================================
-- Migration: 2026-07-27_indexes_constraints.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_working_lookup
  ON project_stage_progress(user_id, project_name, step_number, stage_index)
  WHERE status = 'working';

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_completed_lookup
  ON project_stage_progress(user_id, project_name, step_number, stage_index)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_active_lookup
  ON github_review_jobs(github_repository_id, job_status, queued_at DESC)
  WHERE job_status IN ('queued', 'dispatched', 'running', 'retry_wait');

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_stage_commit
  ON github_review_jobs(stage_id, commit_hash);

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_payload_gin
  ON github_review_job_results USING GIN (review_payload);

CREATE INDEX IF NOT EXISTS ix_notification_history_pending_delivery
  ON notification_history(delivery_status, created_at DESC)
  WHERE delivery_status IN ('queued', 'sent');

CREATE INDEX IF NOT EXISTS ix_notification_history_scheduler_log_id
  ON notification_history(scheduler_log_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_notification_history_scheduler_log'
      AND conrelid = 'notification_history'::regclass
  ) THEN
    ALTER TABLE notification_history
      ADD CONSTRAINT fk_notification_history_scheduler_log
      FOREIGN KEY (scheduler_log_id) REFERENCES scheduler_logs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_github_activity_logs_correlation_id
  ON github_activity_logs(correlation_id)
  WHERE correlation_id <> '';

CREATE INDEX IF NOT EXISTS ix_github_commit_history_changed_files_gin
  ON github_commit_history USING GIN (changed_files);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_status_completed
  ON scheduler_logs(run_status, completed_at DESC);

CREATE INDEX IF NOT EXISTS ix_code_reviews_job_id
  ON code_reviews(github_review_job_id);

CREATE INDEX IF NOT EXISTS ix_code_reviews_result_id
  ON code_reviews(github_review_job_result_id)
  WHERE github_review_job_result_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_code_reviews_repository_stage_commit
  ON code_reviews(github_repository_id, stage_id, commit_hash)
  WHERE github_repository_id IS NOT NULL AND stage_id IS NOT NULL AND commit_hash IS NOT NULL;

COMMENT ON INDEX uq_github_activity_logs_correlation_id IS 'Prevents duplicate activity traces when the same correlation id is replayed.';
COMMENT ON INDEX uq_code_reviews_repository_stage_commit IS 'Compatibility-layer duplicate protection for legacy review summary reads.';

COMMIT;

-- =====================================================================
-- Migration: 2026-07-27_seed_default_values.sql
-- =====================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

UPDATE github_repositories
SET
  connection_status = COALESCE(connection_status, 'disconnected'),
  default_branch = COALESCE(NULLIF(btrim(default_branch), ''), 'main'),
  webhook_enabled = COALESCE(webhook_enabled, FALSE),
  last_scheduler_check = COALESCE(last_scheduler_check, last_pull_at, connected_at),
  connection_verified_at = COALESCE(connection_verified_at, CASE WHEN connection_status = 'connected' THEN connected_at ELSE NULL END)
WHERE
  connection_status IS NULL
  OR default_branch IS NULL
  OR webhook_enabled IS NULL
  OR last_scheduler_check IS NULL
  OR connection_verified_at IS NULL;

UPDATE github_review_jobs
SET
  review_source = COALESCE(NULLIF(btrim(review_source), ''), 'stage_resolver'),
  triggered_by = COALESCE(NULLIF(btrim(triggered_by), ''), 'system'),
  queue_name = COALESCE(NULLIF(btrim(queue_name), ''), 'github_review_queue'),
  job_status = COALESCE(NULLIF(btrim(job_status), ''), 'queued'),
  retry_count = COALESCE(retry_count, 0),
  priority = COALESCE(priority, 100),
  error_message = COALESCE(error_message, ''),
  job_payload = COALESCE(job_payload, '{}'::jsonb)
WHERE
  review_source IS NULL
  OR triggered_by IS NULL
  OR queue_name IS NULL
  OR job_status IS NULL
  OR retry_count IS NULL
  OR priority IS NULL
  OR error_message IS NULL
  OR job_payload IS NULL;

UPDATE github_review_job_results
SET
  result_status = COALESCE(NULLIF(btrim(result_status), ''), 'succeeded'),
  review_version = COALESCE(review_version, 1),
  model_used = COALESCE(model_used, ''),
  token_usage = COALESCE(token_usage, '{}'::jsonb),
  findings = COALESCE(findings, '[]'::jsonb),
  recommendations = COALESCE(recommendations, '[]'::jsonb),
  review_payload = COALESCE(review_payload, '{}'::jsonb)
WHERE
  result_status IS NULL
  OR review_version IS NULL
  OR model_used IS NULL
  OR token_usage IS NULL
  OR findings IS NULL
  OR recommendations IS NULL
  OR review_payload IS NULL;

UPDATE code_reviews
SET
  review_source = COALESCE(NULLIF(btrim(review_source), ''), 'legacy'),
  review_status = COALESCE(NULLIF(btrim(review_status), ''), 'completed'),
  review_version = COALESCE(review_version, 1),
  overall_score = COALESCE(overall_score, 0),
  reviewed_at = COALESCE(reviewed_at, created_at),
  updated_at = COALESCE(updated_at, NOW())
WHERE
  review_source IS NULL
  OR review_status IS NULL
  OR review_version IS NULL
  OR overall_score IS NULL
  OR reviewed_at IS NULL
  OR updated_at IS NULL;

UPDATE notification_history
SET
  channel = COALESCE(NULLIF(btrim(channel), ''), 'in_app'),
  delivery_status = COALESCE(NULLIF(btrim(delivery_status), ''), 'queued'),
  payload = COALESCE(payload, '{}'::jsonb),
  error_message = COALESCE(error_message, '')
WHERE
  channel IS NULL
  OR delivery_status IS NULL
  OR payload IS NULL
  OR error_message IS NULL;

UPDATE github_activity_logs
SET
  activity_status = COALESCE(NULLIF(btrim(activity_status), ''), 'success'),
  source = COALESCE(NULLIF(btrim(source), ''), 'system'),
  correlation_id = COALESCE(correlation_id, ''),
  details = COALESCE(details, '{}'::jsonb)
WHERE
  activity_status IS NULL
  OR source IS NULL
  OR correlation_id IS NULL
  OR details IS NULL;

UPDATE scheduler_logs
SET
  scheduler_name = COALESCE(NULLIF(btrim(scheduler_name), ''), 'inactive_student_scheduler'),
  run_type = COALESCE(NULLIF(btrim(run_type), ''), 'inactive_student_scan'),
  run_status = COALESCE(NULLIF(btrim(run_status), ''), 'running'),
  payload = COALESCE(payload, '{}'::jsonb),
  error_message = COALESCE(error_message, '')
WHERE
  scheduler_name IS NULL
  OR run_type IS NULL
  OR run_status IS NULL
  OR payload IS NULL
  OR error_message IS NULL;

COMMIT;

-- =====================================================================
-- Migration: 2026-07-28_01_add_law_global_category.sql
-- =====================================================================
ALTER TABLE IF EXISTS global_documents
  ADD CONSTRAINT chk_global_documents_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_document_chunks
  ADD CONSTRAINT chk_global_document_chunks_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_global_document_access_settings
  ADD CONSTRAINT chk_project_global_document_access_settings_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_global_document_access
  ADD CONSTRAINT chk_project_global_document_access_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_category_document_access_settings
  ADD CONSTRAINT chk_global_category_document_access_settings_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_category_document_access
  ADD CONSTRAINT chk_global_category_document_access_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_category_icons
  ADD CONSTRAINT chk_project_category_icons_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

-- =====================================================================
-- Migration: 2026-07-29_01_category_background_images.sql
-- =====================================================================
ALTER TABLE IF EXISTS project_category_icons
  ADD COLUMN IF NOT EXISTS background_image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_image_public_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_original_filename VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_mime_type VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_file_size_bytes BIGINT NOT NULL DEFAULT 0;

-- =====================================================================
-- Migration: 2026-07-31_theme_cms_refinement.sql
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS theme_asset_library (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  asset_type VARCHAR(40) NOT NULL,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum CHAR(64) NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_theme_asset_library_type CHECK (asset_type IN ('banner','decoration','logo','background','image'))
);
CREATE INDEX IF NOT EXISTS ix_theme_asset_library_type_name ON theme_asset_library(asset_type, name);

ALTER TABLE theme_assets ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES theme_asset_library(id) ON DELETE SET NULL;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES theme_asset_library(id) ON DELETE SET NULL;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS placement_slot VARCHAR(40) NOT NULL DEFAULT 'floating';
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS offset_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS offset_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS desktop_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS tablet_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS mobile_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_theme_decorations_asset_id ON theme_decorations(asset_id);
CREATE INDEX IF NOT EXISTS ix_theme_decorations_slot_page ON theme_decorations(theme_id, page, placement_slot, enabled);

CREATE OR REPLACE FUNCTION set_theme_decoration_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER theme_decorations_set_updated_at BEFORE UPDATE ON theme_decorations FOR EACH ROW EXECUTE FUNCTION set_theme_decoration_updated_at();

COMMIT;

-- Rollback (run separately):

-- =====================================================================
-- Migration: 2026-08-02_01_visual_theme_cms.sql
-- =====================================================================
BEGIN;

ALTER TABLE themes ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'Seasonal';
ALTER TABLE themes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
ALTER TABLE themes ADD COLUMN IF NOT EXISTS tokens JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE themes ADD CONSTRAINT chk_themes_status CHECK (status IN ('draft', 'scheduled', 'published', 'archived'));

ALTER TABLE theme_asset_library ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE theme_asset_library ADD CONSTRAINT chk_theme_asset_library_type CHECK (asset_type IN ('banner','decoration','logo','background','icon','animation','image'));

CREATE INDEX IF NOT EXISTS ix_theme_asset_library_tags ON theme_asset_library USING GIN(tags);

COMMIT;

-- Rollback (run separately):

-- =====================================================================
-- Migration: 2026-08-03_01_theme_decoration_animations.sql
-- =====================================================================
BEGIN;

ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_type VARCHAR(40) NOT NULL DEFAULT 'none';
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_duration_ms INTEGER NOT NULL DEFAULT 2800;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_amplitude INTEGER NOT NULL DEFAULT 10;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS blend_light_background BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE theme_decorations ADD CONSTRAINT chk_theme_decorations_animation_type CHECK (animation_type IN ('none', 'pendulum'));

COMMIT;

-- Rollback (run separately):


-- =====================================================================
-- Migration: 2026-08-13_01_startup_journey_schema.sql
-- =====================================================================
-- Migration: 2026-08-13_01_startup_journey_schema
-- Description: Adds a startup-journey schema for student profiles, phases,
-- stages, hierarchical RAG content, conversation memory, and agent runs.

-- +up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  education_level VARCHAR(80) NOT NULL DEFAULT '',
  location_text VARCHAR(160) NOT NULL DEFAULT '',
  country VARCHAR(80) NOT NULL DEFAULT '',
  state_region VARCHAR(120) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  interests TEXT NOT NULL DEFAULT '',
  available_time_hours_per_week INTEGER NOT NULL DEFAULT 0,
  available_resources TEXT NOT NULL DEFAULT '',
  participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual',
  current_idea_text TEXT NOT NULL DEFAULT '',
  startup_stage VARCHAR(30) NOT NULL DEFAULT 'no_idea',
  preferred_language VARCHAR(20) NOT NULL DEFAULT 'english',
  goal_type VARCHAR(40) NOT NULL DEFAULT 'commercial',
  profile_summary TEXT NOT NULL DEFAULT '',
  readiness_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_student_profiles_age CHECK (age IS NULL OR (age >= 10 AND age <= 100)),
  CONSTRAINT chk_student_profiles_participation_mode CHECK (participation_mode IN ('individual', 'team', 'either')),
  CONSTRAINT chk_student_profiles_startup_stage CHECK (startup_stage IN ('no_idea', 'idea', 'validation', 'prototype', 'early_business', 'growth')),
  CONSTRAINT chk_student_profiles_goal_type CHECK (goal_type IN ('social', 'environmental', 'commercial', 'technology')),
  CONSTRAINT chk_student_profiles_readiness_score CHECK (readiness_score >= 0 AND readiness_score <= 100)
);

CREATE INDEX IF NOT EXISTS ix_student_profiles_user_id ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS ix_student_profiles_stage ON student_profiles(startup_stage);
CREATE INDEX IF NOT EXISTS ix_student_profiles_language ON student_profiles(preferred_language);

CREATE TABLE IF NOT EXISTS startup_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
  idea_title VARCHAR(180) NOT NULL DEFAULT '',
  problem_statement TEXT NOT NULL DEFAULT '',
  solution_summary TEXT NOT NULL DEFAULT '',
  target_users TEXT NOT NULL DEFAULT '',
  industry_tags TEXT NOT NULL DEFAULT '',
  idea_status VARCHAR(30) NOT NULL DEFAULT 'active',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_startup_ideas_status CHECK (idea_status IN ('active', 'archived', 'draft')),
  CONSTRAINT chk_startup_ideas_primary_flag CHECK (is_primary IN (FALSE, TRUE))
);

CREATE INDEX IF NOT EXISTS ix_startup_ideas_user_id ON startup_ideas(user_id);
CREATE INDEX IF NOT EXISTS ix_startup_ideas_profile_id ON startup_ideas(profile_id);
CREATE INDEX IF NOT EXISTS ix_startup_ideas_status ON startup_ideas(idea_status);
CREATE INDEX IF NOT EXISTS ix_startup_ideas_active ON startup_ideas(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_startup_ideas_primary_per_user
  ON startup_ideas(user_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS journey_phases (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phase_key VARCHAR(80) NOT NULL UNIQUE,
  phase_order INTEGER NOT NULL,
  phase_name VARCHAR(160) NOT NULL,
  phase_description TEXT NOT NULL DEFAULT '',
  phase_objective TEXT NOT NULL DEFAULT '',
  intended_audience TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journey_phases_order UNIQUE (phase_order)
);

CREATE INDEX IF NOT EXISTS ix_journey_phases_active_order ON journey_phases(is_active, phase_order);

CREATE TABLE IF NOT EXISTS journey_stages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phase_id INTEGER NOT NULL REFERENCES journey_phases(id) ON DELETE CASCADE,
  stage_key VARCHAR(80) NOT NULL,
  stage_order INTEGER NOT NULL,
  stage_name VARCHAR(160) NOT NULL,
  stage_context TEXT NOT NULL DEFAULT '',
  stage_objective TEXT NOT NULL DEFAULT '',
  expected_outcome TEXT NOT NULL DEFAULT '',
  readiness_criteria TEXT NOT NULL DEFAULT '',
  recommended_actions TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journey_stages_phase_order UNIQUE (phase_id, stage_order),
  CONSTRAINT uq_journey_stages_phase_key UNIQUE (phase_id, stage_key)
);

CREATE INDEX IF NOT EXISTS ix_journey_stages_phase_id ON journey_stages(phase_id);
CREATE INDEX IF NOT EXISTS ix_journey_stages_active_order ON journey_stages(is_active, stage_order);

CREATE TABLE IF NOT EXISTS stage_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE SET NULL,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'reference',
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  source_url TEXT NOT NULL DEFAULT '',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  language VARCHAR(20) NOT NULL DEFAULT 'english',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  indexed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_stage_documents_source_type CHECK (source_type IN ('manual', 'upload', 'url', 'seed', 'web')),
  CONSTRAINT chk_stage_documents_document_type CHECK (document_type IN ('reference', 'policy', 'prompt', 'example', 'research', 'template')),
  CONSTRAINT chk_stage_documents_language CHECK (language <> '')
);

CREATE INDEX IF NOT EXISTS ix_stage_documents_stage_id ON stage_documents(stage_id);
CREATE INDEX IF NOT EXISTS ix_stage_documents_phase_id ON stage_documents(phase_id);
CREATE INDEX IF NOT EXISTS ix_stage_documents_active ON stage_documents(is_active);
CREATE INDEX IF NOT EXISTS ix_stage_documents_tags ON stage_documents USING GIN(tags);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_documents_source
  ON stage_documents(stage_id, content_hash)
  WHERE content_hash <> '';

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE SET NULL,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES startup_ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_scope VARCHAR(30) NOT NULL DEFAULT 'global',
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  title VARCHAR(240) NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_knowledge_sources_scope CHECK (source_scope IN ('global', 'phase', 'stage', 'idea', 'user')),
  CONSTRAINT chk_knowledge_sources_type CHECK (source_type IN ('manual', 'upload', 'url', 'seed', 'web'))
);

CREATE INDEX IF NOT EXISTS ix_knowledge_sources_scope ON knowledge_sources(source_scope, is_active);
CREATE INDEX IF NOT EXISTS ix_knowledge_sources_phase_id ON knowledge_sources(phase_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_sources_stage_id ON knowledge_sources(stage_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_sources_user_id ON knowledge_sources(user_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_sources_tags ON knowledge_sources USING GIN(tags);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_sources_hash
  ON knowledge_sources(content_hash)
  WHERE content_hash <> '';

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  vector_ref TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_knowledge_chunks_source_index UNIQUE (source_id, chunk_index),
  CONSTRAINT chk_knowledge_chunks_chunk_index CHECK (chunk_index >= 0),
  CONSTRAINT chk_knowledge_chunks_token_count CHECK (token_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_source_id ON knowledge_chunks(source_id);

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES startup_ideas(id) ON DELETE SET NULL,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE SET NULL,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL,
  session_title VARCHAR(180) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  language VARCHAR(20) NOT NULL DEFAULT 'english',
  memory_summary TEXT NOT NULL DEFAULT '',
  memory_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_user_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conversation_sessions_status CHECK (status IN ('active', 'paused', 'closed'))
);

CREATE INDEX IF NOT EXISTS ix_conversation_sessions_user_created ON conversation_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_conversation_sessions_stage_id ON conversation_sessions(stage_id);
CREATE INDEX IF NOT EXISTS ix_conversation_sessions_phase_id ON conversation_sessions(phase_id);
CREATE INDEX IF NOT EXISTS ix_conversation_sessions_status ON conversation_sessions(status);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  message_type VARCHAR(30) NOT NULL DEFAULT 'chat',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conversation_messages_role CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  CONSTRAINT chk_conversation_messages_type CHECK (message_type IN ('chat', 'memory', 'retrieval', 'search', 'tool'))
);

CREATE INDEX IF NOT EXISTS ix_conversation_messages_session_created ON conversation_messages(session_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS ix_conversation_messages_user_created ON conversation_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_summaries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES startup_ideas(id) ON DELETE CASCADE,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE CASCADE,
  memory_scope VARCHAR(30) NOT NULL,
  summary_text TEXT NOT NULL,
  summary_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_memory_summaries_scope CHECK (memory_scope IN ('profile', 'idea', 'phase', 'stage', 'session', 'global'))
);

CREATE INDEX IF NOT EXISTS ix_memory_summaries_user_scope ON memory_summaries(user_id, memory_scope);
CREATE INDEX IF NOT EXISTS ix_memory_summaries_session_id ON memory_summaries(session_id);
CREATE INDEX IF NOT EXISTS ix_memory_summaries_phase_id ON memory_summaries(phase_id);
CREATE INDEX IF NOT EXISTS ix_memory_summaries_stage_id ON memory_summaries(stage_id);
CREATE INDEX IF NOT EXISTS ix_memory_summaries_active ON memory_summaries(is_active);

CREATE TABLE IF NOT EXISTS student_stage_progress (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES startup_ideas(id) ON DELETE SET NULL,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE SET NULL,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  last_question TEXT NOT NULL DEFAULT '',
  last_answer TEXT NOT NULL DEFAULT '',
  stage_notes TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_student_stage_progress_status CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  CONSTRAINT chk_student_stage_progress_percent CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS ix_student_stage_progress_user_created ON student_stage_progress(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_student_stage_progress_phase_stage ON student_stage_progress(phase_id, stage_id);
CREATE INDEX IF NOT EXISTS ix_student_stage_progress_status ON student_stage_progress(status);

CREATE TABLE IF NOT EXISTS agent_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES startup_ideas(id) ON DELETE SET NULL,
  phase_id INTEGER REFERENCES journey_phases(id) ON DELETE SET NULL,
  stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  router_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieved_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_answer TEXT NOT NULL DEFAULT '',
  model_name VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  used_web_search BOOLEAN NOT NULL DEFAULT FALSE,
  used_memory BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agent_runs_status CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_agent_runs_user_created ON agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_runs_session_id ON agent_runs(session_id);
CREATE INDEX IF NOT EXISTS ix_agent_runs_phase_stage ON agent_runs(phase_id, stage_id);
CREATE INDEX IF NOT EXISTS ix_agent_runs_status ON agent_runs(status);

CREATE TABLE IF NOT EXISTS web_search_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_run_id BIGINT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  source_name VARCHAR(160) NOT NULL DEFAULT '',
  result_title TEXT NOT NULL DEFAULT '',
  result_url TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  rank_position INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chk_web_search_results_rank CHECK (rank_position >= 0)
);

CREATE INDEX IF NOT EXISTS ix_web_search_results_agent_run_id ON web_search_results(agent_run_id);
CREATE INDEX IF NOT EXISTS ix_web_search_results_query_text ON web_search_results USING GIN (to_tsvector('english', query_text));

-- =====================================================================
-- Migration: 2026-08-14_01_knowledge_sources_storage_columns.sql
-- =====================================================================
BEGIN;

-- Lets an admin-uploaded global knowledge source point at an S3 object,
-- the same way stage_documents already does.
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS storage_url TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS storage_public_id TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '';

COMMIT;

-- Rollback (run separately):

-- =====================================================================
-- Migration: 2026-08-15_01_rag_embeddings.sql
-- =====================================================================
BEGIN;

-- Real vector storage for knowledge_sources chunks (was schema-only before).
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding DOUBLE PRECISION[];
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER NOT NULL DEFAULT 0;

-- Mirrors knowledge_chunks, but for stage_documents (which had no chunk table at all).
CREATE TABLE IF NOT EXISTS stage_document_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_document_id BIGINT NOT NULL REFERENCES stage_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stage_document_chunks_doc_index UNIQUE (stage_document_id, chunk_index),
  CONSTRAINT chk_stage_document_chunks_chunk_index CHECK (chunk_index >= 0),
  CONSTRAINT chk_stage_document_chunks_token_count CHECK (token_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_stage_document_chunks_stage_document_id ON stage_document_chunks(stage_document_id);

COMMIT;

-- Rollback (run separately):

-- =====================================================================
-- Migration: 2026-08-15_02_journeys.sql
-- =====================================================================
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

-- =====================================================================
-- Migration: 2026-08-15_03_journey_stage_mentors.sql
-- =====================================================================
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

-- =====================================================================
-- Migration: 2026-08-16_01_startup_mentors_and_agent_routing.sql
-- =====================================================================
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

-- =====================================================================
-- Migration: 2026-08-16_02_users_wix_member_id.sql
-- =====================================================================
-- Add Wix Members identity mapping to users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wix_member_id VARCHAR(255);

ALTER TABLE users
  ALTER COLUMN gender SET DEFAULT 'other',
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_wix_member_id
  ON users(wix_member_id)
  WHERE wix_member_id IS NOT NULL;

-- =====================================================================
-- Migration: 2026-08-19_01_journey_scoping.sql
-- =====================================================================
-- Migration: 2026-08-19_01_journey_scoping
-- Description: Makes journey_phases (and therefore journey_stages) actually
-- belong to a specific journeys row, and lets a student be on a specific
-- journey. Backfills existing data onto one "default" journey so today's
-- single-journey behavior is unchanged until an admin/student explicitly
-- creates/picks a second one.

BEGIN;

ALTER TABLE journeys ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS journey_id INTEGER REFERENCES journeys(id) ON DELETE SET NULL;

DO $$
DECLARE
  default_journey_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journeys) THEN
    INSERT INTO journeys (journey_key, journey_name, is_default)
    VALUES ('default-journey', 'Startup Journey', TRUE)
    RETURNING id INTO default_journey_id;
  ELSIF NOT EXISTS (SELECT 1 FROM journeys WHERE is_default = TRUE) THEN
    SELECT id INTO default_journey_id FROM journeys ORDER BY id ASC LIMIT 1;
    UPDATE journeys SET is_default = TRUE WHERE id = default_journey_id;
  ELSE
    SELECT id INTO default_journey_id FROM journeys WHERE is_default = TRUE LIMIT 1;
  END IF;

  UPDATE journey_phases SET journey_id = default_journey_id WHERE journey_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journeys_single_default ON journeys(is_default) WHERE is_default = TRUE;

-- phase_order was globally unique (sql/migrations/2026-08-13_01_startup_journey_schema.sql),
-- so two journeys could never both have a "Phase 1" - scope it per journey instead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_phases_journey_order ON journey_phases(journey_id, phase_order);

COMMIT;

-- =====================================================================
-- Migration: 2026-08-20_01_deliverable_management.sql
-- =====================================================================

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

-- =====================================================================
-- Migration: 2026-08-24_01_stage_search_focus.sql
-- =====================================================================
-- Admin-authored keywords/topics that steer the stage-start web search.
ALTER TABLE journey_stages
  ADD COLUMN IF NOT EXISTS search_focus TEXT NOT NULL DEFAULT '';


-- =====================================================================
-- Migration: 2026-08-25_01_deliverable_gating.sql
-- =====================================================================
-- Admin toggle for stage deliverable gating.
ALTER TABLE journey_stages
  ADD COLUMN IF NOT EXISTS requires_deliverables BOOLEAN NOT NULL DEFAULT FALSE;

-- Admin-configured passing score for deliverable reviews.
ALTER TABLE journey_stages
  ADD COLUMN IF NOT EXISTS pass_score_threshold INTEGER NOT NULL DEFAULT 60;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_journey_stages_pass_score_threshold'
  ) THEN
    ALTER TABLE journey_stages
      ADD CONSTRAINT chk_journey_stages_pass_score_threshold
      CHECK (pass_score_threshold >= 0 AND pass_score_threshold <= 100);
  END IF;
END $$;

ALTER TABLE stage_deliverables
  ADD COLUMN IF NOT EXISTS template_url TEXT NOT NULL DEFAULT '';

ALTER TABLE stage_deliverables
  ADD COLUMN IF NOT EXISTS template_original_filename VARCHAR(255) NOT NULL DEFAULT '';


