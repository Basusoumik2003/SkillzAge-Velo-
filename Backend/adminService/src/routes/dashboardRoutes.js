import express from "express";
import path from "path";
import crypto from "crypto";
import { config } from "../config/config.js";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { parseMultipartFormData } from "../utils/multipart.js";
import { createPresignedS3GetUrl, uploadToS3 } from "../services/s3Service.js";


const router = express.Router();

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

let coinSchemaReady = null;
let mentorSchemaReady = null;
let certificateRequestSchemaReady = null;
let userPresenceSchemaReady = null;
let recommendationLogSchemaReady = null;

function ensureUserPresenceSchema() {
  if (!userPresenceSchemaReady) {
    userPresenceSchemaReady = pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS ix_users_last_seen_at
        ON users(last_seen_at DESC)
        WHERE last_seen_at IS NOT NULL;
    `);
  }
  return userPresenceSchemaReady;
}

function ensureCoinSchema() {
  if (!coinSchemaReady) {
    coinSchemaReady = pool.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS project_coins INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS global_category VARCHAR(80) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS is_demo_project BOOLEAN NOT NULL DEFAULT FALSE,
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
      CREATE INDEX IF NOT EXISTS ix_projects_demo_active ON projects(is_demo_project, is_active);
      CREATE INDEX IF NOT EXISTS ix_projects_global_category ON projects(global_category);
      CREATE INDEX IF NOT EXISTS ix_projects_domain ON projects(domain);
      CREATE INDEX IF NOT EXISTS ix_projects_complexity ON projects(complexity);
      CREATE TABLE IF NOT EXISTS demo_documents (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(240) NOT NULL,
        storage_url TEXT NOT NULL DEFAULT '',
        storage_public_id TEXT NOT NULL DEFAULT '',
        original_filename VARCHAR(255) NOT NULL DEFAULT '',
        mime_type VARCHAR(120) NOT NULL DEFAULT '',
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_coin_balances (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        coin_balance INTEGER NOT NULL DEFAULT 0,
        total_coins_purchased INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_user_coin_balances_balance_nonnegative CHECK (coin_balance >= 0),
        CONSTRAINT ck_user_coin_balances_total_nonnegative CHECK (total_coins_purchased >= 0)
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(120) PRIMARY KEY,
        value TEXT NOT NULL,
        value_type VARCHAR(30) NOT NULL DEFAULT 'string',
        description TEXT NOT NULL DEFAULT '',
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
      VALUES ('coin_unit_amount_paisa', '350000', 'integer', 'Price of one coin in paise.', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING;
      INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
      VALUES ('coin_original_amount_paisa', '1000000', 'integer', 'Original display price of one coin in paise.', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING;
      INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
      VALUES ('workspace_closed', 'false', 'boolean', 'Whether learner workspace access is temporarily closed.', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING;
      INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
      VALUES ('workspace_closed_message', 'The workspace is being updated right now. Please wait a little and try again shortly.', 'string', 'Message shown to learners when the workspace is closed.', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING;
      INSERT INTO user_coin_balances (user_id, coin_balance, total_coins_purchased, created_at, updated_at)
      SELECT u.id, COALESCE(SUM(p.coins_purchased), 0)::integer, COALESCE(SUM(p.coins_purchased), 0)::integer, NOW(), NOW()
      FROM users u
      INNER JOIN payments p ON p.user_id = u.id
      WHERE p.status = 'paid'
        AND p.purpose = 'coin_purchase'
        AND p.coins_purchased > 0
      GROUP BY u.id
      ON CONFLICT (user_id) DO NOTHING;
    `);
  }
  return coinSchemaReady;
}

async function getCoinUnitAmountPaisa() {
  await ensureCoinSchema();
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'coin_unit_amount_paisa' LIMIT 1`
  );
  const value = Number(rows[0]?.value);
  return Number.isFinite(value) ? Math.max(100, Math.round(value)) : 350000;
}

async function getCoinOriginalAmountPaisa() {
  await ensureCoinSchema();
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'coin_original_amount_paisa' LIMIT 1`
  );
  const value = Number(rows[0]?.value);
  return Number.isFinite(value) ? Math.max(100, Math.round(value)) : 1000000;
}

function ensureMentorSchema() {
  if (!mentorSchemaReady) {
    mentorSchemaReady = pool.query(`
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
      CREATE INDEX IF NOT EXISTS ix_project_mentors_is_hidden ON project_mentors(is_hidden);
    `);
  }
  return mentorSchemaReady;
}

function ensureCertificateRequestSchema() {
  if (!certificateRequestSchemaReady) {
    certificateRequestSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS certificate_requests (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_name VARCHAR(160) NOT NULL,
        experience_text TEXT NOT NULL DEFAULT '',
        overall_rating INTEGER NOT NULL DEFAULT 5,
        mentor_rating INTEGER NOT NULL DEFAULT 5,
        project_clarity_rating INTEGER NOT NULL DEFAULT 5,
        support_rating INTEGER NOT NULL DEFAULT 5,
        recommend_rating INTEGER NOT NULL DEFAULT 5,
        feedback_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        video_url TEXT NOT NULL DEFAULT '',
        video_public_id TEXT NOT NULL DEFAULT '',
        certificate_url TEXT NOT NULL DEFAULT '',
        certificate_public_id TEXT NOT NULL DEFAULT '',
        certificate_original_filename VARCHAR(255) NOT NULL DEFAULT '',
        certificate_mime_type VARCHAR(120) NOT NULL DEFAULT '',
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        certificate_issued_at TIMESTAMPTZ,
        certificate_emailed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_certificate_requests_status CHECK (status IN ('pending', 'submitted', 'generated', 'emailed', 'certificate_assigned')),
        CONSTRAINT chk_certificate_requests_overall_rating CHECK (overall_rating BETWEEN 1 AND 5),
        CONSTRAINT chk_certificate_requests_mentor_rating CHECK (mentor_rating BETWEEN 1 AND 5),
        CONSTRAINT chk_certificate_requests_project_clarity_rating CHECK (project_clarity_rating BETWEEN 1 AND 5),
        CONSTRAINT chk_certificate_requests_support_rating CHECK (support_rating BETWEEN 1 AND 5),
        CONSTRAINT chk_certificate_requests_recommend_rating CHECK (recommend_rating BETWEEN 1 AND 5)
      );
      ALTER TABLE certificate_requests
        ADD COLUMN IF NOT EXISTS certificate_url TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS certificate_public_id TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS certificate_original_filename VARCHAR(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS certificate_mime_type VARCHAR(120) NOT NULL DEFAULT '';
      ALTER TABLE certificate_requests
        ALTER COLUMN status TYPE VARCHAR(30),
        ALTER COLUMN status SET DEFAULT 'pending';
      ALTER TABLE certificate_requests
        DROP CONSTRAINT IF EXISTS chk_certificate_requests_status;
      ALTER TABLE certificate_requests
        ADD CONSTRAINT chk_certificate_requests_status
        CHECK (status IN ('pending', 'submitted', 'generated', 'emailed', 'certificate_assigned'));
      CREATE INDEX IF NOT EXISTS ix_certificate_requests_user_id ON certificate_requests(user_id);
      CREATE INDEX IF NOT EXISTS ix_certificate_requests_created_at ON certificate_requests(created_at DESC);
    `);
  }
  return certificateRequestSchemaReady;
}

function normalizeRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}

async function uploadCertificateFeedbackVideo({ userId, projectName, file }) {
  const ext = safeExt(file.filename);
  const id = crypto.randomBytes(10).toString("hex");
  const publicId = `u${userId}_certificate_${id}`;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: `${publicId}${ext}`,
    folder: "internlabs/certificate-feedback",
    contentType: file.contentType || "application/octet-stream",
    publicId
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    name: String(file.filename || `${String(projectName || "project")}_feedback${ext}`).slice(0, 255)
  };
}

let profileBillingColumnsReady = null;

function ensureProfileBillingColumns() {
  if (!profileBillingColumnsReady) {
    profileBillingColumnsReady = pool.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS billing_address TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40) NOT NULL DEFAULT '';
    `);
  }
  return profileBillingColumnsReady;
}

function mentorBackendKey(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  if (["priya", "qa", "qa_agent", "neha"].includes(key)) return "qa";
  if (["meera", "architect", "architect_agent", "team_lead_agent"].includes(key)) return "architect";
  if (["rohan", "tech_lead", "engineer", "engineer_agent", "dev_agent", "marketing_lead_agent", "customer_experience_agent"].includes(key)) return "tech_lead";
  if (["arjun", "pm", "pm_agent", "business_analyst_agent"].includes(key)) return "pm";
  return "pm";
}

