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

-- +down
DROP TABLE IF EXISTS web_search_results;
DROP TABLE IF EXISTS agent_runs;
DROP TABLE IF EXISTS student_stage_progress;
DROP TABLE IF EXISTS memory_summaries;
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversation_sessions;
DROP TABLE IF EXISTS knowledge_chunks;
DROP TABLE IF EXISTS knowledge_sources;
DROP TABLE IF EXISTS stage_documents;
DROP TABLE IF EXISTS journey_stages;
DROP TABLE IF EXISTS journey_phases;
DROP TABLE IF EXISTS startup_ideas;
DROP TABLE IF EXISTS student_profiles;
