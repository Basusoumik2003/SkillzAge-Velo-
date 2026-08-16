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
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

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
  ON self_intro_analysis_jobs(user_id, created_at DESC, id DESC);