async function getUserCoinBalance(userId, client = pool) {
  await ensureCoinSchema();
  const existing = await client.query(
    `SELECT coin_balance, total_coins_purchased
     FROM user_coin_balances
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (existing.rowCount) return existing.rows[0];

  const { rows } = await client.query(
    `INSERT INTO user_coin_balances (user_id, coin_balance, total_coins_purchased, created_at, updated_at)
     SELECT u.id,
            COALESCE(SUM(p.coins_purchased), 0)::integer,
            COALESCE(SUM(p.coins_purchased), 0)::integer,
            NOW(),
            NOW()
     FROM users u
     LEFT JOIN payments p
       ON p.user_id = u.id
      AND p.status = 'paid'
      AND p.purpose = 'coin_purchase'
      AND p.coins_purchased > 0
     WHERE u.id = $1
     GROUP BY u.id
     ON CONFLICT (user_id) DO NOTHING
     RETURNING coin_balance, total_coins_purchased`,
    [userId]
  );
  return rows[0] || { coin_balance: 0, total_coins_purchased: 0 };
}

async function fetchProfileCompletion(userId) {
  await ensureProfileBillingColumns();
  const { rows } = await pool.query(
    `SELECT COALESCE(profile_image_url,'') AS profile_image_url,
            COALESCE(resume_url,'') AS resume_url,
            COALESCE(college_name,'') AS college_name,
            COALESCE(branch,'') AS branch,
            COALESCE(semester,'') AS semester,
            COALESCE(year,'') AS year,
            COALESCE(billing_address,'') AS billing_address,
            COALESCE(contact_number,'') AS contact_number
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const profileImageUrl = rows[0]?.profile_image_url || "";
  const resumeUrl = rows[0]?.resume_url || "";
  const collegeName = rows[0]?.college_name || "";
  const branch = rows[0]?.branch || "";
  const semester = rows[0]?.semester || "";
  const year = rows[0]?.year || "";
  const billingAddress = rows[0]?.billing_address || "";
  const contactNumber = rows[0]?.contact_number || "";
  const profileComplete =
    Boolean(profileImageUrl) &&
    Boolean(resumeUrl) &&
    Boolean(collegeName) &&
    Boolean(branch) &&
    Boolean(semester) &&
    Boolean(year) &&
    Boolean(billingAddress) &&
    Boolean(contactNumber);
  return { profileComplete, profileImageUrl, resumeUrl, collegeName, branch, semester, year, billingAddress, contactNumber };
}

function requireProfileCompleteOrThrow(profileCompletion) {
  if (!profileCompletion.profileComplete) {
    const error = new Error("Please complete your full profile (photo, resume, college, branch, semester, year, billing address, and contact number) first.");
    error.statusCode = 428;
    throw error;
  }
}

const STEP_LABELS = {
  1: "Planning",
  2: "Research",
  3: "Building",
  4: "Testing",
  5: "Deploying"
};

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computePercentFromStep(step) {
  const s = Number(step);
  if (!Number.isFinite(s) || s <= 1) return 0;
  return clampPercent(((s - 1) / 5) * 100);
}

function parseProjectSteps(raw) {
  if (Array.isArray(raw)) return raw;
  const value = String(raw || "").trim();
  if (!value.startsWith("[")) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadProjectStepsFromRows(projectId) {
  if (!Number.isInteger(Number(projectId))) return [];
  const { rows } = await pool.query(
    `SELECT step_order, title, agent_key, step_context
     FROM project_steps
     WHERE project_id = $1
     ORDER BY step_order ASC, id ASC`,
    [projectId]
  );
  return rows.map((row, index) => ({
    step_order: Number(row.step_order) || index + 1,
    title: String(row.title || "").trim(),
    agent_key: String(row.agent_key || "pm_agent").trim() || "pm_agent",
    step_context: String(row.step_context || "").trim()
  })).filter((step) => step.title);
}

function parseStagesFromStepContext(text) {
  const lines = String(text || "").split(/\r?\n/);
  const stagesIndex = lines.findIndex((line) => String(line || "").trim() === "Stages:");
  if (stagesIndex === -1) return [];
  const stagesRaw = lines.slice(stagesIndex + 1).join("\n").trim();
  if (!stagesRaw) return [];
  return stagesRaw
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const blockLines = block.split("\n").map((line) => String(line || "").trim()).filter(Boolean);
      const header = String(blockLines[0] || "").trim();
      const headerMatch = header.match(/^\d+\.\s*(.*)$/);
      const githubIntegrationRequiredLine =
        blockLines.find((line) => /^github integration required:/i.test(line)) || "";
      return {
        title: String(headerMatch ? headerMatch[1] : header).trim(),
        github_integration_required: /^(yes|true|1|required)$/i.test(
          githubIntegrationRequiredLine
            .replace(/^github integration required:\s*/i, "")
            .trim()
        )
      };
    });
}

function ensureRecommendationLogSchema() {
  if (!recommendationLogSchemaReady) {
    recommendationLogSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS project_recommendation_logs (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        project_title VARCHAR(160) NOT NULL DEFAULT '',
        rank INTEGER NOT NULL DEFAULT 1,
        match_percent INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL DEFAULT '',
        source VARCHAR(60) NOT NULL DEFAULT '',
        resume_url TEXT NOT NULL DEFAULT '',
        shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_user_shown
        ON project_recommendation_logs(user_id, shown_at DESC);
      CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_shown
        ON project_recommendation_logs(shown_at DESC);
    `);
  }
  return recommendationLogSchemaReady;
}

function normalizeWorkspaceClosed(value) {
  return ["1", "true", "yes", "on", "closed"].includes(String(value || "").trim().toLowerCase());
}

function normalizeWorkspaceClosedMessage(value) {
  const fallback = "The workspace is being updated right now. Please wait a little and try again shortly.";
  const text = String(value || "").trim();
  return (text || fallback).slice(0, 500);
}

function selectedDemoDocumentIdsFromSteps(steps = []) {
  const ids = new Set();
  for (const step of steps || []) {
    const text = String(step?.step_context || "");
    for (const match of text.matchAll(/^Demo Document ID:\s*(\d+)\s*$/gim)) {
      ids.add(Number(match[1]));
    }
  }
  return [...ids].filter((id) => Number.isFinite(id) && id > 0);
}

async function loadDemoDocumentsById(ids = []) {
  const normalizedIds = [...new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!normalizedIds.length) return {};
  const { rows } = await pool.query(
    `SELECT id, name, storage_url, storage_public_id, original_filename, mime_type
     FROM demo_documents
     WHERE id = ANY($1::int[])
       AND is_active = TRUE`,
    [normalizedIds]
  );
  return Object.fromEntries(rows.map((row) => {
    const previewUrl = row.storage_public_id
      ? createPresignedS3GetUrl({ key: row.storage_public_id, expiresSeconds: 1800 })
      : row.storage_url;
    return [String(row.id), {
      id: row.id,
      name: row.name,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      preview_url: previewUrl,
      download_url: previewUrl
    }];
  }));
}

function normalizeDurationUnit(value) {
  const unit = String(value || "week").trim().toLowerCase();
  return unit.startsWith("day") ? "day" : "week";
}

function normalizeDurationValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.round(n)));
}

function parseDurationLine(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /^duration:/i.test(item));
  const match = String(line || "").match(/^duration:\s*(\d+)(?:\s*-\s*(\d+))?\s*(day|days|week|weeks)?\s*$/i);
  if (!match) return null;
  const minValue = normalizeDurationValue(match[1]);
  const maxValue = normalizeDurationValue(match[2] || match[1]);
  return {
    value: minValue,
    maxValue: Math.max(minValue, maxValue),
    unit: normalizeDurationUnit(match[3] || "week")
  };
}

function phaseDurationConfig(step) {
  const structuredValue = Number(step?.duration_value);
  const hasStructuredDuration = Number.isFinite(structuredValue) && structuredValue > 0;
  const structuredMaxValue = Number(step?.duration_max_value);
  const hasStructuredMaxDuration = Number.isFinite(structuredMaxValue) && structuredMaxValue > 0;
  const parsedDuration = parseDurationLine(step?.step_context);
  if (!hasStructuredDuration && !parsedDuration) return null;
  const minValue = hasStructuredDuration ? normalizeDurationValue(structuredValue) : normalizeDurationValue(parsedDuration.value);
  const maxValue = hasStructuredMaxDuration
    ? Math.max(minValue, normalizeDurationValue(structuredMaxValue))
    : Math.max(minValue, normalizeDurationValue(parsedDuration?.maxValue || parsedDuration?.value));
  const unit = hasStructuredDuration ? normalizeDurationUnit(step?.duration_unit) : normalizeDurationUnit(parsedDuration.unit);
  return {
    minValue,
    maxValue,
    unit,
    minDays: unit === "day" ? minValue : minValue * 7,
    maxDays: unit === "day" ? maxValue : maxValue * 7
  };
}

function buildPhaseTimeline({ row, stageRows = [], steps = parseProjectSteps(row?.steps_json), currentStep }) {
  const stepNumber = Math.max(1, Number(currentStep || row?.current_step) || 1);
  const step = steps[stepNumber - 1] || {};
  const duration = phaseDurationConfig(step);
  if (!duration) {
    return {
      step_number: stepNumber,
      phase_title: String(step?.title || `Phase ${stepNumber}`).trim(),
      duration_days: null,
      min_duration_days: null,
      max_duration_days: null,
      started_at: null,
      due_at: null,
      completed_at: null,
      days_left: null,
      status: "not_defined",
      report_signal: "not_defined"
    };
  }
  const durationDays = duration.maxDays;
  const phaseStageRows = stageRows.filter((stage) => Number(stage?.step_number) === stepNumber);
  const stageDates = phaseStageRows
    .map((stage) => stage?.started_at || stage?.created_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()));
  const fallbackStart = row?.created_at ? new Date(row.created_at) : new Date();
  const startedAt = stageDates.length ? new Date(Math.min(...stageDates.map((date) => date.getTime()))) : fallbackStart;
  const dueAt = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const completionDates = phaseStageRows
    .filter((stage) => String(stage?.status || "").toLowerCase() === "completed")
    .map((stage) => stage?.completed_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()));
  const expectedStageCount = Math.max(1, countStepUnits(step));
  const completedAt = completionDates.length >= expectedStageCount ? new Date(Math.max(...completionDates.map((date) => date.getTime()))) : null;
  const now = new Date();
  const comparisonDate = completedAt || now;
  const msLeft = dueAt.getTime() - comparisonDate.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const warningThreshold = Math.max(1, Math.ceil(durationDays * 0.25));
  const status = completedAt
    ? daysLeft < 0
      ? "completed_late"
      : "completed_on_time"
    : daysLeft < 0
      ? "delayed"
      : daysLeft <= warningThreshold
        ? "near_deadline"
        : "on_track";

  return {
    step_number: stepNumber,
    phase_title: String(step?.title || `Phase ${stepNumber}`).trim(),
    duration_days: durationDays,
    min_duration_days: duration.minDays,
    max_duration_days: duration.maxDays,
    started_at: Number.isFinite(startedAt.getTime()) ? startedAt.toISOString() : null,
    due_at: dueAt.toISOString(),
    completed_at: completedAt ? completedAt.toISOString() : null,
    days_left: daysLeft,
    status,
    report_signal: daysLeft < 0 ? "late" : status === "near_deadline" ? "at_risk" : "on_time"
  };
}

function countStepUnits(step) {
  const stages = parseStagesFromStepContext(step?.step_context);
  return Math.max(1, stages.length || 1);
}

function summarizeProjectProgress(row, stageRows = []) {
  const steps = parseProjectSteps(row?.steps_json);
  const completedTasks = parseCompletedTasks(row?.completed_tasks);
  const completedTaskSet = new Set(completedTasks);
  const totalSteps = Math.max(1, steps.length || 5);
  const completedStageMap = new Map();

  for (const stageRow of stageRows) {
    const stepNumber = Math.max(1, Number(stageRow?.step_number) || 1);
    const status = String(stageRow?.status || "").toLowerCase();
    if (status !== "completed") continue;
    completedStageMap.set(stepNumber, (completedStageMap.get(stepNumber) || 0) + 1);
  }

  let totalUnits = 0;
  let completedUnits = 0;
  let completedStepCount = 0;
  const derivedCompletedTasks = [...completedTasks];

  if (steps.length) {
    steps.forEach((step, index) => {
      const stepNumber = index + 1;
      const stepTitle = String(step?.title || "").trim();
      const stepUnits = countStepUnits(step);
      const stageDone = Math.min(stepUnits, completedStageMap.get(stepNumber) || 0);
      const stepComplete = completedTaskSet.has(stepTitle) || stageDone >= stepUnits;
      totalUnits += stepUnits;
      completedUnits += stepComplete ? stepUnits : stageDone;
      if (stepComplete) {
        completedStepCount += 1;
        if (stepTitle && !completedTaskSet.has(stepTitle)) {
          completedTaskSet.add(stepTitle);
          derivedCompletedTasks.push(stepTitle);
        }
      }
    });
  } else {
    totalUnits = totalSteps;
    completedUnits = Math.min(totalSteps, completedTasks.length);
    completedStepCount = completedUnits;
  }

  totalUnits = Math.max(1, totalUnits);
  const isComplete = completedUnits >= totalUnits;
  const rawCurrentStep = Math.max(1, Number(row?.current_step) || 1);
  const derivedCurrentStep = Math.min(totalSteps, completedStepCount + 1);
  const currentStep = isComplete ? totalSteps : Math.min(totalSteps, Math.max(rawCurrentStep, derivedCurrentStep));
  const stepTitle = String(steps[currentStep - 1]?.title || "").trim();

  return {
    totalSteps,
    completedCount: completedStepCount,
    completedTasks: derivedCompletedTasks,
    isComplete,
    currentStep,
    currentStepLabel: isComplete ? "Completed" : stepTitle || STEP_LABELS[currentStep] || `Step ${currentStep}`,
    percentComplete: clampPercent((completedUnits / totalUnits) * 100),
    phaseTimeline: buildPhaseTimeline({ row, stageRows, steps, currentStep })
  };
}

let stageProgressTableReady = null;

function ensureStageProgressTable() {
  if (!stageProgressTableReady) {
    stageProgressTableReady = pool.query(`
      ALTER TABLE project_progress
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      CREATE TABLE IF NOT EXISTS project_stage_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        CONSTRAINT chk_project_stage_progress_status CHECK (status IN ('undone', 'working', 'completed')),
        CONSTRAINT chk_project_stage_progress_document_review_status CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
        CONSTRAINT chk_project_stage_progress_step CHECK (step_number >= 1),
        CONSTRAINT chk_project_stage_progress_stage CHECK (stage_index >= 0),
        CONSTRAINT uq_project_stage_progress_user_project_stage UNIQUE (user_id, project_name, step_number, stage_index)
      );
      CREATE INDEX IF NOT EXISTS ix_project_stage_progress_user_project
        ON project_stage_progress(user_id, project_name);
      CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
        ON project_stage_progress(document_review_status);
      CREATE TABLE IF NOT EXISTS project_stage_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        CONSTRAINT chk_project_stage_documents_step CHECK (step_number >= 1),
        CONSTRAINT chk_project_stage_documents_stage CHECK (stage_index >= 0),
        CONSTRAINT chk_project_stage_documents_review_status CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'))
      );
      CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_stage
        ON project_stage_documents(user_id, project_name, step_number, stage_index);
      CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
        ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);
    `);
  }
  return stageProgressTableReady;
}

function safeExt(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (!ext || ext.length > 12) return "";
  return ext.replace(/[^.\w]/g, "");
}

function mimeTypeFromFilename(filename) {
  const ext = safeExt(filename);
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".txt":
    case ".log":
    case ".md":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".xml":
      return "application/xml";
    case ".html":
    case ".htm":
      return "text/html";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".zip":
      return "application/zip";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

async function uploadStageDocument({ userId, projectName, stepNumber, stageIndex, file, submissionGroupId }) {
  const ext = safeExt(file.filename);
  const id = crypto.randomBytes(10).toString("hex");
  const publicId = `u${userId}_stage_${stepNumber}_${stageIndex}_${id}`;
  const contentType = mimeTypeFromFilename(file.filename) || file.contentType || "application/octet-stream";
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: `${publicId}${ext}`,
    folder: "internlabs/stage-submissions",
    contentType,
    publicId
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    submissionGroupId,
    name: String(file.filename || `${String(projectName || "project")}_stage_document${ext}`).slice(0, 255)
  };
}

function groupStagesByProject(rows = []) {
  return rows.reduce((acc, row) => {
    const key = String(row?.project_name || "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

async function ensurePriorStagesCompleted({ userId, projectName, stepNumber, stageIndex, client = pool }) {
  if (!Number.isInteger(stageIndex) || stageIndex <= 0) return;
  const { rows } = await client.query(
    `SELECT stage_index
     FROM project_stage_progress
     WHERE user_id = $1
       AND project_name = $2
       AND step_number = $3
       AND status = 'completed'`,
    [userId, projectName, stepNumber]
  );
  const completed = new Set(rows.map((row) => Number(row.stage_index)));
  for (let index = 0; index < stageIndex; index += 1) {
    if (!completed.has(index)) {
      const error = new Error("Complete earlier stages first.");
      error.statusCode = 409;
      throw error;
    }
  }
}

async function stageRequiresGithubIntegration({ projectName, stepNumber, stageIndex }) {
  const { rows } = await pool.query(
    `SELECT steps_json
     FROM projects
     WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
     LIMIT 1`,
    [projectName]
  );
  const steps = parseProjectSteps(rows[0]?.steps_json);
  const step = steps[Math.max(0, Number(stepNumber) - 1)] || {};
  const stages = parseStagesFromStepContext(step?.step_context);
  return Boolean(stages[Math.max(0, Number(stageIndex) || 0)]?.github_integration_required);
}

async function hasConnectedGithubRepository(userId, projectName) {
  try {
    const { rowCount } = await pool.query(
      `SELECT 1
       FROM github_repositories
       WHERE user_id = $1
         AND LOWER(TRIM(project_name)) = LOWER(TRIM($2))
         AND COALESCE(repository_url, '') <> ''
       LIMIT 1`,
      [userId, projectName]
    );
    return rowCount > 0;
  } catch (error) {
    if (error?.code === "42P01") return false;
    throw error;
  }
}

function normalizeStageStatus(value) {
  const status = String(value || "undone").trim().toLowerCase();
  if (["undone", "working", "completed"].includes(status)) return status;
  return "undone";
}

function parseCompletedTasks(raw) {
  const value = String(raw || "").trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return value
    .split(/[,|\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function computeStreakFromDates(dates, now = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const set = new Set(
    dates.map((d) => {
      const dt = new Date(d);
      dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    })
  );

  let streak = 0;
  for (;;) {
    const t = today.getTime() - streak * dayMs;
    if (!set.has(t)) break;
    streak += 1;
  }
  return streak;
}

async function fetchReviewStreak(userId) {
  try {
    const reviewDatesRes = await pool.query(
      "SELECT DISTINCT created_at::date AS d FROM code_reviews WHERE user_id = $1 ORDER BY d DESC LIMIT 30",
      [userId]
    );
    return computeStreakFromDates(reviewDatesRes.rows.map((r) => r.d));
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return 0;
    }
    throw error;
  }
}

async function listActiveCatalogProjects({ limit = 50, includeDemoProjects = false, onlyDemoProjects = false } = {}) {
  await ensureCoinSchema();
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const { rows } = await pool.query(
    `SELECT id, title, description, category, global_category, timeline_weeks, project_coins, is_demo_project,
            complexity, keywords, skills_required, skills_gained, target_branch, target_year,
            tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score
     FROM projects
     WHERE is_active = TRUE
       AND ($2::boolean = TRUE OR COALESCE(is_demo_project, FALSE) = FALSE)
       AND ($3::boolean = FALSE OR COALESCE(is_demo_project, FALSE) = TRUE)
     ORDER BY updated_at DESC, id DESC
     LIMIT $1`,
    [lim, Boolean(includeDemoProjects || onlyDemoProjects), Boolean(onlyDemoProjects)]
  );
  return rows;
}

async function loadUserProjectSummaries(userId, client = pool) {
  await ensureStageProgressTable();
  const progressRes = await client.query(
    `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json,
            COALESCE(p.is_demo_project, FALSE) AS is_demo_project
     FROM project_progress pp
     INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
     WHERE pp.user_id = $1
     ORDER BY pp.id DESC`,
    [userId]
  );
  const stageRes = await client.query(
    `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
     FROM project_stage_progress
     WHERE user_id = $1`,
    [userId]
  );
  const stagesByProject = groupStagesByProject(stageRes.rows);

  return progressRes.rows.map((row) => ({
    row,
    summary: summarizeProjectProgress(row, stagesByProject[row.project_name] || [])
  }));
}

async function hasStartedDemoProject(userId, client = pool) {
  await ensureCoinSchema();
  await ensureStageProgressTable();
  const { rowCount } = await client.query(
    `SELECT 1
     FROM project_progress pp
     INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
     WHERE pp.user_id = $1
       AND COALESCE(p.is_demo_project, FALSE) = TRUE
     LIMIT 1`,
    [userId]
  );
  return rowCount > 0;
}

async function listAbandonedDemoProjectNames(userId, client = pool) {
  try {
    const { rows } = await client.query(
      `SELECT DISTINCT TRIM(al.metadata->>'project_name') AS project_name
       FROM audit_logs al
       INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(al.metadata->>'project_name'))
       WHERE al.user_id = $1
         AND al.action = 'admin_assignment_abandoned'
         AND COALESCE(p.is_demo_project, FALSE) = TRUE
         AND COALESCE(TRIM(al.metadata->>'project_name'), '') <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM audit_logs reverted
           WHERE reverted.user_id = al.user_id
             AND reverted.action = 'admin_assignment_reverted'
             AND LOWER(TRIM(reverted.metadata->>'project_name')) = LOWER(TRIM(al.metadata->>'project_name'))
             AND reverted.created_at > al.created_at
         )`,
      [userId]
    );
    return rows.map((row) => String(row.project_name || "").trim()).filter(Boolean);
  } catch (error) {
    if (error?.code === "42P01") return [];
    throw error;
  }
}

async function hasAbandonedDemoProject(userId, projectName, client = pool) {
  const normalized = String(projectName || "").trim().toLowerCase();
  if (!normalized) return false;
  const abandonedNames = await listAbandonedDemoProjectNames(userId, client);
  return abandonedNames.some((name) => name.toLowerCase() === normalized);
}

function scoreProjects({ branch, year, resumeUrl, projects }) {
  const text = `${branch || ""} ${year || ""} ${resumeUrl || ""}`.toLowerCase();
  const wantsAi = /ai|ml|machine|data|python|nlp|llm/.test(text);
  const wantsIot = /iot|embedded|arduino|esp32|raspberry|sensors?/.test(text);
  const wantsWeb = /web|full|mern|react|node|javascript|frontend|backend/.test(text);
  const wantsAndroid = /android|kotlin|java|mobile/.test(text);
  const wantsData = /analytics|sql|bi|dashboard|powerbi|excel|data/.test(text);

  const normalizeCategory = (c) => String(c || "normal").toLowerCase();

  const scored = (projects || []).map((p) => {
    const category = normalizeCategory(p.category);
    const metadata = [
      p.complexity,
      p.keywords,
      p.skills_required,
      p.skills_gained,
      p.target_branch,
      p.target_year,
      p.tech_stack,
      p.short_summary,
      p.domain,
      p.prerequisites,
      p.learning_outcomes
    ].join(" ").toLowerCase();
    let boost = 0;
    if (category === "ai" || /ai|ml|machine|llm/.test(metadata)) boost = wantsAi ? 18 : -4;
    else if (category === "iot" || /iot|embedded|sensor|arduino|esp32/.test(metadata)) boost = wantsIot ? 18 : -4;
    else if (category === "android" || /android|kotlin|mobile/.test(metadata)) boost = wantsAndroid ? 16 : 0;
    else if (category === "data" || /data|analytics|sql|dashboard/.test(metadata)) boost = wantsData ? 16 : 0;
    else boost = wantsWeb ? 10 : 2;
    if (metadata && text && metadata.split(/\s+/).some((token) => token.length > 2 && text.includes(token))) {
      boost += 6;
    }

    const base = 74 + boost;
    const match = Math.max(65, Math.min(95, base));
    return {
      id: p.id,
      name: p.title,
      description: p.description,
      category,
      timeline_weeks: p.timeline_weeks,
      project_coins: Number(p.project_coins) || 1,
      is_demo_project: Boolean(p.is_demo_project),
      complexity: p.complexity || "",
      keywords: p.keywords || "",
      skills_required: p.skills_required || "",
      skills_gained: p.skills_gained || "",
      tech_stack: p.tech_stack || "",
      short_summary: p.short_summary || "",
      domain: p.domain || "",
      learning_outcomes: p.learning_outcomes || "",
      difficulty_score: Number(p.difficulty_score) || 3,
      why: p.keywords || p.short_summary || p.learning_outcomes || "Matches your profile and project readiness.",
      match_percent: match
    };
  });

  return scored.sort((a, b) => b.match_percent - a.match_percent);
}

async function fetchRecommendedProjectsFromService({
  userId,
  offset = 0,
  limit = 2,
  excludeProjectNames = [],
  includeDemoProjects = false,
  onlyDemoProjects = false
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${String(config.services?.recommendation || "http://127.0.0.1:8010").replace(/\/+$/, "")}/recommendations/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        offset,
        limit,
        exclude_project_names: excludeProjectNames,
        include_demo_projects: Boolean(includeDemoProjects || onlyDemoProjects),
        only_demo_projects: Boolean(onlyDemoProjects)
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`recommendation_service_failed:${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data?.projects) ? data.projects : [];
  } finally {
    clearTimeout(timeout);
  }
}

function publicRecommendationProject(project = {}) {
  return {
    id: project.id,
    name: project.name || project.title || "",
    description: project.description || "",
    category: project.category || "normal",
    global_category: project.global_category || "",
    timeline_weeks: project.timeline_weeks,
    project_coins: Number(project.project_coins) || 1,
    is_demo_project: Boolean(project.is_demo_project),
    complexity: project.complexity || "",
    keywords: project.keywords || "",
    skills_required: project.skills_required || "",
    skills_gained: project.skills_gained || "",
    tech_stack: project.tech_stack || "",
    short_summary: project.short_summary || "",
    domain: project.domain || "",
    learning_outcomes: project.learning_outcomes || "",
    difficulty_score: Number(project.difficulty_score) || 3,
    match_percent: Number(project.match_percent) || 0
  };
}

async function logRecommendationProjects({ userId, projects, source, resumeUrl }) {
  const rows = Array.isArray(projects) ? projects.slice(0, 2) : [];
  if (!rows.length) return;
  await ensureRecommendationLogSchema();
  const values = [];
  const placeholders = rows.map((project, index) => {
    const base = index * 8;
    values.push(
      userId,
      Number(project.id) || null,
      String(project.name || project.title || "").trim().slice(0, 160),
      index + 1,
      Math.max(0, Math.min(100, Math.round(Number(project.match_percent) || 0))),
      String(project.why || project.reason || "").trim().slice(0, 2000),
      String(source || "").trim().slice(0, 60),
      String(resumeUrl || "").trim().slice(0, 2000)
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, NOW())`;
  });
  await pool.query(
    `INSERT INTO project_recommendation_logs
       (user_id, project_id, project_title, rank, match_percent, reason, source, resume_url, shown_at)
     VALUES ${placeholders.join(", ")}`,
    values
  );
}

router.get(
  "/dashboard/mentors",
  requireAuth,
  asyncHandler(async (_req, res) => {
    await ensureMentorSchema();
    const { rows } = await pool.query(
      `SELECT id, agent_key, mentor_name, role, goal, backstory, avatar_url, output_format
       FROM project_mentors
       WHERE is_hidden = FALSE
       ORDER BY id ASC`
    );
    return res.json({
      mentors: rows.map((mentor) => ({
        ...mentor,
        name: mentor.mentor_name,
        avatar_url: mentor.avatar_url || "",
        mentor_json: {
          backend_key: mentorBackendKey(mentor.agent_key),
          agent_key: mentor.agent_key,
          goal: mentor.goal,
          backstory: mentor.backstory,
          output_format: mentor.output_format
        }
      }))
    });
  })
);

router.get(
  "/dashboard/workspace-status",
  requireAuth,
  asyncHandler(async (_req, res) => {
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT key, value
       FROM app_settings
       WHERE key IN ('workspace_closed', 'workspace_closed_message')`
    );
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return res.json({
      closed: normalizeWorkspaceClosed(settings.workspace_closed),
      message: normalizeWorkspaceClosedMessage(settings.workspace_closed_message)
    });
  })
);

router.post(
  "/dashboard/presence/heartbeat",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureUserPresenceSchema();
    // Wix-issued identities are UUIDs in this deployment. Do not coerce them
    // to Number, otherwise every heartbeat is rejected and presence appears
    // offline even when the user is active.
    const userId = String(req.auth?.userId || "").trim();
    if (!userId) {
      return res.status(401).json({ detail: "Invalid authorization token." });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET last_seen_at = NOW()
       WHERE id = $1
       RETURNING last_seen_at`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ detail: "User not found." });

    return res.json({
      ok: true,
      last_seen_at: rows[0].last_seen_at,
      online_window_seconds: 120
    });
  })
);

router.get(
  "/dashboard/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const userRes = await pool.query(
      "SELECT public_id AS id, name, email, has_paid, paid_at FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    if (!userRes.rowCount) {
      return res.status(404).json({ detail: "User not found." });
    }

    const coinBalance = await getUserCoinBalance(userId);
    const coinUnitAmountPaisa = await getCoinUnitAmountPaisa();
    const coinOriginalAmountPaisa = await getCoinOriginalAmountPaisa();
    const profileCompletion = await fetchProfileCompletion(userId);
    await ensureStageProgressTable();

    const progressRes = await pool.query(
      `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json
       FROM project_progress pp
       INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       WHERE pp.user_id = $1`,
      [userId]
    );
    const stageRes = await pool.query(
      `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1`,
      [userId]
    );
    const stagesByProject = groupStagesByProject(stageRes.rows);

    const progressSummary = progressRes.rows.map((row) => summarizeProjectProgress(row, stagesByProject[row.project_name] || []));
    const activeProjects = progressSummary.filter((row) => !row.isComplete).length;
    const completedProjects = progressSummary.filter((row) => row.isComplete).length;
    const tasksDone = progressSummary.reduce((acc, row) => acc + row.completedCount, 0);

    const streak = await fetchReviewStreak(userId);
    const demoProjectUsed = await hasStartedDemoProject(userId);

    const progressPercent = clampPercent(
      progressSummary.reduce((acc, row) => acc + row.percentComplete, 0) / Math.max(1, progressSummary.length)
    );

    return res.json({
      user: {
        ...userRes.rows[0],
        coin_balance: Number(coinBalance.coin_balance) || 0,
        total_coins_purchased: Number(coinBalance.total_coins_purchased) || 0,
        coin_unit_amount_paisa: coinUnitAmountPaisa,
        coin_original_amount_paisa: coinOriginalAmountPaisa,
        profile_complete: Boolean(profileCompletion.profileComplete),
        demo_project_used: demoProjectUsed
      },
      profile: profileCompletion,
      stats: {
        active_projects: activeProjects,
        completed_projects: completedProjects,
        tasks_done: tasksDone,
        progress_percent: progressPercent,
        streak_days: streak
      }
    });
  })
);

router.get(
  "/dashboard/recommendations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;

    const profileCompletion = await fetchProfileCompletion(userId);
    requireProfileCompleteOrThrow(profileCompletion);
    const userRes = await pool.query("SELECT id, has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userRes.rowCount) {
      return res.status(404).json({ detail: "User not found." });
    }
    const coinBalance = await getUserCoinBalance(userId);
    const hasRealProjectAccess = Boolean(userRes.rows[0].has_paid) || (Number(coinBalance.coin_balance) || 0) > 0;
    const demoProjectUsed = await hasStartedDemoProject(userId);
    if (!hasRealProjectAccess && demoProjectUsed) {
      return res.json({ offset: 0, projects: [] });
    }

    const offset = Math.max(0, Number(req.query?.offset) || 0);
    const userProjects = await loadUserProjectSummaries(userId);
    const hiddenProjects = new Set(userProjects.map(({ row }) => String(row.project_name || "").trim()).filter(Boolean));
    const onlyDemoProjects = !hasRealProjectAccess;
    if (onlyDemoProjects) {
      const abandonedDemoProjectNames = await listAbandonedDemoProjectNames(userId);
      abandonedDemoProjectNames.forEach((name) => hiddenProjects.add(name));
    }

    const catalog = await listActiveCatalogProjects({
      limit: 50,
      includeDemoProjects: onlyDemoProjects,
      onlyDemoProjects
    });
    try {
      const projects = await fetchRecommendedProjectsFromService({
        userId,
        offset,
        limit: onlyDemoProjects ? 50 : 2,
        excludeProjectNames: [...hiddenProjects],
        includeDemoProjects: onlyDemoProjects,
        onlyDemoProjects
      });
      if (projects.length) {
        await logRecommendationProjects({
          userId,
          projects,
          source: "recommendation_service",
          resumeUrl: profileCompletion.resumeUrl
        }).catch(() => null);
        return res.json({
          offset,
          projects: projects.slice(0, onlyDemoProjects ? 50 : 2).map(publicRecommendationProject),
          source: "recommendation_service"
        });
      }
    } catch {
      // fall back to local random suggestions when the service is unavailable
    }

    const ranked = scoreProjects({ branch: "", year: "", resumeUrl: profileCompletion.resumeUrl, projects: catalog }).filter(
      (project) => !hiddenProjects.has(String(project.name || "").trim())
    );
    const randomized = [...ranked].sort(() => Math.random() - 0.5);
    const projects = randomized.slice(offset, offset + (onlyDemoProjects ? 50 : 2));
    await logRecommendationProjects({
      userId,
      projects,
      source: "fallback_random",
      resumeUrl: profileCompletion.resumeUrl
    }).catch(() => null);
    return res.json({
      offset,
      projects: projects.map(publicRecommendationProject),
      source: "fallback_random"
    });
  })
);

router.get(
  "/dashboard/catalog-project",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const profileCompletion = await fetchProfileCompletion(userId);
    requireProfileCompleteOrThrow(profileCompletion);
    await ensureCoinSchema();
    await ensureStageProgressTable();

    const title = String(req.query.title || "").trim();
    if (!title) return res.status(400).json({ detail: "title is required." });

    const progressRes = await pool.query(
      `SELECT project_name, current_step, completed_tasks, created_at
       FROM project_progress
       WHERE user_id = $1
         AND LOWER(TRIM(project_name)) = LOWER(TRIM($2))
       LIMIT 1`,
      [userId, title]
    );
    if (!progressRes.rowCount) {
      return res.status(403).json({ detail: "This project is not assigned to your account." });
    }

    const assignedProjectName = String(progressRes.rows[0]?.project_name || title).trim();
    const { rows } = await pool.query(
      `SELECT id, title, description, category, global_category, timeline_weeks,
              project_coins,
              is_demo_project,
              introduction_document, introduction_document_url,
              company_profile_text,
              solution_document, solution_document_url,
              steps_json
       FROM projects
       WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
      ORDER BY is_active DESC, updated_at DESC, id DESC
      LIMIT 1`,
      [assignedProjectName]
    );

    if (!rows.length) return res.status(404).json({ detail: "Project methodology is not available in the catalog." });

    const p = rows[0];
    let steps = parseProjectSteps(p.steps_json);
    if (!steps.length) {
      steps = await loadProjectStepsFromRows(p.id);
    }
    const demoDocumentsById = await loadDemoDocumentsById(selectedDemoDocumentIdsFromSteps(steps));
    const stageRes = await pool.query(
      `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1
         AND LOWER(TRIM(project_name)) = LOWER(TRIM($2))`,
      [userId, assignedProjectName]
    );
    const summary = summarizeProjectProgress({
      current_step: progressRes.rows[0]?.current_step,
      completed_tasks: progressRes.rows[0]?.completed_tasks,
      created_at: progressRes.rows[0]?.created_at,
      steps_json: steps
    }, stageRes.rows);
    const isComplete = Boolean(progressRes.rowCount) && summary.isComplete;
    return res.json({
      project: {
        id: p.id,
        title: p.title,
        description: p.description,
        category: p.category,
        global_category: p.global_category || "",
        timeline_weeks: p.timeline_weeks,
        project_coins: Number(p.project_coins) || 1,
        is_demo_project: Boolean(p.is_demo_project),
        introduction_document: p.introduction_document || "",
        introduction_document_url: p.introduction_document_url || "",
        company_profile_text: p.company_profile_text || "",
        solution_document: isComplete ? p.solution_document || "" : "",
        solution_document_url: isComplete ? p.solution_document_url || "" : "",
        phase_timeline: summary.phaseTimeline,
        is_complete: isComplete,
        demo_documents_by_id: demoDocumentsById,
        steps
      }
    });
  })
);

router.get(
  "/dashboard/projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const profileCompletion = await fetchProfileCompletion(userId);
    await ensureStageProgressTable();
    if (!profileCompletion.profileComplete) {
      return res.json({ projects: [] });
    }

    const projectSummaries = await loadUserProjectSummaries(userId);
    await ensureCertificateRequestSchema();
    const certificateRes = await pool.query(
      `SELECT DISTINCT ON (LOWER(TRIM(project_name)))
              project_name, status, certificate_url, certificate_public_id,
              certificate_original_filename, certificate_issued_at, certificate_emailed_at
       FROM certificate_requests
       WHERE user_id = $1
       ORDER BY LOWER(TRIM(project_name)), created_at DESC, id DESC`,
      [userId]
    );
    const certificatesByProject = new Map(
      certificateRes.rows.map((row) => {
        const downloadUrl = row.certificate_public_id
          ? createPresignedS3GetUrl({
              key: row.certificate_public_id,
              expiresSeconds: 1800,
              responseContentDisposition: `attachment; filename="${String(row.certificate_original_filename || "certificate.pdf").replace(/"/g, "")}"`
            })
          : row.certificate_url || "";
        return [String(row.project_name || "").trim().toLowerCase(), {
          status: row.status || "pending",
          certificate_url: downloadUrl,
          certificate_original_filename: row.certificate_original_filename || "",
          certificate_issued_at: row.certificate_issued_at,
          certificate_emailed_at: row.certificate_emailed_at
        }];
      })
    );

    return res.json({
      projects: projectSummaries
        .map(({ row, summary }) => ({
          name: row.project_name,
          current_step: summary.currentStep,
          current_step_name: summary.currentStepLabel,
          current_step_label: summary.currentStepLabel,
          percent_complete: summary.percentComplete,
          completed_steps: summary.completedCount,
          total_steps: summary.totalSteps,
          phase_timeline: summary.phaseTimeline,
          is_demo_project: Boolean(row.is_demo_project),
          is_complete: summary.isComplete
        }))
        .filter((project) => !project.is_complete)
        .slice(0, 25),
      completed_projects: projectSummaries
        .map(({ row, summary }) => ({
          name: row.project_name,
          current_step: summary.currentStep,
          current_step_name: summary.currentStepLabel,
          current_step_label: summary.currentStepLabel,
          percent_complete: summary.percentComplete,
          completed_steps: summary.completedCount,
          total_steps: summary.totalSteps,
          phase_timeline: summary.phaseTimeline,
          is_complete: summary.isComplete,
          is_demo_project: Boolean(row.is_demo_project),
          certificate: certificatesByProject.get(String(row.project_name || "").trim().toLowerCase()) || null
        }))
        .filter((project) => project.is_complete)
        .slice(0, 25)
    });
  })
);

router.get(
  "/dashboard/project-assign/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    await ensureStageProgressTable();

    const userRes = await pool.query("SELECT has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userRes.rowCount) {
      return res.status(404).json({ detail: "User not found." });
    }

    const hasPaid = Boolean(userRes.rows[0].has_paid);
    if (!hasPaid) return res.json({ requested: false });

    const progressRes = await pool.query(
      `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json
       FROM project_progress pp
       INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       WHERE pp.user_id = $1`,
      [userId]
    );
    const stageRes = await pool.query(
      `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1`,
      [userId]
    );
    const stagesByProject = groupStagesByProject(stageRes.rows);
    if (progressRes.rows.some((row) => !summarizeProjectProgress(row, stagesByProject[row.project_name] || []).isComplete)) {
      return res.json({ requested: false });
    }

    const requestRes = await pool.query(
      `SELECT id, created_at
       FROM project_assignment_requests
       WHERE user_id = $1 AND status = 'open'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId]
    );

    if (!requestRes.rowCount) return res.json({ requested: false });
    return res.json({ requested: true, last_requested_at: requestRes.rows[0].created_at });
  })
);

router.post(
  "/dashboard/project-assign/request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    await ensureStageProgressTable();

    const userRes = await pool.query("SELECT has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userRes.rowCount) return res.status(404).json({ detail: "User not found." });
    if (!userRes.rows[0].has_paid) return res.status(402).json({ detail: "Payment required." });

    const progressRes = await pool.query(
      `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json
       FROM project_progress pp
       INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       WHERE pp.user_id = $1`,
      [userId]
    );
    const stageRes = await pool.query(
      `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1`,
      [userId]
    );
    const stagesByProject = groupStagesByProject(stageRes.rows);
    if (progressRes.rows.some((row) => !summarizeProjectProgress(row, stagesByProject[row.project_name] || []).isComplete)) {
      return res.status(409).json({ detail: "You already have an active project." });
    }

    const existingReq = await pool.query(
      "SELECT id, created_at FROM project_assignment_requests WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (existingReq.rowCount) {
      return res.json({ requested: true, already_requested: true, last_requested_at: existingReq.rows[0].created_at });
    }

    const message = String(req.body?.message || "").trim().slice(0, 5000);
    const inserted = await pool.query(
      `INSERT INTO project_assignment_requests (user_id, message, status, created_at)
       VALUES ($1, $2, 'open', NOW())
       RETURNING id, created_at`,
      [userId, message]
    );

    return res.status(201).json({ requested: true, request_id: inserted.rows[0].id, last_requested_at: inserted.rows[0].created_at });
  })
);

router.post(
  "/dashboard/projects/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const projectName = String(req.body?.project_name || "").trim();

    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureCoinSchema();
      await ensureStageProgressTable();

      const profileCompletion = await fetchProfileCompletion(userId);
      requireProfileCompleteOrThrow(profileCompletion);

      const accessRes = await client.query("SELECT has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
      if (!accessRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "User not found." });
      }

      const assignmentReq = await client.query(
        "SELECT id FROM project_assignment_requests WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC, id DESC LIMIT 1",
        [userId]
      );
      if (assignmentReq.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "You already requested project help. Please wait for admin assignment." });
      }

      const projectRes = await client.query(
        `SELECT id, title, COALESCE(project_coins, 1) AS project_coins, COALESCE(is_demo_project, FALSE) AS is_demo_project
         FROM projects
         WHERE is_active = TRUE
           AND LOWER(TRIM(title)) = LOWER(TRIM($1))
         LIMIT 1`,
        [projectName]
      );
      if (!projectRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "Project not found." });
      }
      const canonicalProjectName = String(projectRes.rows[0].title || projectName).trim();
      const projectCoins = Math.max(1, Number(projectRes.rows[0].project_coins) || 1);
      const isDemoProject = Boolean(projectRes.rows[0].is_demo_project);
      const balance = await getUserCoinBalance(userId, client);
      const currentCoins = Number(balance.coin_balance) || 0;
      const hasRealProjectAccess = Boolean(accessRes.rows[0].has_paid) || currentCoins > 0;

      if (isDemoProject && await hasAbandonedDemoProject(userId, canonicalProjectName, client)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "This demo project was abandoned by admin and cannot be opened again. Please choose another demo project." });
      }

      if (!isDemoProject && !hasRealProjectAccess) {
        await client.query("ROLLBACK");
        return res.status(402).json({ detail: "Payment required to start a project." });
      }

      const existing = await client.query(
        `SELECT pp.id, pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json,
                COALESCE(p.is_demo_project, FALSE) AS is_demo_project
         FROM project_progress pp
         INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
         WHERE pp.user_id = $1
         ORDER BY pp.id DESC`,
        [userId]
      );
      const existingStageRes = await client.query(
        `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
         FROM project_stage_progress
         WHERE user_id = $1`,
        [userId]
      );
      const existingStagesByProject = groupStagesByProject(existingStageRes.rows);

      const existingProjects = existing.rows.map((row) => ({
        ...row,
        summary: summarizeProjectProgress(row, existingStagesByProject[row.project_name] || [])
      }));
      const activeProject = existingProjects.find((row) => !row.summary.isComplete);
      const sameProject = existingProjects.find(
        (row) => String(row.project_name || "").trim().toLowerCase() === canonicalProjectName.toLowerCase()
      );
      const alreadyStartedDemoProject = existingProjects.some((row) => Boolean(row.is_demo_project));

      if (isDemoProject && alreadyStartedDemoProject && !sameProject) {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "You can complete only one demo project. Add coins to unlock real projects." });
      }

      if (!activeProject && !sameProject) {
        if (!isDemoProject && currentCoins < projectCoins) {
          await client.query("ROLLBACK");
          return res.status(402).json({
            detail: `Insufficient coins. This project requires ${projectCoins} coin${projectCoins === 1 ? "" : "s"}.`,
            coins_required: projectCoins,
            coin_balance: currentCoins
          });
        }

        const inserted = await client.query(
          `INSERT INTO project_progress (user_id, project_name, current_step, completed_tasks)
           VALUES ($1, $2, 1, '')
           RETURNING id, project_name, current_step`,
          [userId, canonicalProjectName]
        );

        const updatedCoins = isDemoProject
          ? { rows: [{ coin_balance: currentCoins }] }
          : await client.query(
            `UPDATE user_coin_balances
             SET coin_balance = GREATEST(0, coin_balance - $2),
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING coin_balance, total_coins_purchased`,
            [userId, projectCoins]
          );

        await client.query("COMMIT");
        return res.status(201).json({
          message: "Project started.",
          project: {
            name: inserted.rows[0].project_name,
            current_step: Number(inserted.rows[0].current_step) || 1
          },
          coins_required: projectCoins,
          coin_balance: Number(updatedCoins.rows[0]?.coin_balance) || Math.max(0, currentCoins - projectCoins)
        });
      }

      await client.query("COMMIT");
      if (activeProject && String(activeProject.project_name || "").trim().toLowerCase() !== canonicalProjectName.toLowerCase()) {
        return res.status(409).json({
          detail: "You have already selected a project. Complete your active project first.",
          project: {
            name: activeProject.project_name,
            current_step: activeProject.summary.currentStep
          },
          coins_required: projectCoins
        });
      }

      if (sameProject?.summary?.isComplete) {
        return res.json({
          message: "Project already completed.",
          project: {
            name: sameProject.project_name,
            current_step: sameProject.summary.currentStep
          },
          coins_required: projectCoins
        });
      }

      return res.json({
        message: "Project already started.",
        project: {
          name: sameProject?.project_name || activeProject?.project_name || canonicalProjectName,
          current_step: sameProject?.summary?.currentStep || activeProject?.summary?.currentStep || 1
        },
        coins_required: projectCoins
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/dashboard/popular-projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const profileCompletion = await fetchProfileCompletion(userId);
    if (!profileCompletion.profileComplete) {
      return res.json({ projects: [] });
    }
    const accessRes = await pool.query("SELECT has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!accessRes.rowCount) {
      return res.status(404).json({ detail: "User not found." });
    }
    if (!accessRes.rows[0].has_paid) {
      return res.json({ projects: [] });
    }
    const profileRes = await pool.query(
      "SELECT COALESCE(branch,'') AS branch, COALESCE(year,'') AS year FROM user_profiles WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    const branch = profileRes.rows[0]?.branch || "";
    const year = profileRes.rows[0]?.year || "";

    const catalog = await listActiveCatalogProjects({ limit: 30 });
    const ranked = scoreProjects({ branch, year, resumeUrl: profileCompletion.resumeUrl, projects: catalog });

    return res.json({ projects: ranked.slice(0, 9) });
  })
);

router.get(
  "/dashboard/progress",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    await ensureStageProgressTable();
    const { rows } = await pool.query(
      `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json
       FROM project_progress pp
       INNER JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       WHERE pp.user_id = $1
       ORDER BY pp.id DESC`,
      [userId]
    );
    const stageRes = await pool.query(
      `SELECT project_name, step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1`,
      [userId]
    );
    const stagesByProject = groupStagesByProject(stageRes.rows);

    return res.json({
      projects: rows.map((r) => {
        const summary = summarizeProjectProgress(r, stagesByProject[r.project_name] || []);
        return {
          project_name: r.project_name,
          current_step: summary.currentStep,
          current_step_name: summary.currentStepLabel,
          completed_tasks: summary.completedTasks,
          completed_steps: summary.completedCount,
          total_steps: summary.totalSteps,
          percent_complete: summary.percentComplete,
          phase_timeline: summary.phaseTimeline,
          is_complete: summary.isComplete
        };
      })
    });
  })
);

router.post(
  "/dashboard/progress",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const projectName = String(req.body?.project_name || "").trim();
    const currentStep = Number(req.body?.current_step);

    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }
    if (!Number.isFinite(currentStep)) {
      return res.status(400).json({ detail: "current_step must be a number." });
    }

    await pool.query(
      `INSERT INTO project_progress (user_id, project_name, current_step, completed_tasks)
       VALUES ($1, $2, $3, '[]')
       ON CONFLICT (user_id, project_name) DO UPDATE SET
         current_step = EXCLUDED.current_step`,
      [userId, projectName, currentStep]
    );

    return res.json({ message: "Progress updated." });
  })
);

router.post(
  "/dashboard/tasks/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth.userId;
    const projectName = String(req.body?.project_name || "").trim();
    const task = String(req.body?.task || "").trim();

    if (!projectName || !task) {
      return res.status(400).json({ detail: "project_name and task are required." });
    }

    const progressRes = await pool.query(
      "SELECT completed_tasks FROM project_progress WHERE user_id = $1 AND project_name = $2 LIMIT 1",
      [userId, projectName]
    );
    if (!progressRes.rowCount) {
      return res.status(404).json({ detail: "Project progress not found." });
    }

    const tasks = parseCompletedTasks(progressRes.rows[0].completed_tasks);
    if (!tasks.includes(task)) tasks.push(task);

    await pool.query(
      "UPDATE project_progress SET completed_tasks = $3 WHERE user_id = $1 AND project_name = $2",
      [userId, projectName, JSON.stringify(tasks)]
    );

    return res.json({ message: "Task marked as complete.", completed_tasks: tasks });
  })
);

router.get(
  "/dashboard/stage-progress",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureStageProgressTable();
    const userId = req.auth.userId;
    const projectName = String(req.query?.project_name || "").trim();
    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }

    const { rows } = await pool.query(
      `SELECT step_number, stage_index, status, understood, document_required, document_url, document_name, document_public_id,
              document_review_status, document_review_feedback, document_reviewed_at,
              started_at, completed_at, updated_at
       FROM project_stage_progress
       WHERE user_id = $1 AND project_name = $2
       ORDER BY step_number ASC, stage_index ASC`,
      [userId, projectName]
    );

    // Fetch user's current step so frontend can show next stages but keep them locked
    const { rows: progRows } = await pool.query(
      `SELECT current_step FROM project_progress WHERE user_id = $1 AND project_name = $2 LIMIT 1`,
      [userId, projectName]
    );
    const currentStep = Number(progRows[0]?.current_step || 1);

    const docRes = await pool.query(
      `SELECT id, step_number, stage_index, submission_group_id, document_url, document_name, document_public_id,
              document_review_status, document_review_feedback, document_reviewed_at, created_at
       FROM project_stage_documents
       WHERE user_id = $1 AND project_name = $2
       ORDER BY step_number ASC, stage_index ASC, id ASC`,
      [userId, projectName]
    );
    const docsByStage = docRes.rows.reduce((acc, doc) => {
      const key = `${Number(doc.step_number)}:${Number(doc.stage_index)}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});

    return res.json({
      stages: rows.map((row) => {
        const key = `${Number(row.step_number)}:${Number(row.stage_index)}`;
        const documents = docsByStage[key] || [];
        const base = {
          ...row,
          documents: documents.length
            ? documents
            : row.document_url
              ? [
                {
                  id: null,
                  step_number: row.step_number,
                  stage_index: row.stage_index,
                  submission_group_id: "",
                  document_url: row.document_url,
                  document_name: row.document_name,
                  document_public_id: row.document_public_id,
                  document_review_status: row.document_review_status,
                  document_review_feedback: row.document_review_feedback,
                  document_reviewed_at: row.document_reviewed_at,
                  created_at: null
                }
              ]
              : []
        };

        // Show stages but mark as locked if their step is beyond user's current_step
        const locked = Number(row.step_number) > currentStep;
        return { ...base, locked };
      })
    });
  })
);

router.post(
  "/dashboard/stage-progress/document",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  asyncHandler(async (req, res) => {
    await ensureStageProgressTable();
    const userId = req.auth.userId;
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ detail: "multipart/form-data request required." });
    }

    let parsed;
    try {
      parsed = parseMultipartFormData({ contentType, bodyBuffer: req.body });
    } catch {
      return res.status(400).json({ detail: "Invalid multipart form data." });
    }

    const projectName = String(parsed?.fields?.project_name || "").trim();
    const stepNumber = Number(parsed?.fields?.step_number);
    const stageIndex = Number(parsed?.fields?.stage_index);
    const files = [
      ...((parsed?.fileLists?.documents || []).filter(Boolean)),
      ...((parsed?.fileLists?.document || []).filter(Boolean))
    ];
    const uniqueFiles = [];
    const seenFileKeys = new Set();
    for (const file of files) {
      const key = `${file?.sha256 || ""}:${file?.filename || ""}:${file?.size || 0}`;
      if (seenFileKeys.has(key)) continue;
      seenFileKeys.add(key);
      uniqueFiles.push(file);
    }

    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }
    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return res.status(400).json({ detail: "step_number must be a positive integer." });
    }
    if (!Number.isInteger(stageIndex) || stageIndex < 0) {
      return res.status(400).json({ detail: "stage_index must be a non-negative integer." });
    }
    const validFiles = uniqueFiles.filter((file) => file?.buffer?.length);
    if (!validFiles.length) {
      return res.status(400).json({ detail: "At least one document file is required." });
    }
    if (validFiles.length > 8) {
      return res.status(400).json({ detail: "Upload up to 8 documents for one stage at a time." });
    }

    const progressRes = await pool.query(
      "SELECT 1 FROM project_progress WHERE user_id = $1 AND project_name = $2 LIMIT 1",
      [userId, projectName]
    );
    if (!progressRes.rowCount) {
      return res.status(404).json({ detail: "Project progress not found." });
    }
    await ensurePriorStagesCompleted({ userId, projectName, stepNumber, stageIndex });

    const pendingReviewRes = await pool.query(
      `SELECT document_review_status
       FROM project_stage_progress
       WHERE user_id = $1
         AND project_name = $2
         AND step_number = $3
         AND stage_index = $4
       LIMIT 1`,
      [userId, projectName, stepNumber, stageIndex]
    );
    if (String(pendingReviewRes.rows[0]?.document_review_status || "").toLowerCase() === "pending") {
      return res.status(409).json({
        detail: "A document is already under review for this stage. Please wait for the review result before uploading another document."
      });
    }

    const submissionGroupId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex");
    const uploadedFiles = [];
    for (const file of validFiles) {
      uploadedFiles.push(await uploadStageDocument({
        userId,
        projectName,
        stepNumber,
        stageIndex,
        file,
        submissionGroupId,
      }));
    }
    const latestUpload = uploadedFiles[uploadedFiles.length - 1];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO project_stage_progress
           (user_id, project_name, step_number, stage_index, status, understood, document_required, document_url, document_name, document_public_id,
            document_submission_group_id, document_review_status, document_review_feedback, document_reviewed_at, started_at, completed_at)
         VALUES
           ($1, $2, $3, $4, 'working', TRUE, TRUE, $5, $6, $7, $8, 'pending', '', NULL, NOW(), NULL)
         ON CONFLICT (user_id, project_name, step_number, stage_index) DO UPDATE SET
           status = 'working',
           understood = TRUE,
           document_required = TRUE,
           document_url = EXCLUDED.document_url,
           document_name = EXCLUDED.document_name,
           document_public_id = EXCLUDED.document_public_id,
           document_submission_group_id = EXCLUDED.document_submission_group_id,
           document_review_status = 'pending',
           document_review_feedback = '',
           document_reviewed_at = NULL,
           started_at = COALESCE(project_stage_progress.started_at, NOW()),
           completed_at = NULL,
           updated_at = NOW()
         RETURNING step_number, stage_index, status, understood, document_required, document_url, document_name, document_public_id,
                   document_submission_group_id, document_review_status, document_review_feedback, document_reviewed_at,
                   started_at, completed_at, updated_at`,
        [userId, projectName, stepNumber, stageIndex, latestUpload.url, latestUpload.name, latestUpload.publicId, submissionGroupId]
      );

      const documentRows = [];
      for (const uploaded of uploadedFiles) {
        const inserted = await client.query(
          `INSERT INTO project_stage_documents
             (user_id, project_name, step_number, stage_index, submission_group_id, document_url, document_name, document_public_id, document_review_status, document_review_feedback, document_reviewed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', '', NULL)
           RETURNING id, step_number, stage_index, submission_group_id, document_url, document_name, document_public_id, document_review_status, document_review_feedback, document_reviewed_at, created_at`,
          [userId, projectName, stepNumber, stageIndex, submissionGroupId, uploaded.url, uploaded.name, uploaded.publicId]
        );
        documentRows.push(inserted.rows[0]);
      }

      const allDocs = await client.query(
        `SELECT id, step_number, stage_index, submission_group_id, document_url, document_name, document_public_id, document_review_status, document_review_feedback, document_reviewed_at, created_at
         FROM project_stage_documents
         WHERE user_id = $1 AND project_name = $2 AND step_number = $3 AND stage_index = $4
         ORDER BY id ASC`,
        [userId, projectName, stepNumber, stageIndex]
      );

      await client.query("COMMIT");
      return res.json({
        message: uploadedFiles.length === 1 ? "Document uploaded. Mentor review is pending." : "Documents uploaded. Mentor review is pending.",
        stage: {
          ...rows[0],
          documents: allDocs.rows,
          uploaded_documents: documentRows
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/dashboard/stage-progress/document/review-failed",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureStageProgressTable();
    const userId = req.auth.userId;
    const projectName = String(req.body?.project_name || "").trim();
    const stepNumber = Number(req.body?.step_number);
    const stageIndex = Number(req.body?.stage_index);
    const feedback = String(req.body?.feedback || "Document review could not be completed. Please re-upload the document.").trim();

    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }
    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return res.status(400).json({ detail: "step_number must be a positive integer." });
    }
    if (!Number.isInteger(stageIndex) || stageIndex < 0) {
      return res.status(400).json({ detail: "stage_index must be a non-negative integer." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRes = await client.query(
        `SELECT document_submission_group_id
         FROM project_stage_progress
         WHERE user_id = $1
           AND project_name = $2
           AND step_number = $3
           AND stage_index = $4
           AND document_review_status = 'pending'
         LIMIT 1`,
        [userId, projectName, stepNumber, stageIndex]
      );
      if (!currentRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "No pending document review found for this stage." });
      }

      const groupId = String(currentRes.rows[0]?.document_submission_group_id || "").trim();
      const { rows } = await client.query(
        `UPDATE project_stage_progress
         SET document_review_status = 'not_submitted',
             document_review_feedback = $5,
             document_reviewed_at = NULL,
             updated_at = NOW()
         WHERE user_id = $1
           AND project_name = $2
           AND step_number = $3
           AND stage_index = $4
         RETURNING step_number, stage_index, status, understood, document_required, document_url, document_name, document_public_id,
                   document_submission_group_id, document_review_status, document_review_feedback, document_reviewed_at,
                   started_at, completed_at, updated_at`,
        [userId, projectName, stepNumber, stageIndex, feedback]
      );

      if (groupId) {
        await client.query(
          `UPDATE project_stage_documents
           SET document_review_status = 'not_submitted',
               document_review_feedback = $6,
               document_reviewed_at = NULL,
               updated_at = NOW()
           WHERE user_id = $1
             AND project_name = $2
             AND step_number = $3
             AND stage_index = $4
             AND submission_group_id = $5
             AND document_review_status = 'pending'`,
          [userId, projectName, stepNumber, stageIndex, groupId, feedback]
        );
      }

      await client.query("COMMIT");
      return res.json({ message: "Document review marked as failed.", stage: rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/dashboard/stage-progress",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureStageProgressTable();
    const userId = req.auth.userId;
    const projectName = String(req.body?.project_name || "").trim();
    const stepNumber = Number(req.body?.step_number);
    const stageIndex = Number(req.body?.stage_index);
    const status = normalizeStageStatus(req.body?.status);
    const understood = Boolean(req.body?.understood) || status === "working" || status === "completed";

    if (!projectName) {
      return res.status(400).json({ detail: "project_name is required." });
    }
    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return res.status(400).json({ detail: "step_number must be a positive integer." });
    }
    if (!Number.isInteger(stageIndex) || stageIndex < 0) {
      return res.status(400).json({ detail: "stage_index must be a non-negative integer." });
    }

    await pool.query(
      `INSERT INTO project_progress (user_id, project_name, current_step, completed_tasks)
       VALUES ($1, $2, $3, '[]')
       ON CONFLICT (user_id, project_name) DO NOTHING`,
      [userId, projectName, stepNumber]
    );
    if (understood || status === "working" || status === "completed") {
      await ensurePriorStagesCompleted({ userId, projectName, stepNumber, stageIndex });
    }
    if (status === "completed") {
      if (await stageRequiresGithubIntegration({ projectName, stepNumber, stageIndex })) {
        const githubConnected = await hasConnectedGithubRepository(userId, projectName);
        if (!githubConnected) {
          return res.status(409).json({ detail: "Connect your GitHub repository before completing this stage." });
        }
      }
      const existingRes = await pool.query(
        `SELECT document_required, document_url, document_review_status
         FROM project_stage_progress
         WHERE user_id = $1 AND project_name = $2 AND step_number = $3 AND stage_index = $4
         LIMIT 1`,
        [userId, projectName, stepNumber, stageIndex]
      );
      const existing = existingRes.rows[0];
      if (existing?.document_required && existing?.document_url && existing?.document_review_status !== "approved") {
        return res.status(409).json({ detail: "This stage requires an approved document review before it can be completed." });
      }
    }

    const previousStageRes = await pool.query(
      `SELECT status
       FROM project_stage_progress
       WHERE user_id = $1 AND project_name = $2 AND step_number = $3 AND stage_index = $4
       LIMIT 1`,
      [userId, projectName, stepNumber, stageIndex]
    );

    const { rows } = await pool.query(
      `INSERT INTO project_stage_progress
         (user_id, project_name, step_number, stage_index, status, understood, started_at, completed_at)
       VALUES
         ($1, $2, $3, $4, $5, $6,
          CASE WHEN $5 IN ('working', 'completed') THEN NOW() ELSE NULL END,
          CASE WHEN $5 = 'completed' THEN NOW() ELSE NULL END)
       ON CONFLICT (user_id, project_name, step_number, stage_index) DO UPDATE SET
         status = EXCLUDED.status,
         understood = EXCLUDED.understood,
         started_at = CASE
           WHEN EXCLUDED.status IN ('working', 'completed')
             THEN COALESCE(project_stage_progress.started_at, NOW())
           ELSE NULL
         END,
         completed_at = CASE
           WHEN EXCLUDED.status = 'completed' THEN COALESCE(project_stage_progress.completed_at, NOW())
           ELSE NULL
         END,
         updated_at = NOW()
       RETURNING step_number, stage_index, status, understood, document_required, document_url, document_name, document_public_id,
                 document_review_status, document_review_feedback, document_reviewed_at,
                 started_at, completed_at, updated_at`,
      [userId, projectName, stepNumber, stageIndex, status, understood]
    );

    if (status === "working") {
      const previousStatus = String(previousStageRes.rows[0]?.status || "").trim().toLowerCase() || null;
      const resolverResult = await triggerStageResolver({
        userId,
        projectName,
        stepNumber,
        stageIndex,
        eventType: previousStatus === "working" ? "stage_resumed" : "stage_entered",
        actor: "student",
        previousStatus,
        currentStatus: "working",
        sourcePayload: {
          route: "/dashboard/stage-progress",
          status,
          understood
        }
      });
      if (!resolverResult.ok) {
        console.warn(
          "github:stage_resolver_trigger_failed user_id=%s project=%s step=%s stage=%s status=%s detail=%s",
          userId,
          projectName,
          stepNumber,
          stageIndex,
          status,
          resolverResult.detail
        );
      }
    }

    return res.json({ message: "Stage progress updated.", stage: rows[0] });
  })
);

router.post(
  "/dashboard/certificate-requests",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "80mb" }),
  asyncHandler(async (req, res) => {
    await ensureCertificateRequestSchema();
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ detail: "multipart/form-data request required." });
    }
    let parsed;
    try {
      parsed = parseMultipartFormData({ contentType, bodyBuffer: req.body });
    } catch {
      return res.status(400).json({ detail: "Invalid multipart form data." });
    }

    const userId = req.auth.userId;
    const projectName = String(parsed?.fields?.project_name || "").trim().slice(0, 160);
    const experienceText = String(parsed?.fields?.experience_text || "").trim();
    const qLearned = String(parsed?.fields?.q_learned || "").trim();
    const qChallenge = String(parsed?.fields?.q_challenge || "").trim();
    const qImprove = String(parsed?.fields?.q_improve || "").trim();
    const overallRating = normalizeRating(parsed?.fields?.overall_rating);
    const mentorRating = normalizeRating(parsed?.fields?.mentor_rating);
    const projectClarityRating = normalizeRating(parsed?.fields?.project_clarity_rating);
    const supportRating = normalizeRating(parsed?.fields?.support_rating);
    const recommendRating = normalizeRating(parsed?.fields?.recommend_rating);
    const video = parsed?.files?.video;

    if (!projectName) return res.status(400).json({ detail: "project_name is required." });
    if (!experienceText) return res.status(400).json({ detail: "Experience text is required." });
    if (!video?.buffer?.length) return res.status(400).json({ detail: "Feedback video is required." });

    const completion = await pool.query(
      `SELECT pp.project_name, pp.current_step, pp.completed_tasks, pp.created_at, p.steps_json
       FROM project_progress pp
       LEFT JOIN projects p ON lower(p.title) = lower(pp.project_name)
       WHERE pp.user_id = $1 AND pp.project_name = $2
       LIMIT 1`,
      [userId, projectName]
    );
    if (!completion.rowCount) {
      return res.status(409).json({ detail: "Certificate request is only available for completed projects." });
    }
    const stageProgress = await pool.query(
      `SELECT step_number, stage_index, status, started_at, completed_at, created_at
       FROM project_stage_progress
       WHERE user_id = $1 AND project_name = $2`,
      [userId, projectName]
    );
    const summary = summarizeProjectProgress(completion.rows[0], stageProgress.rows || []);
    if (!summary?.isComplete) {
      return res.status(409).json({ detail: "Certificate request is only available after completing all project phases." });
    }

    const upload = await uploadCertificateFeedbackVideo({ userId, projectName, file: video });
    const feedbackAnswers = { q_learned: qLearned, q_challenge: qChallenge, q_improve: qImprove };
    const inserted = await pool.query(
      `INSERT INTO certificate_requests
        (user_id, project_name, experience_text, overall_rating, mentor_rating, project_clarity_rating, support_rating, recommend_rating,
         feedback_answers, video_url, video_public_id, status, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, 'pending', NOW())
       RETURNING id`,
      [userId, projectName, experienceText, overallRating, mentorRating, projectClarityRating, supportRating, recommendRating, JSON.stringify(feedbackAnswers), upload.url, upload.publicId]
    );

    return res.status(201).json({
      message: "Feedback submitted. Your certificate request is pending admin review.",
      request_id: inserted.rows[0].id
    });
  })
);

export default router;
