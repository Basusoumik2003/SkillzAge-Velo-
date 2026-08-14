import express from "express";
import crypto from "crypto";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "../config/db.js";
import { config } from "../config/config.js";
import { requireAuth } from "../middleware/auth.js";
import { parseMultipartFormData } from "../utils/multipart.js";
import { createPresignedS3GetUrl, deleteS3Object, fetchS3Object, listS3Objects, requireS3ObjectAvailable, uploadToS3 } from "../services/s3Service.js";
import { sendCertificateIssuedEmail, sendNewsletterEmail } from "../services/mailService.js";

const router = express.Router();
const execFileAsync = promisify(execFile);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

let coinSchemaReady = null;
let mentorSchemaReady = null;
let testimonialSchemaReady = null;
let homepageCertificateSchemaReady = null;
let certificateRequestSchemaReady = null;
let adminProjectDraftSchemaReady = null;
let documentArchitectureSchemaReady = null;
let aiUsageSchemaReady = null;
let userPresenceSchemaReady = null;
let recommendationLogSchemaReady = null;
let stageDocumentReviewAuditSchemaReady = null;
let newsletterSchemaReady = null;
let publicTestimonialsCache = { expiresAt: 0, payload: null };
let publicHomeCertificatesCache = { expiresAt: 0, payload: null };

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

function ensureStageDocumentReviewAuditSchema() {
  if (!stageDocumentReviewAuditSchemaReady) {
    stageDocumentReviewAuditSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS stage_document_review_audits (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        audit_text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_stage_document_review_audits_stage CHECK (stage_index >= 0),
        CONSTRAINT chk_stage_document_review_audits_step CHECK (step_number >= 1),
        CONSTRAINT chk_stage_document_review_audits_status CHECK (review_status IN ('approved', 'rejected'))
      );
      CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_user_project
        ON stage_document_review_audits(user_id, project_name, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_group
        ON stage_document_review_audits(user_id, project_name, step_number, stage_index, submission_group_id);
      ALTER TABLE stage_document_review_audits
        ADD COLUMN IF NOT EXISTS audit_text TEXT NOT NULL DEFAULT '';
    `);
  }
  return stageDocumentReviewAuditSchemaReady;
}

function ensureCoinSchema() {
  if (!coinSchemaReady) {
    coinSchemaReady = pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_coins_purchased INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
      CREATE INDEX IF NOT EXISTS ix_users_is_active ON users(is_active);
      CREATE INDEX IF NOT EXISTS ix_users_created_at ON users(created_at DESC);
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS coins_purchased INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS coin_unit_amount_paisa INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS coupon_id INTEGER,
        ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS coupon_discount_paisa INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS project_coins INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS company_profile_text TEXT NOT NULL DEFAULT '',
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
      CREATE INDEX IF NOT EXISTS ix_projects_domain ON projects(domain);
      CREATE INDEX IF NOT EXISTS ix_projects_complexity ON projects(complexity);
      CREATE TABLE IF NOT EXISTS project_category_icons (
        global_category VARCHAR(80) PRIMARY KEY,
        image_url TEXT NOT NULL DEFAULT '',
        image_public_id TEXT NOT NULL DEFAULT '',
        original_filename VARCHAR(255) NOT NULL DEFAULT '',
        mime_type VARCHAR(120) NOT NULL DEFAULT '',
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        background_image_url TEXT NOT NULL DEFAULT '',
        background_image_public_id TEXT NOT NULL DEFAULT '',
        background_original_filename VARCHAR(255) NOT NULL DEFAULT '',
        background_mime_type VARCHAR(120) NOT NULL DEFAULT '',
        background_file_size_bytes BIGINT NOT NULL DEFAULT 0,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE project_category_icons
        ADD COLUMN IF NOT EXISTS background_image_url TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS background_image_public_id TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS background_original_filename VARCHAR(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS background_mime_type VARCHAR(120) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS background_file_size_bytes BIGINT NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        discount_amount_paisa INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_coupons_discount_amount_positive CHECK (discount_amount_paisa > 0)
      );
      CREATE INDEX IF NOT EXISTS ix_coupons_is_active ON coupons(is_active);
      CREATE INDEX IF NOT EXISTS ix_payments_coupon_id ON payments(coupon_id);
      CREATE INDEX IF NOT EXISTS ix_payments_coupon_code ON payments(coupon_code);
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
      CREATE TABLE IF NOT EXISTS github_app_settings (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        github_token TEXT NOT NULL DEFAULT '',
        webhook_secret TEXT NOT NULL DEFAULT '',
        token_expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_github_app_settings_active_updated
        ON github_app_settings(is_active, updated_at DESC);
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
      SELECT user_id, COALESCE(SUM(coins_purchased), 0)::integer, COALESCE(SUM(coins_purchased), 0)::integer, NOW(), NOW()
      FROM payments
      WHERE status = 'paid'
        AND purpose = 'coin_purchase'
        AND coins_purchased > 0
      GROUP BY user_id
      ON CONFLICT (user_id) DO NOTHING;
    `);
  }
  return coinSchemaReady;
}

function normalizeCoinUnitAmountPaisa(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 350000;
  return Math.max(100, Math.min(100000000, Math.round(n)));
}

function normalizeCoinOriginalAmountPaisa(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1000000;
  return Math.max(100, Math.min(100000000, Math.round(n)));
}

function normalizeRazorpayKeyId(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeRazorpayKeySecret(value) {
  return String(value || "").trim().slice(0, 240);
}

function normalizeWorkspaceClosed(value) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on", "closed"].includes(String(value || "").trim().toLowerCase());
}


function normalizeNewsletterText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function ensureNewsletterSchema() {
  if (!newsletterSchemaReady) {
    newsletterSchemaReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email VARCHAR(160) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'subscribed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_status ON newsletter_subscribers(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_created_at ON newsletter_subscribers(created_at)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS admin_newsletters (
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
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ix_admin_newsletters_created_at ON admin_newsletters(created_at)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ix_admin_newsletters_status ON admin_newsletters(status)`);
    })().catch((err) => {
      newsletterSchemaReady = null;
      throw err;
    });
  }
  return newsletterSchemaReady;
}

async function uploadNewsletterImage({ newsletterId = "new", file }) {
  if (!file?.buffer?.length) return null;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: "internlabs/newsletters",
    contentType: file.contentType || "application/octet-stream",
    publicId: `newsletter_${newsletterId}_${Date.now()}`
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    originalFilename: String(file.filename || "newsletter-image").trim().slice(0, 255),
    mimeType: String(file.contentType || "").trim().slice(0, 120)
  };
}

function newsletterImageUrl(row, expiresInSeconds = 3600) {
  const key = String(row?.image_public_id || "").trim();
  if (!key) return row?.image_url || "";
  try {
    return createPresignedS3GetUrl({ key, expiresSeconds }) || row.image_url || "";
  } catch {
    return row?.image_url || "";
  }
}

function serializeNewsletter(row) {
  return {
    id: row.id,
    subject: row.subject || "",
    title: row.title || "",
    body_text: row.body_text || "",
    image_url: newsletterImageUrl(row),
    image_original_filename: row.image_original_filename || "",
    image_mime_type: row.image_mime_type || "",
    status: row.status || "draft",
    recipient_count: Number(row.recipient_count || 0),
    sent_count: Number(row.sent_count || 0),
    skipped_count: Number(row.skipped_count || 0),
    failed_count: Number(row.failed_count || 0),
    last_error: row.last_error || "",
    sent_at: row.sent_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}function normalizeWorkspaceClosedMessage(value) {
  const fallback = "The workspace is being updated right now. Please wait a little and try again shortly.";
  const text = String(value || "").trim();
  return (text || fallback).slice(0, 500);
}

function maskSecret(value, visible = 4) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= visible) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}`;
}

function normalizeGithubToken(value) {
  return String(value || "").trim().slice(0, 1000);
}

function normalizeGithubWebhookSecret(value) {
  return String(value || "").trim().slice(0, 500);
}

function normalizeOptionalDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function assignmentProjectKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultGithubTokenExpiry() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 90);
  return date;
}

function serializeGithubSettings(row) {
  const token = normalizeGithubToken(row?.github_token);
  const webhookSecret = normalizeGithubWebhookSecret(row?.webhook_secret);
  return {
    github_token_configured: Boolean(token),
    github_token_masked: maskSecret(token, 6),
    webhook_secret_configured: Boolean(webhookSecret),
    webhook_secret_masked: maskSecret(webhookSecret, 6),
    token_expires_at: row?.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
    updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    is_active: row?.is_active !== false
  };
}

function normalizeHomeStatValue(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100000000, Math.round(n)));
}

function normalizeHomeStatSuffix(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 8);
}

function parseStagesFromStepContext(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const stagesIndex = lines.findIndex((line) => String(line || "").trim() === "Stages:");
  if (stagesIndex === -1) return [];
  return lines
    .slice(stagesIndex + 1)
    .join("\n")
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const header = String(block.split("\n")[0] || "").trim();
      const headerMatch = header.match(/^\d+\.\s*(.*)$/);
      return { title: String(headerMatch ? headerMatch[1] : header).trim() };
    });
}

function parseProjectSteps(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countStepUnits(step) {
  return Math.max(1, parseStagesFromStepContext(step?.step_context).length || 1);
}

function deriveAssignmentSnapshot({ progressRow, stageRows = [], latestRequestStatus = "" }) {
  const requestStatus = String(latestRequestStatus || "").trim().toLowerCase();
  if (!progressRow?.project_name) {
    return {
      lifecycle_status: requestStatus === "abandoned" ? "abandoned" : "unassigned",
      current_phase_number: null,
      current_phase_name: "",
      current_stage_index: null,
      current_stage_name: ""
    };
  }

  const steps = parseProjectSteps(progressRow.steps_json);
  const totalSteps = Math.max(1, steps.length || 1);
  const rawCurrentStep = Math.max(1, Math.min(totalSteps, Number(progressRow.current_step) || 1));
  const normalizedRows = (stageRows || []).map((row) => ({
    ...row,
    step_number: Math.max(1, Number(row?.step_number) || 1),
    stage_index: Math.max(0, Number(row?.stage_index) || 0),
    status: String(row?.status || "undone").toLowerCase()
  }));
  const anyStarted = normalizedRows.some((row) => row.status === "working" || row.status === "completed" || row.started_at || row.completed_at);

  let totalStageUnits = 0;
  let completedStageUnits = 0;
  let completedStepCount = 0;
  steps.forEach((step, index) => {
    const stepNumber = index + 1;
    const expectedUnits = countStepUnits(step);
    totalStageUnits += expectedUnits;
    const completedForStep = normalizedRows.filter((row) => row.step_number === stepNumber && row.status === "completed").length;
    const completedUnits = Math.min(expectedUnits, completedForStep);
    completedStageUnits += completedUnits;
    if (completedUnits >= expectedUnits) completedStepCount += 1;
  });
  const isComplete = totalStageUnits > 0 && completedStageUnits >= totalStageUnits;

  const derivedCurrentStep = Math.min(totalSteps, completedStepCount + 1);
  const activeStepNumber = isComplete ? totalSteps : Math.min(totalSteps, Math.max(rawCurrentStep, derivedCurrentStep));
  const activeStep = steps[activeStepNumber - 1] || {};
  const phaseName = String(activeStep?.title || `Phase ${activeStepNumber}`).trim();
  const stageDefs = parseStagesFromStepContext(activeStep?.step_context);
  const stepStageRows = normalizedRows.filter((row) => row.step_number === activeStepNumber);

  let stageIndex = 0;
  if (isComplete) {
    stageIndex = Math.max(0, countStepUnits(activeStep) - 1);
  } else {
    const workingStage = stepStageRows.find((row) => row.status === "working");
    if (workingStage) {
      stageIndex = workingStage.stage_index;
    } else {
      const completedIndexes = new Set(stepStageRows.filter((row) => row.status === "completed").map((row) => row.stage_index));
      const stageCount = Math.max(1, stageDefs.length || 1);
      const firstOpen = Array.from({ length: stageCount }, (_, idx) => idx).find((idx) => !completedIndexes.has(idx));
      stageIndex = Number.isInteger(firstOpen) ? firstOpen : 0;
    }
  }

  const stageName = String(stageDefs[stageIndex]?.title || `Stage ${stageIndex + 1}`).trim();
  const lifecycleStatus = requestStatus === "abandoned"
    ? "abandoned"
    : isComplete
      ? "completed"
      : anyStarted
        ? "started"
        : "assigned";

  return {
    lifecycle_status: lifecycleStatus,
    current_phase_number: activeStepNumber,
    current_phase_name: phaseName,
    current_stage_index: stageIndex + 1,
    current_stage_name: stageName
  };
}

function stageLabelsForMessage({ metadata = {}, projectSteps = [] }) {
  const stepNumber = Number(metadata.step_number);
  const stageIndex = Number(metadata.stage_index);
  const phaseNumber = Number.isFinite(stepNumber) && stepNumber > 0 ? Math.round(stepNumber) : null;
  const phase = phaseNumber ? projectSteps[phaseNumber - 1] || {} : {};
  const stageDefs = parseStagesFromStepContext(phase?.step_context);
  const normalizedStageIndex = Number.isFinite(stageIndex) && stageIndex >= 0 ? Math.round(stageIndex) : null;

  return {
    stage_key: String(metadata.stage_key || "").trim(),
    phase_number: phaseNumber,
    phase_name: phaseNumber ? String(phase?.title || `Phase ${phaseNumber}`).trim() : "",
    stage_index: normalizedStageIndex == null ? null : normalizedStageIndex + 1,
    stage_name:
      normalizedStageIndex == null
        ? ""
        : String(stageDefs[normalizedStageIndex]?.title || `Stage ${normalizedStageIndex + 1}`).trim()
  };
}

function mapHomeStats(settings = {}) {
  return {
    learners: {
      value: normalizeHomeStatValue(settings.home_stats_learners_value, 10),
      suffix: normalizeHomeStatSuffix(settings.home_stats_learners_suffix, "")
    },
    projects: {
      value: normalizeHomeStatValue(settings.home_stats_projects_value, 50),
      suffix: normalizeHomeStatSuffix(settings.home_stats_projects_suffix, "")
    },
    satisfaction: {
      value: normalizeHomeStatValue(settings.home_stats_satisfaction_value, 98),
      suffix: normalizeHomeStatSuffix(settings.home_stats_satisfaction_suffix, "%")
    }
  };
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

function ensureTestimonialSchema() {
  if (!testimonialSchemaReady) {
    testimonialSchemaReady = pool.query(`
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
    `);
  }
  return testimonialSchemaReady;
}

function ensureHomepageCertificateSchema() {
  if (!homepageCertificateSchemaReady) {
    homepageCertificateSchemaReady = pool.query(`
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
      ALTER TABLE homepage_certificates
        ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS image_public_id TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0;
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'homepage_certificates'
            AND column_name = 'recipient'
        ) THEN
          ALTER TABLE homepage_certificates
            ALTER COLUMN recipient SET DEFAULT '';
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS ix_homepage_certificates_active_order
        ON homepage_certificates(is_active, display_order, id);
    `);
  }
  return homepageCertificateSchemaReady;
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      CREATE INDEX IF NOT EXISTS ix_certificate_requests_created_at ON certificate_requests(created_at DESC);
    `);
  }
  return certificateRequestSchemaReady;
}

function safeExt(filename) {
  const match = String(filename || "")
    .toLowerCase()
    .match(/\.[a-z0-9]{1,12}$/);
  return match ? match[0] : "";
}

async function uploadIssuedCertificate({ requestId, userId, file }) {
  const ext = safeExt(file.filename) || ".pdf";
  const id = crypto.randomBytes(10).toString("hex");
  const publicId = `u${userId}_certificate_request_${requestId}_${id}`;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: `${publicId}${ext}`,
    folder: "internlabs/certificates",
    contentType: file.contentType || "application/pdf",
    publicId
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    originalFilename: String(file.filename || `certificate${ext}`).slice(0, 255),
    mimeType: String(file.contentType || "application/pdf").slice(0, 120)
  };
}

function signedCertificateUrl(row, expiresSeconds = 1800) {
  if (row?.certificate_public_id) {
    return createPresignedS3GetUrl({
      key: row.certificate_public_id,
      expiresSeconds,
      responseContentDisposition: `attachment; filename="${String(row.certificate_original_filename || "certificate.pdf").replace(/"/g, "")}"`,
      responseContentType: row.certificate_mime_type || "application/pdf"
    });
  }
  return row?.certificate_url || "";
}

function signedVideoUrl(row, expiresSeconds = 1800) {
  return row?.video_public_id
    ? createPresignedS3GetUrl({ key: row.video_public_id, expiresSeconds })
    : row?.video_url || "";
}

function ensureAdminProjectDraftSchema() {
  if (!adminProjectDraftSchemaReady) {
    adminProjectDraftSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS admin_project_drafts (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        draft_key VARCHAR(120) NOT NULL DEFAULT 'project_create',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (admin_user_id, draft_key)
      );
      CREATE INDEX IF NOT EXISTS ix_admin_project_drafts_updated_at
        ON admin_project_drafts(updated_at DESC);
    `);
  }
  return adminProjectDraftSchemaReady;
}

function ensureDocumentArchitectureSchema() {
  if (!documentArchitectureSchemaReady) {
    documentArchitectureSchemaReady = pool.query(`
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

      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS company_id INTEGER,
        ADD COLUMN IF NOT EXISTS global_category VARCHAR(80) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS is_demo_project BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE projects
      SET company_id = (SELECT id FROM companies WHERE slug = 'internzbee-default' LIMIT 1)
      WHERE company_id IS NULL;
      ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;
      DO $$
      DECLARE
        default_company_id INTEGER;
      BEGIN
        SELECT id INTO default_company_id FROM companies WHERE slug = 'internzbee-default' LIMIT 1;
        IF default_company_id IS NOT NULL THEN
          EXECUTE format('ALTER TABLE projects ALTER COLUMN company_id SET DEFAULT %s', default_company_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_company') THEN
          ALTER TABLE projects
            ADD CONSTRAINT fk_projects_company
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS ix_projects_company_id ON projects(company_id);
      CREATE INDEX IF NOT EXISTS ix_projects_company_active ON projects(company_id, is_active);
      CREATE INDEX IF NOT EXISTS ix_projects_demo_active ON projects(is_demo_project, is_active);
      CREATE INDEX IF NOT EXISTS ix_projects_global_category ON projects(global_category);

      CREATE TABLE IF NOT EXISTS demo_documents (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(240) NOT NULL,
        storage_url TEXT NOT NULL DEFAULT '',
        storage_public_id TEXT NOT NULL DEFAULT '',
        original_filename VARCHAR(255) NOT NULL DEFAULT '',
        mime_type VARCHAR(120) NOT NULL DEFAULT '',
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        tag VARCHAR(120) NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE demo_documents
        ADD COLUMN IF NOT EXISTS tag VARCHAR(120) NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS ix_demo_documents_tag_active
        ON demo_documents(tag, is_active);
      CREATE INDEX IF NOT EXISTS ix_demo_documents_active_updated
        ON demo_documents(is_active, updated_at DESC);

      CREATE TABLE IF NOT EXISTS project_documents (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        indexed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_project_documents_source_type
          CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
        CONSTRAINT chk_project_documents_status
          CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
        CONSTRAINT chk_project_documents_version
          CHECK (version >= 1)
      );
      CREATE INDEX IF NOT EXISTS ix_project_documents_company_project ON project_documents(company_id, project_id);
      CREATE INDEX IF NOT EXISTS ix_project_documents_project_status ON project_documents(project_id, status);
      CREATE INDEX IF NOT EXISTS ix_project_documents_project_type ON project_documents(project_id, document_type);
      CREATE INDEX IF NOT EXISTS ix_project_documents_active ON project_documents(is_active);
      ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS indexing_error TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS ingestion_attempted_at TIMESTAMPTZ;
      ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'project';
      ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(80) NOT NULL DEFAULT '';
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
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
        link_type VARCHAR(30) NOT NULL DEFAULT 'attached',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

      CREATE TABLE IF NOT EXISTS document_chunks (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL DEFAULT 0,
        embedding DOUBLE PRECISION[],
        embedding_dimension INTEGER NOT NULL DEFAULT 0,
        embedding_model VARCHAR(120) NOT NULL DEFAULT '',
        document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_document_chunks_chunk_index CHECK (chunk_index >= 0),
        CONSTRAINT chk_document_chunks_token_count CHECK (token_count >= 0),
        CONSTRAINT chk_document_chunks_embedding_dimension CHECK (embedding_dimension >= 0),
        CONSTRAINT uq_document_chunks_document_chunk UNIQUE (document_id, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS ix_document_chunks_company_project ON document_chunks(company_id, project_id);
      CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks(document_id);
      CREATE INDEX IF NOT EXISTS ix_document_chunks_metadata ON document_chunks USING GIN (document_metadata);

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
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        indexed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_global_documents_source_type
          CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
        CONSTRAINT chk_global_documents_status
          CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
        CONSTRAINT chk_global_documents_version
          CHECK (version >= 1)
      );
      DROP INDEX IF EXISTS ix_global_documents_company_category_status;
      DROP INDEX IF EXISTS ix_global_documents_company_category_type;
      DROP INDEX IF EXISTS ix_global_documents_company_hash;
      ALTER TABLE IF EXISTS global_documents DROP COLUMN IF EXISTS company_id CASCADE;
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
        global_document_id INTEGER NOT NULL REFERENCES global_documents(id) ON DELETE CASCADE,
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
        CONSTRAINT chk_global_document_chunks_chunk_index CHECK (chunk_index >= 0),
        CONSTRAINT chk_global_document_chunks_token_count CHECK (token_count >= 0),
        CONSTRAINT chk_global_document_chunks_embedding_dimension CHECK (embedding_dimension >= 0),
        CONSTRAINT uq_global_document_chunks_document_chunk UNIQUE (global_document_id, chunk_index)
      );
      DROP INDEX IF EXISTS ix_global_document_chunks_company_category;
      ALTER TABLE IF EXISTS global_document_chunks DROP COLUMN IF EXISTS company_id CASCADE;
      CREATE INDEX IF NOT EXISTS ix_global_document_chunks_category
        ON global_document_chunks(global_category);
      CREATE INDEX IF NOT EXISTS ix_global_document_chunks_document_id
        ON global_document_chunks(global_document_id);
      CREATE INDEX IF NOT EXISTS ix_global_document_chunks_metadata
        ON global_document_chunks USING GIN (document_metadata);

      CREATE TABLE IF NOT EXISTS global_category_document_access_settings (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        global_category VARCHAR(80) NOT NULL,
        is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_global_category_document_access_settings
          UNIQUE (global_category)
      );
      CREATE TABLE IF NOT EXISTS global_category_document_access (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        global_category VARCHAR(80) NOT NULL,
        global_document_id INTEGER NOT NULL REFERENCES global_documents(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_global_category_document_access
          UNIQUE (global_category, global_document_id)
      );
      CREATE INDEX IF NOT EXISTS ix_global_category_document_access_category
        ON global_category_document_access(global_category);
      CREATE INDEX IF NOT EXISTS ix_global_category_document_access_document
        ON global_category_document_access(global_document_id);

      CREATE TABLE IF NOT EXISTS project_global_document_access_settings (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        global_category VARCHAR(80) NOT NULL,
        is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_project_global_document_access_settings
          UNIQUE (project_id, global_category)
      );
      CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_project
        ON project_global_document_access_settings(project_id);
      CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_category
        ON project_global_document_access_settings(global_category);

      CREATE TABLE IF NOT EXISTS project_global_document_access (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        global_document_id INTEGER NOT NULL REFERENCES global_documents(id) ON DELETE CASCADE,
        global_category VARCHAR(80) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_project_global_document_access
          UNIQUE (project_id, global_document_id)
      );
      CREATE INDEX IF NOT EXISTS ix_project_global_document_access_project_category
        ON project_global_document_access(project_id, global_category);
      CREATE INDEX IF NOT EXISTS ix_project_global_document_access_document
        ON project_global_document_access(global_document_id);

      CREATE TABLE IF NOT EXISTS agent_document_access (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        mentor_id INTEGER NOT NULL REFERENCES project_mentors(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
        access_level VARCHAR(30) NOT NULL DEFAULT 'read',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_agent_document_access_level
          CHECK (access_level IN ('read', 'review', 'hidden_review')),
        CONSTRAINT uq_agent_document_access_mentor_document UNIQUE (mentor_id, document_id)
      );
      CREATE INDEX IF NOT EXISTS ix_agent_document_access_project_mentor ON agent_document_access(project_id, mentor_id);
      CREATE INDEX IF NOT EXISTS ix_agent_document_access_document ON agent_document_access(document_id);
      CREATE INDEX IF NOT EXISTS ix_agent_document_access_company_project ON agent_document_access(company_id, project_id);
      ALTER TABLE agent_document_access DROP CONSTRAINT IF EXISTS uq_agent_document_access_mentor_document;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_document_access_mentor_project_document
        ON agent_document_access(mentor_id, project_id, document_id);
    `);
  }
  return documentArchitectureSchemaReady;
}

async function requireAdmin(req) {
  const userId = req.auth.userId;
  await ensureCoinSchema();
  const { rows } = await pool.query(
    `SELECT ac.id
     FROM users u
     INNER JOIN admin_credentials ac
       ON LOWER(ac.email) = LOWER(u.email)
     WHERE u.id = $1
       AND ac.is_active = TRUE
       AND ac.can_access_admin = TRUE
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
}

async function tableExists(client, tableName) {
  const { rows } = await client.query("SELECT to_regclass($1) AS name", [tableName]);
  return Boolean(rows[0]?.name);
}

async function deleteFromTableIfExists(client, tableName, whereSql, params) {
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error("Unsafe table name.");
  }
  if (!(await tableExists(client, tableName))) return 0;
  const result = await client.query(`DELETE FROM ${tableName} WHERE ${whereSql}`, params);
  return result.rowCount || 0;
}

async function updateTableIfExists(client, tableName, setSql, whereSql, params) {
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error("Unsafe table name.");
  }
  if (!(await tableExists(client, tableName))) return 0;
  const result = await client.query(`UPDATE ${tableName} SET ${setSql} WHERE ${whereSql}`, params);
  return result.rowCount || 0;
}

async function queryRowsIfTableExists(client, tableName, sql, params = []) {
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error("Unsafe table name.");
  }
  if (!(await tableExists(client, tableName))) return [];
  try {
    const result = await client.query(sql, params);
    return result.rows || [];
  } catch (error) {
    if (["42703", "42P01"].includes(String(error?.code || ""))) {
      return [];
    }
    throw error;
  }
}

function addS3Reference(referenceMap, key, reference) {
  const objectKey = String(key || "").trim();
  if (!objectKey) return;
  const current = referenceMap.get(objectKey) || [];
  const alreadyExists = current.some((item) => (
    item?.source === reference?.source
    && String(item?.record_id || "") === String(reference?.record_id || "")
    && String(item?.user_id || "") === String(reference?.user_id || "")
  ));
  if (alreadyExists) return;
  current.push(reference);
  referenceMap.set(objectKey, current);
}

function s3KeyBasename(key) {
  return String(key || "").trim().replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

function addS3ReferenceForListedKeys(referenceMap, listedKeys, candidateKeys, reference) {
  const normalizedCandidates = [...new Set((candidateKeys || []).map((key) => String(key || "").trim()).filter(Boolean))];
  normalizedCandidates.forEach((key) => addS3Reference(referenceMap, key, reference));

  const candidateNames = new Set(normalizedCandidates.map(s3KeyBasename).filter(Boolean));
  if (!candidateNames.size) return;
  (listedKeys || []).forEach((listedKey) => {
    if (normalizedCandidates.includes(listedKey) || candidateNames.has(s3KeyBasename(listedKey))) {
      addS3Reference(referenceMap, listedKey, reference);
    }
  });
}

async function buildS3ReferenceMap(client, keys) {
  const cleanKeys = [...new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean))];
  const lookupKeys = [...new Set([...cleanKeys, ...cleanKeys.map(s3KeyBasename)].filter(Boolean))];
  const referenceMap = new Map();
  if (!cleanKeys.length) return referenceMap;

  const certificateRows = await queryRowsIfTableExists(
    client,
    "certificate_requests",
    `SELECT cr.id, cr.user_id, cr.project_name, cr.video_public_id, cr.certificate_public_id,
            u.public_id, u.name, u.email
     FROM certificate_requests cr
     LEFT JOIN users u ON u.id = cr.user_id
     WHERE cr.video_public_id = ANY($1::text[])
        OR cr.certificate_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  certificateRows.forEach((row) => {
    addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.video_public_id], {
      source: "Certificate feedback video",
      record_id: row.id,
      user_id: row.user_id,
      user_public_id: row.public_id,
      user_name: row.name,
      user_email: row.email,
      detail: row.project_name,
    });
    addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.certificate_public_id], {
      source: "Issued certificate",
      record_id: row.id,
      user_id: row.user_id,
      user_public_id: row.public_id,
      user_name: row.name,
      user_email: row.email,
      detail: row.project_name,
    });
  });

  const selfIntroRows = await queryRowsIfTableExists(
    client,
    "self_intro_submissions",
    `SELECT s.id, s.user_id, s.video_url, s.video_s3_key, s.video_public_id, s.original_filename,
            u.public_id, u.name, u.email
     FROM self_intro_submissions s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.video_s3_key = ANY($1::text[])
        OR s.video_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  selfIntroRows.forEach((row) => {
    const ref = {
      source: "Self intro video",
      record_id: row.id,
      user_id: row.user_id,
      user_public_id: row.public_id,
      user_name: row.name,
      user_email: row.email,
      detail: row.original_filename,
    };
    addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.video_s3_key, row.video_public_id, s3KeyFromUrl(row.video_url)], ref);
  });

  const stageDocRows = await queryRowsIfTableExists(
    client,
    "project_stage_documents",
    `SELECT d.id, d.user_id, d.project_name, d.document_name, d.document_public_id,
            u.public_id, u.name, u.email
     FROM project_stage_documents d
     LEFT JOIN users u ON u.id = d.user_id
     WHERE d.document_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  stageDocRows.forEach((row) => addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.document_public_id], {
    source: "Stage document",
    record_id: row.id,
    user_id: row.user_id,
    user_public_id: row.public_id,
    user_name: row.name,
    user_email: row.email,
    detail: `${row.project_name || ""}${row.document_name ? ` - ${row.document_name}` : ""}`,
  }));

  const projectDocRows = await queryRowsIfTableExists(
    client,
    "project_documents",
    `SELECT d.id, d.uploaded_by AS user_id, d.title, d.storage_public_id,
            u.public_id, u.name, u.email
     FROM project_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.storage_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  projectDocRows.forEach((row) => addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.storage_public_id], {
    source: "Project document",
    record_id: row.id,
    user_id: row.user_id,
    user_public_id: row.public_id,
    user_name: row.name,
    user_email: row.email,
    detail: row.title,
  }));

  const demoDocRows = await queryRowsIfTableExists(
    client,
    "demo_documents",
    `SELECT d.id, d.uploaded_by AS user_id, d.name AS title, d.storage_public_id,
            u.public_id, u.name, u.email
     FROM demo_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.storage_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  demoDocRows.forEach((row) => addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.storage_public_id], {
    source: "Demo document",
    record_id: row.id,
    user_id: row.user_id,
    user_public_id: row.public_id,
    user_name: row.name,
    user_email: row.email,
    detail: row.title,
  }));

  const invoiceRows = await queryRowsIfTableExists(
    client,
    "invoices",
    `SELECT i.id, i.user_id, i.invoice_number, i.invoice_pdf_public_id,
            u.public_id, u.name, u.email
     FROM invoices i
     LEFT JOIN users u ON u.id = i.user_id
     WHERE i.invoice_pdf_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  invoiceRows.forEach((row) => addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.invoice_pdf_public_id], {
    source: "Invoice PDF",
    record_id: row.id,
    user_id: row.user_id,
    user_public_id: row.public_id,
    user_name: row.name,
    user_email: row.email,
    detail: row.invoice_number,
  }));

  const testimonialRows = await queryRowsIfTableExists(
    client,
    "testimonials",
    `SELECT id, name, role, video_public_id
     FROM testimonials
     WHERE video_public_id = ANY($1::text[])`,
    [lookupKeys]
  );
  testimonialRows.forEach((row) => addS3ReferenceForListedKeys(referenceMap, cleanKeys, [row.video_public_id], {
    source: "Testimonial video",
    record_id: row.id,
    user_id: null,
    user_public_id: "",
    user_name: row.name,
    user_email: "",
    detail: row.role,
  }));

  const inferredUserIds = cleanKeys
    .map((key) => String(key).match(/(?:^|\/)u(\d+)_/i)?.[1])
    .filter(Boolean)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (inferredUserIds.length) {
    const users = await client.query(
      `SELECT id, public_id, name, email
       FROM users
       WHERE id = ANY($1::int[])`,
      [[...new Set(inferredUserIds)]]
    );
    const byId = new Map(users.rows.map((row) => [Number(row.id), row]));
    cleanKeys.forEach((key) => {
      if (referenceMap.has(key)) return;
      const inferredId = Number(String(key).match(/(?:^|\/)u(\d+)_/i)?.[1]);
      const user = byId.get(inferredId);
      if (!user) return;
      addS3Reference(referenceMap, key, {
        source: "Inferred from S3 key",
        record_id: null,
        user_id: user.id,
        user_public_id: user.public_id,
        user_name: user.name,
        user_email: user.email,
        detail: "",
      });
    });
  }

  return referenceMap;
}

async function hardDeleteUserAccount(client, userId, email) {
  const counts = {};
  const del = async (tableName, whereSql, params) => {
    const count = await deleteFromTableIfExists(client, tableName, whereSql, params);
    if (count) counts[tableName] = (counts[tableName] || 0) + count;
  };
  const setNull = async (tableName, columnName) => {
    const count = await updateTableIfExists(client, tableName, `${columnName} = NULL`, `${columnName} = $1`, [userId]);
    if (count) counts[`${tableName}.${columnName}_cleared`] = count;
  };

  await del("login_codes", "lower(email) = lower($1)", [email]);
  await del("admin_credentials", "lower(email) = lower($1)", [email]);
  await del("newsletter_subscribers", "lower(email) = lower($1)", [email]);
  await del("contact_messages", "lower(email) = lower($1)", [email]);

  await del("self_intro_reports", "user_id = $1", [userId]);
  await del("self_intro_analysis_jobs", "user_id = $1", [userId]);
  await del("self_intro_submissions", "user_id = $1", [userId]);
  await del("invoices", "user_id = $1", [userId]);
  await del("payments", "user_id = $1", [userId]);
  await del("certificate_requests", "user_id = $1", [userId]);
  await del("project_stage_documents", "user_id = $1", [userId]);
  await del("project_stage_progress", "user_id = $1", [userId]);
  await del("mentor_chat_messages", "user_id = $1", [userId]);
  await del("project_recommendation_logs", "user_id = $1", [userId]);
  await del("project_assignment_requests", "user_id = $1", [userId]);
  await del("project_progress", "user_id = $1", [userId]);
  await del("github_repositories", "user_id = $1", [userId]);
  await del("code_reviews", "user_id = $1", [userId]);
  await del("user_profiles", "user_id = $1", [userId]);
  await del("subscriptions", "user_id = $1", [userId]);
  await del("refresh_tokens", "user_id = $1", [userId]);
  await del("user_coin_balances", "user_id = $1", [userId]);
  await del("admin_project_drafts", "admin_user_id = $1", [userId]);
  await del("ai_usage_events", "user_id = $1", [userId]);
  await del("audit_logs", "user_id = $1", [userId]);

  await setNull("app_settings", "updated_by");
  await setNull("github_app_settings", "updated_by");
  await setNull("demo_documents", "uploaded_by");
  await setNull("project_documents", "uploaded_by");
  await setNull("coupons", "created_by");
  await setNull("invoices", "created_by");
  await setNull("project_assignment_requests", "resolved_by");

  const deletedUser = await client.query(
    "DELETE FROM users WHERE id = $1 RETURNING id, public_id, name, email",
    [userId]
  );
  counts.users = deletedUser.rowCount || 0;
  return { counts, user: deletedUser.rows[0] || null };
}

const DEFAULT_PROJECT_CATEGORY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "web", label: "Web / Full Stack" },
  { value: "ai", label: "AI / ML" },
  { value: "iot", label: "IoT / Embedded" },
  { value: "android", label: "Android" },
  { value: "data", label: "Data" },
  { value: "cloud", label: "Cloud" },
  { value: "management", label: "Management" },
  { value: "marketing", label: "Marketing" },
  { value: "digital-commerce", label: "Digital Commerce" },
  { value: "customer-experience", label: "Customer Experience" }
];
const DEFAULT_MENTOR_CHAT_RULES = {
  tone: "warm",
  reply_style: "mentor_conversation",
  response_length: "short",
  follow_up_behavior: "when_needed",
  code_sharing_rule: "pseudocode_only",
  solution_guidance: "guided_hints",
  stage_scope: "current_stage_only",
  custom_instruction: ""
};

function normalizeMentorChatRules(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  source = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const pick = (key, allowed, fallback) => {
    const next = String(source[key] || "").trim();
    return allowed.includes(next) ? next : fallback;
  };
  return {
    tone: pick("tone", ["warm", "strict", "casual", "professional"], DEFAULT_MENTOR_CHAT_RULES.tone),
    reply_style: pick("reply_style", ["mentor_conversation", "direct_answer", "step_by_step", "review_mode"], DEFAULT_MENTOR_CHAT_RULES.reply_style),
    response_length: pick("response_length", ["short", "medium", "detailed"], DEFAULT_MENTOR_CHAT_RULES.response_length),
    follow_up_behavior: pick("follow_up_behavior", ["when_needed", "always", "never"], DEFAULT_MENTOR_CHAT_RULES.follow_up_behavior),
    code_sharing_rule: pick("code_sharing_rule", ["no_code", "pseudocode_only", "small_snippets"], DEFAULT_MENTOR_CHAT_RULES.code_sharing_rule),
    solution_guidance: pick("solution_guidance", ["hints_only", "guided_hints", "stronger_after_review"], DEFAULT_MENTOR_CHAT_RULES.solution_guidance),
    stage_scope: pick("stage_scope", ["current_stage_only", "broader_project_context"], DEFAULT_MENTOR_CHAT_RULES.stage_scope),
    custom_instruction: String(source.custom_instruction || "").trim().slice(0, 2000)
  };
}

function categorySlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "normal";
}

function normalizeProjectCategoryOptions(value) {
  let source = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = trimmed.split(/\r?\n/g);
      }
    } else {
      source = trimmed.split(/\r?\n/g);
    }
  }
  const list = Array.isArray(source) ? source : DEFAULT_PROJECT_CATEGORY_OPTIONS;
  const seen = new Set();
  const options = [];
  for (const item of list) {
    const label = String(typeof item === "string" ? item : item?.label || item?.name || item?.value || "").trim().slice(0, 80);
    if (!label) continue;
    const valueKey = categorySlug(typeof item === "string" ? label : item?.value || label);
    if (seen.has(valueKey)) continue;
    seen.add(valueKey);
    options.push({ value: valueKey, label });
  }
  return options.length ? options : DEFAULT_PROJECT_CATEGORY_OPTIONS;
}

function normalizeCategory(value) {
  return categorySlug(value);
}

const GLOBAL_CATEGORY_OPTIONS = new Set([
  "business_commerce",
  "technology_engineering",
  "science_research",
  "human_social_science",
  "media_communication",
  "law"
]);

function normalizeGlobalCategory(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/&/g, "and");
  const key = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    business_and_commerce: "business_commerce",
    business_commerce: "business_commerce",
    technology_and_engineering: "technology_engineering",
    technology_engineering: "technology_engineering",
    science_and_research: "science_research",
    science_research: "science_research",
    human_and_social_science: "human_social_science",
    human_social_science: "human_social_science",
    media_and_communication: "media_communication",
    media_communication: "media_communication",
    law: "law",
    legal: "law",
    law_and_legal: "law"
  };
  const normalized = aliases[key] || key;
  return GLOBAL_CATEGORY_OPTIONS.has(normalized) ? normalized : "";
}


function categoryImageDisplayUrl(record, { publicIdField = "image_public_id", urlField = "image_url", mimeTypeField = "mime_type" } = {}) {
  const key = String(record?.[publicIdField] || "").trim();
  if (key) {
    try {
      return createPresignedS3GetUrl({
        key,
        expiresSeconds: 3600,
        responseContentType: record?.[mimeTypeField] || "image/png",
        responseContentDisposition: "inline"
      });
    } catch {
      return record?.[urlField] || "";
    }
  }
  return record?.[urlField] || "";
}

function categoryIconDisplayUrl(icon) {
  return categoryImageDisplayUrl(icon);
}

function categoryBackgroundDisplayUrl(icon) {
  return categoryImageDisplayUrl(icon, {
    publicIdField: "background_image_public_id",
    urlField: "background_image_url",
    mimeTypeField: "background_mime_type"
  });
}

function serializeCategoryIcon(icon = {}) {
  return {
    global_category: icon.global_category || "",
    image_url: categoryIconDisplayUrl(icon),
    image_public_id: icon.image_public_id || "",
    original_filename: icon.original_filename || "",
    mime_type: icon.mime_type || "",
    file_size_bytes: Number(icon.file_size_bytes) || 0,
    background_image_url: categoryBackgroundDisplayUrl(icon),
    background_image_public_id: icon.background_image_public_id || "",
    background_original_filename: icon.background_original_filename || "",
    background_mime_type: icon.background_mime_type || "",
    background_file_size_bytes: Number(icon.background_file_size_bytes) || 0,
    updated_at: icon.updated_at || null
  };
}

async function uploadCategoryIcon({ category, file }) {
  const ext = path.extname(String(file.filename || "")).toLowerCase() || ".png";
  const id = crypto.randomBytes(10).toString("hex");
  const publicId = `${category}_${id}${ext}`;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: publicId,
    folder: `internlabs/category-icons/${category}`,
    contentType: file.contentType || "application/octet-stream",
    publicId
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    originalFilename: String(file.filename || publicId).slice(0, 255),
    mimeType: String(file.contentType || "application/octet-stream").slice(0, 120),
    size: Number(file.size || file.buffer?.length || 0)
  };
}

async function uploadCategoryBackground({ category, file }) {
  const ext = path.extname(String(file.filename || "")).toLowerCase() || ".png";
  const id = crypto.randomBytes(10).toString("hex");
  const publicId = `${category}_background_${id}${ext}`;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: publicId,
    folder: `internlabs/category-backgrounds/${category}`,
    contentType: file.contentType || "application/octet-stream",
    publicId
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    originalFilename: String(file.filename || publicId).slice(0, 255),
    mimeType: String(file.contentType || "application/octet-stream").slice(0, 120),
    size: Number(file.size || file.buffer?.length || 0)
  };
}
function normalizeTimelineWeeks(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.round(n));
}

function normalizeProjectCoins(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
}

function ensureAiUsageSchema() {
  if (!aiUsageSchemaReady) {
    aiUsageSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_events (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        provider VARCHAR(40) NOT NULL,
        model VARCHAR(160) NOT NULL,
        feature VARCHAR(80) NOT NULL,
        route VARCHAR(160) NOT NULL DEFAULT '',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
        CONSTRAINT chk_ai_usage_events_prompt_tokens CHECK (prompt_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_completion_tokens CHECK (completion_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_total_tokens CHECK (total_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_input_tokens CHECK (input_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_output_tokens CHECK (output_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_cached_tokens CHECK (cached_tokens >= 0),
        CONSTRAINT chk_ai_usage_events_billable_units CHECK (billable_units >= 0)
      );
      CREATE INDEX IF NOT EXISTS ix_ai_usage_events_created_at ON ai_usage_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_ai_usage_events_provider_model ON ai_usage_events(provider, model);
      CREATE INDEX IF NOT EXISTS ix_ai_usage_events_feature_created ON ai_usage_events(feature, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_created ON ai_usage_events(user_id, created_at DESC);
    `);
  }
  return aiUsageSchemaReady;
}

function parseCsvText(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item || "").trim()));
}

function normalizeCsvHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csvRowsToObjects(text) {
  const parsed = parseCsvText(text);
  if (!parsed.length) return [];
  const headers = parsed[0].map(normalizeCsvHeader);
  return parsed.slice(1).map((values, index) => {
    const row = { __rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      row[header] = String(values[columnIndex] ?? "").trim();
    });
    return row;
  });
}

function pickCsvValue(row, keys = []) {
  for (const key of keys) {
    const value = row[normalizeCsvHeader(key)];
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function parsePositiveCsvInteger(value, fallback = null) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}
function parsePositiveCsvIntegerList(value) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  const parts = text.split(/[;,|]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map((part) => parsePositiveCsvInteger(part, null));
  if (values.some((id) => !id)) return null;
  return [...new Set(values)];
}

function normalizeDemoDocumentIds(stage = {}) {
  const values = Array.isArray(stage.demo_document_ids) ? [...stage.demo_document_ids] : [];
  if (stage.demo_document_id) values.push(stage.demo_document_id);
  return [...new Set(values.map(Number).filter((id) => Number.isFinite(id) && id > 0).map((id) => Math.round(id)))];
}
function formatStageField(label, value) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const lines = text.split("\n");
  return [`${label}: ${lines[0] || ""}`, ...lines.slice(1).map((line) => `  ${line}`)].join("\n");
}
function buildImportedStepContext({ phase, stages }) {
  const min = normalizeDurationValue(phase.duration_value);
  const max = normalizeDurationMaxValue(min, phase.duration_max_value);
  const unit = normalizeDurationUnit(phase.duration_unit);
  const pluralUnit = `${unit}${max === 1 ? "" : "s"}`;
  const stageBlocks = stages
    .map((stage, index) => {
      const demoDocumentIds = normalizeDemoDocumentIds(stage);
      const lines = [
        `${index + 1}. ${stage.title || "Stage"}`,
        stage.agent_key ? `Agent: ${stage.agent_key}` : "",
        stage.context ? `Context: ${stage.context}` : "",
        stage.objective ? `Objective: ${stage.objective}` : "",
        stage.deliverable ? `Deliverable: ${stage.deliverable}` : "",
        stage.document_required ? "Document Required: Yes" : "",
        stage.link_submission_required ? "Link Submission Required: Yes" : "",
        stage.github_integration_required ? "GitHub Integration Required: Yes" : "",
        ...demoDocumentIds.map((id) => `Demo Document ID: ${id}`)
      ];
      return lines.filter(Boolean).join("\n");
    })
    .filter(Boolean);
  return [`Duration: ${min}-${max} ${pluralUnit}`, phase.context, "Stages:", stageBlocks.join("\n\n")]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeDraftDurationValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.round(n)));
}

function limitString(value, maxLength = 10000) {
  return String(value || "").slice(0, maxLength);
}

function normalizeStoredStages(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  return list
    .slice(0, 50)
    .map((stage) => ({
      title: String(stage?.title || "").trim().slice(0, 240),
      agent_key: normalizeAgentKey(stage?.agent_key || "pm_agent"),
      stage_context: String(stage?.stage_context || "").trim().slice(0, 12000),
      objective: String(stage?.objective || "").trim().slice(0, 4000),
      deliverable: String(stage?.deliverable || "").trim().slice(0, 4000),
      document_required: Boolean(stage?.document_required),
      link_submission_required: Boolean(stage?.link_submission_required),
      github_integration_required: Boolean(stage?.github_integration_required),
      demo_document_id: normalizeDemoDocumentIds(stage)[0] || null,
      demo_document_ids: normalizeDemoDocumentIds(stage)
    }))
    .filter((stage) => stage.title || stage.stage_context || stage.objective || stage.deliverable);
}
function normalizeDraftStage(stage = {}) {
  return {
    title: limitString(stage.title, 240),
    agent_key: limitString(stage.agent_key || "pm_agent", 60) || "pm_agent",
    stage_context: limitString(stage.stage_context, 12000),
    objective: limitString(stage.objective, 4000),
    deliverable: limitString(stage.deliverable, 4000),
    document_required: Boolean(stage.document_required),
    link_submission_required: Boolean(stage.link_submission_required),
    github_integration_required: Boolean(stage.github_integration_required),
    demo_document_id: normalizeDemoDocumentIds(stage)[0] || null,
    demo_document_ids: normalizeDemoDocumentIds(stage)
  };
}

function normalizeDraftStep(step = {}) {
  const stages = Array.isArray(step.stages) ? step.stages.slice(0, 50).map(normalizeDraftStage) : [];
  return {
    client_id: limitString(step.client_id, 120),
    title: limitString(step.title, 240),
    phase_context: limitString(step.phase_context, 12000),
    duration_value: normalizeDraftDurationValue(step.duration_value),
    duration_max_value: Math.max(
      normalizeDraftDurationValue(step.duration_value),
      normalizeDraftDurationValue(step.duration_max_value || step.duration_value)
    ),
    duration_unit: String(step.duration_unit || "week").toLowerCase().startsWith("day") ? "day" : "week",
    stages
  };
}

function normalizeProjectDraftPayload(input = {}) {
  const steps = Array.isArray(input.steps) ? input.steps.slice(0, 100).map(normalizeDraftStep) : [];
  return {
    title: limitString(input.title, 240),
    description: limitString(input.description, 20000),
    timelineWeeks: normalizeTimelineWeeks(input.timelineWeeks),
    projectCoins: normalizeProjectCoins(input.projectCoins),
    category: normalizeCategory(input.category),
    complexity: normalizeProjectTextField(input.complexity, 40),
    keywords: normalizeProjectTextField(input.keywords),
    skillsRequired: normalizeProjectTextField(input.skillsRequired),
    skillsGained: normalizeProjectTextField(input.skillsGained),
    targetBranch: normalizeProjectTextField(input.targetBranch),
    targetYear: normalizeProjectTextField(input.targetYear),
    techStack: normalizeProjectTextField(input.techStack),
    shortSummary: normalizeProjectTextField(input.shortSummary, 4000),
    domain: normalizeProjectTextField(input.domain, 80),
    prerequisites: normalizeProjectTextField(input.prerequisites),
    learningOutcomes: normalizeProjectTextField(input.learningOutcomes),
    difficultyScore: normalizeDifficultyScore(input.difficultyScore),
    isDemoProject: normalizeBoolean(input.isDemoProject, false),
    steps,
    introductionDocument: limitString(input.introductionDocument, 20000),
    introductionDocumentUrl: limitString(input.introductionDocumentUrl, 1000),
    privateBrdDocument: limitString(input.privateBrdDocument, 20000),
    privateBrdDocumentUrl: limitString(input.privateBrdDocumentUrl, 1000),
    solutionDocument: limitString(input.solutionDocument, 20000),
    solutionDocumentUrl: limitString(input.solutionDocumentUrl, 1000),
    companyProfileText: limitString(input.companyProfileText, 20000),
    saved_at: new Date().toISOString()
  };
}

function normalizeProjectTextField(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeDifficultyScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function normalizeDurationValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.round(n)));
}

function normalizeDurationMaxValue(minValue, maxValue) {
  const min = normalizeDurationValue(minValue);
  const max = normalizeDurationValue(maxValue);
  return Math.max(min, max);
}

function normalizeDurationUnit(value) {
  const unit = String(value || "week").trim().toLowerCase();
  return unit.startsWith("day") ? "day" : "week";
}


function durationToDays(value, unit) {
  const duration = normalizeDurationValue(value);
  return normalizeDurationUnit(unit) === "day" ? duration : duration * 7;
}

function formatDurationDays(days) {
  const totalDays = Math.max(0, Math.round(Number(days) || 0));
  if (totalDays > 0 && totalDays % 7 === 0) {
    const weeks = totalDays / 7;
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  return `${totalDays} day${totalDays === 1 ? "" : "s"}`;
}

function validateProjectTimelineDuration({ timelineWeeks, steps, label = "Project" }) {
  const allowedDays = normalizeTimelineWeeks(timelineWeeks) * 7;
  const totalDays = (steps || []).reduce(
    (sum, step) => sum + durationToDays(step.duration_max_value ?? step.duration_value, step.duration_unit),
    0
  );
  if (totalDays <= allowedDays) return null;
  return `${label} phase durations total ${formatDurationDays(totalDays)}, which exceeds the project timeline of ${formatDurationDays(allowedDays)}.`;
}

function normalizeStepTitle(value) {
  const t = String(value || "").trim();
  if (!t) return "";
  return t.slice(0, 140);
}

function normalizeProjectTitle(value) {
  return String(value || "").trim().slice(0, 160);
}

function normalizeProjectDescription(value) {
  return String(value || "").trim();
}

function normalizeAgentKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "pm_agent";
  return raw.slice(0, 60);
}

function normalizeDocument(value) {
  return String(value || "").trim();
}

function normalizeDocumentUrl(value) {
  return String(value || "").trim().slice(0, 1000);
}

function normalizeCompanyName(value) {
  return String(value || "").trim().slice(0, 160);
}

function normalizeCompanySlug(value, fallback = "") {
  const raw = String(value || fallback || "").trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return slug || `company-${Date.now()}`;
}

function normalizeCompanyIndustry(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeCompanyDescription(value) {
  return String(value || "").trim();
}

function normalizeProjectDocumentType(value) {
  const raw = String(value || "general").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return (raw || "general").slice(0, 60);
}

function normalizeProjectDocumentSourceType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (["upload", "url", "legacy_text", "manual"].includes(type)) return type;
  return "";
}

function normalizeProjectDocumentStatus(value) {
  const status = String(value || "uploaded").trim().toLowerCase();
  return ["uploaded", "processing", "indexed", "failed", "archived"].includes(status) ? status : "uploaded";
}

function normalizeProjectDocumentScope(value) {
  const scope = String(value || "project").trim().toLowerCase();
  return scope === "company" ? "company" : "project";
}

function normalizeAgentDocumentAccessLevel(value) {
  const level = String(value || "read").trim().toLowerCase();
  return ["read", "review", "hidden_review"].includes(level) ? level : "read";
}

function normalizeProjectDocumentTitle(value, fallback = "Project document") {
  const title = String(value || fallback || "").trim().slice(0, 240);
  return title || "Project document";
}

function buildProjectDocumentContentHash({ file, storageUrl = "", rawText = "" }) {
  const hash = crypto.createHash("sha256");
  if (file?.buffer?.length) {
    hash.update("upload:");
    hash.update(file.buffer);
  } else if (String(storageUrl || "").trim()) {
    hash.update("url:");
    hash.update(String(storageUrl || "").trim());
  } else if (String(rawText || "").trim()) {
    hash.update("raw:");
    hash.update(String(rawText || "").trim());
  } else {
    return "";
  }
  return hash.digest("hex");
}

function s3KeyFromUrl(urlValue) {
  try {
    const parsed = new URL(String(urlValue || ""));
    const expectedHost = `${config.s3.bucketName}.s3.${config.s3.region}.amazonaws.com`;
    if (parsed.hostname.toLowerCase() !== expectedHost.toLowerCase()) return "";
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

function mimeTypeFromFilename(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
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

function buildInlinePreviewUrl({ documentUrl, documentName }) {
  const key = s3KeyFromUrl(documentUrl);
  if (!key) return String(documentUrl || "").trim();

  const filename = String(documentName || path.basename(key) || "document")
    .trim()
    .replace(/"/g, "");
  return createPresignedS3GetUrl({
    key,
    expiresSeconds: 600,
    responseContentDisposition: `inline; filename="${filename || "document"}"`,
    responseContentType: mimeTypeFromFilename(filename),
  });
}

async function runProjectDocumentIndexer(documentId) {
  const scriptPath = path.resolve(process.cwd(), "../scripts/index_project_documents.py");
  const { stdout, stderr } = await execFileAsync(
    config.pythonExecutable || "python",
    [scriptPath, String(documentId)],
    {
      cwd: path.resolve(process.cwd(), ".."),
      timeout: 120000,
      windowsHide: true
    }
  );
  return { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() };
}

async function runGlobalDocumentIndexer(documentId) {
  const scriptPath = path.resolve(process.cwd(), "../scripts/index_project_documents.py");
  const { stdout, stderr } = await execFileAsync(
    config.pythonExecutable || "python",
    [scriptPath, "--global", String(documentId)],
    {
      cwd: path.resolve(process.cwd(), ".."),
      timeout: 120000,
      windowsHide: true
    }
  );
  return { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() };
}

function scheduleProjectDocumentAutoIndex(documentId) {
  if (!config.autoIndexProjectDocuments || !Number.isFinite(Number(documentId))) {
    return;
  }

  setImmediate(async () => {
    try {
      const existing = await pool.query(
        "SELECT id, is_active, status FROM project_documents WHERE id = $1 LIMIT 1",
        [documentId]
      );
      if (!existing.rowCount || !existing.rows[0].is_active) return;
      if (String(existing.rows[0].status || "").toLowerCase() === "indexed") return;

      await pool.query(
        `UPDATE project_documents
         SET status = 'processing',
             indexing_error = '',
             ingestion_attempted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND is_active = TRUE`,
        [documentId]
      );

      await runProjectDocumentIndexer(documentId);
    } catch (error) {
      try {
        await pool.query(
          `UPDATE project_documents
           SET status = 'failed',
               indexing_error = $2,
               ingestion_attempted_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [documentId, String(error?.message || "Auto indexing failed.").slice(0, 2000)]
        );
      } catch {
        // Keep the background job isolated from request handling.
      }
      console.error("project_document:auto_index_failed", {
        documentId,
        message: error?.message || String(error)
      });
    }
  });
}

function scheduleGlobalDocumentAutoIndex(documentId) {
  if (!config.autoIndexProjectDocuments || !Number.isFinite(Number(documentId))) {
    return;
  }

  setImmediate(async () => {
    try {
      const existing = await pool.query(
        "SELECT id, is_active, status FROM global_documents WHERE id = $1 LIMIT 1",
        [documentId]
      );
      if (!existing.rowCount || !existing.rows[0].is_active) return;
      if (String(existing.rows[0].status || "").toLowerCase() === "indexed") return;

      await pool.query(
        `UPDATE global_documents
         SET status = 'processing',
             indexing_error = '',
             ingestion_attempted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND is_active = TRUE`,
        [documentId]
      );

      await runGlobalDocumentIndexer(documentId);
    } catch (error) {
      try {
        await pool.query(
          `UPDATE global_documents
           SET status = 'failed',
               indexing_error = $2,
               ingestion_attempted_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [documentId, String(error?.message || "Auto indexing failed.").slice(0, 2000)]
        );
      } catch {
        // Keep the background job isolated from request handling.
      }
      console.error("global_document:auto_index_failed", {
        documentId,
        message: error?.message || String(error)
      });
    }
  });
}

async function getDefaultCompanyId(client = pool) {
  const { rows } = await client.query(
    `INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
     VALUES ('InternzBee Default', 'internzbee-default', '', 'Default company for existing projects.', TRUE, NOW(), NOW())
     ON CONFLICT (slug) DO UPDATE SET updated_at = companies.updated_at
     RETURNING id`
  );
  return rows[0]?.id;
}

function normalizeMentorName(value) {
  return String(value || "").trim().slice(0, 100);
}

function normalizeMentorRole(value) {
  return String(value || "").trim();
}

function normalizeMentorText(value) {
  return String(value || "").trim();
}

function normalizeAdminEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 255);
}

function hashAdminPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), String(salt || ""), 64).toString("hex");
}

function verifyAdminPassword(password, passwordHash, passwordSalt) {
  const expectedHash = String(passwordHash || "");
  const salt = String(passwordSalt || "");
  if (!expectedHash || !salt || !password) return false;
  const computedHash = hashAdminPassword(password, salt);
  const expectedBuf = Buffer.from(expectedHash, "hex");
  const computedBuf = Buffer.from(computedHash, "hex");
  if (!expectedBuf.length || expectedBuf.length !== computedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, computedBuf);
}

function normalizeMentorAgentKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return (key || "arjun").slice(0, 50);
}

function normalizeMentorOutputFormat(value) {
  const format = String(value || "markdown").trim().toLowerCase();
  return ["markdown", "plain_text", "json"].includes(format) ? format : "markdown";
}

function normalizeTestimonialType(value) {
  const type = String(value || "text").trim().toLowerCase();
  return type === "video" ? "video" : "text";
}

function normalizeTestimonialShortText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function normalizeTestimonialText(value) {
  return String(value || "").trim();
}

function normalizeDisplayOrder(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

function mentorBackendKey(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  if (["priya", "qa", "qa_agent", "neha"].includes(key)) return "qa";
  if (["meera", "architect", "architect_agent", "team_lead_agent"].includes(key)) return "architect";
  if (["rohan", "tech_lead", "engineer", "engineer_agent", "dev_agent", "marketing_lead_agent", "customer_experience_agent"].includes(key)) return "tech_lead";
  if (["arjun", "pm", "pm_agent", "business_analyst_agent"].includes(key)) return "pm";
  return "pm";
}

async function uploadMentorAvatar({ mentorId = "new", file }) {
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: "internlabs/mentors",
    contentType: file.contentType || "application/octet-stream",
    publicId: `mentor_${mentorId}_${Date.now()}`
  });
  return { url: uploaded.url, publicId: uploaded.public_id };
}

function normalizeYouTubeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const isYouTube =
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be" ||
    hostname === "youtube-nocookie.com";
  if (!isYouTube || !["http:", "https:"].includes(url.protocol)) return "";
  url.protocol = "https:";
  return url.toString();
}

async function uploadRecommendationProjectFile({ file }) {
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: "internlabs/recommendations",
    contentType: file.contentType || "application/octet-stream",
    publicId: `recommendation_projects_${Date.now()}`
  });
  return { url: uploaded.url, publicId: uploaded.public_id, name: String(file.filename || "").trim().slice(0, 255) };
}

async function uploadProjectDocumentFile({ companyId, projectId, documentId, scope = "project", file }) {
  const folder = scope === "company"
    ? `companies/${companyId}/documents/${documentId}`
    : `companies/${companyId}/projects/${projectId}/documents/${documentId}`;
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder,
    contentType: file.contentType || "application/octet-stream"
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    name: String(file.filename || "").trim().slice(0, 255)
  };
}

async function uploadGlobalDocumentFile({ category, documentId, file }) {
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: `global-documents/${category}/${documentId}`,
    contentType: file.contentType || "application/octet-stream"
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    name: String(file.filename || "").trim().slice(0, 255)
  };
}

async function uploadDemoDocumentFile({ documentId = "new", file }) {
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: "internlabs/demo-documents",
    contentType: file.contentType || "application/octet-stream",
    publicId: `demo_document_${documentId}_${Date.now()}`
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    name: String(file.filename || "").trim().slice(0, 255)
  };
}

async function uploadHomepageCertificateImage({ certificateId = "new", file }) {
  const uploaded = await uploadToS3({
    buffer: file.buffer,
    filename: file.filename,
    folder: "internlabs/home-certificates",
    contentType: file.contentType || "application/octet-stream",
    publicId: `home_certificate_${certificateId}_${Date.now()}`
  });
  return {
    url: uploaded.url,
    publicId: uploaded.public_id,
    name: String(file.filename || "certificate").trim().slice(0, 255),
    mimeType: String(file.contentType || "").trim().slice(0, 120),
    size: Number(file.buffer?.length || 0)
  };
}

function clearPublicTestimonialsCache() {
  publicTestimonialsCache = { expiresAt: 0, payload: null };
}

function clearPublicHomeCertificatesCache() {
  publicHomeCertificatesCache = { expiresAt: 0, payload: null };
}

function mapTestimonial(row) {
  return {
    id: row.id,
    testimonial_type: row.testimonial_type,
    name: row.name,
    role: row.role,
    description: row.description,
    text_content: row.text_content,
    video_url: row.video_url,
    video_public_id: row.video_public_id,
    display_order: row.display_order,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapHomeCertificate(row) {
  const imageKey = String(row.image_public_id || "").trim();
  const version = row.updated_at ? `?v=${encodeURIComponent(new Date(row.updated_at).getTime())}` : "";
  const imageUrl = imageKey && row.id
    ? `/api/admin/home-certificates/${row.id}/image${version}`
    : row.image_url || "";
  return {
    id: row.id,
    title: row.title || "",
    image_url: imageUrl,
    image_public_id: row.image_public_id || "",
    original_filename: row.original_filename || "",
    mime_type: row.mime_type || "",
    file_size_bytes: Number(row.file_size_bytes) || 0,
    display_order: Number(row.display_order) || 0,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function readParsedMultipart(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("multipart/form-data")) {
    const error = new Error("multipart/form-data request required.");
    error.statusCode = 400;
    throw error;
  }
  try {
    return parseMultipartFormData({ contentType, bodyBuffer: req.body });
  } catch {
    const error = new Error("Invalid multipart form data.");
    error.statusCode = 400;
    throw error;
  }
}

router.get(
  "/admin/home-certificates/:id/image",
  asyncHandler(async (req, res) => {
    await ensureHomepageCertificateSchema();
    const certificateId = Number(req.params.id);
    if (!Number.isFinite(certificateId)) return res.status(400).json({ detail: "Invalid certificate id." });

    const { rows } = await pool.query(
      `SELECT id, image_url, image_public_id, mime_type, original_filename, updated_at
       FROM homepage_certificates
       WHERE id = $1
       LIMIT 1`,
      [certificateId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Homepage certificate not found." });

    const certificate = rows[0];
    const imageKey = String(certificate.image_public_id || "").trim();
    if (!imageKey) {
      const fallbackUrl = String(certificate.image_url || "").trim();
      if (fallbackUrl) return res.redirect(fallbackUrl);
      return res.status(404).json({ detail: "Certificate image is not available." });
    }

    try {
      const object = await fetchS3Object({ key: imageKey });
      res.setHeader("Content-Type", certificate.mime_type || object.contentType || "image/png");
      res.setHeader("Content-Length", String(object.contentLength || object.body.length));
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      res.setHeader("Content-Disposition", `inline; filename="${String(certificate.original_filename || "certificate.png").replace(/["\\]/g, "_")}"`);
      return res.send(object.body);
    } catch (error) {
      const fallbackUrl = String(certificate.image_url || "").trim();
      if (fallbackUrl) return res.redirect(fallbackUrl);
      const statusCode = Number(error?.statusCode) || 502;
      return res.status(statusCode).json({ detail: error?.detail || error?.message || "Certificate image is unavailable." });
    }
  })
);
router.get(
  "/admin/home-certificates/public",
  asyncHandler(async (_req, res) => {
    await ensureHomepageCertificateSchema();
    const now = Date.now();
    if (publicHomeCertificatesCache.payload && publicHomeCertificatesCache.expiresAt > now) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return res.json(publicHomeCertificatesCache.payload);
    }

    const { rows } = await pool.query(
      `SELECT id, title, image_url, image_public_id, original_filename, mime_type, file_size_bytes,
              display_order, is_active, created_at, updated_at
       FROM homepage_certificates
       WHERE is_active = TRUE
         AND image_url <> ''
       ORDER BY display_order ASC, id DESC
       LIMIT 16`
    );
    const payload = { certificates: rows.map(mapHomeCertificate) };
    publicHomeCertificatesCache = { expiresAt: now + 60_000, payload };
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    return res.json(payload);
  })
);

router.get(
  "/admin/home-certificates",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureHomepageCertificateSchema();

    const { rows } = await pool.query(
      `SELECT id, title, image_url, image_public_id, original_filename, mime_type, file_size_bytes,
              display_order, is_active, created_at, updated_at
       FROM homepage_certificates
       ORDER BY display_order ASC, id DESC
       LIMIT 200`
    );
    return res.json({ certificates: rows.map(mapHomeCertificate) });
  })
);

router.post(
  "/admin/home-certificates",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureHomepageCertificateSchema();

    const parsed = await readParsedMultipart(req);
    const fields = parsed.fields || {};
    const file = parsed.files?.image || parsed.files?.certificate;
    if (!file?.buffer?.length) return res.status(400).json({ detail: "Certificate image is required." });
    const mimeType = String(file.contentType || "").toLowerCase();
    if (mimeType && !["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
      return res.status(400).json({ detail: "Upload a PNG, JPG, or WEBP certificate image." });
    }

    const title = normalizeTestimonialShortText(fields.title || file.filename || "Demo Certificate", 180) || "Demo Certificate";
    const displayOrder = normalizeDisplayOrder(fields.display_order);
    const isActive = String(fields.is_active || "true") !== "false";
    const uploaded = await uploadHomepageCertificateImage({ file });

    const { rows } = await pool.query(
      `INSERT INTO homepage_certificates
        (title, image_url, image_public_id, original_filename, mime_type, file_size_bytes,
         display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, image_url, image_public_id, original_filename, mime_type, file_size_bytes,
                 display_order, is_active, created_at, updated_at`,
      [title, uploaded.url, uploaded.publicId, uploaded.name, uploaded.mimeType, uploaded.size, displayOrder, isActive]
    );

    clearPublicHomeCertificatesCache();
    return res.status(201).json({ message: "Homepage certificate created.", certificate: mapHomeCertificate(rows[0]) });
  })
);

router.put(
  "/admin/home-certificates/:id",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureHomepageCertificateSchema();

    const certificateId = Number(req.params.id);
    if (!Number.isFinite(certificateId)) return res.status(400).json({ detail: "Invalid certificate id." });

    const existing = await pool.query(
      `SELECT id, image_url, image_public_id, original_filename, mime_type, file_size_bytes
       FROM homepage_certificates
       WHERE id = $1
       LIMIT 1`,
      [certificateId]
    );
    if (!existing.rows.length) return res.status(404).json({ detail: "Homepage certificate not found." });

    const parsed = await readParsedMultipart(req);
    const fields = parsed.fields || {};
    const file = parsed.files?.image || parsed.files?.certificate;
    if (file?.buffer?.length) {
      const mimeType = String(file.contentType || "").toLowerCase();
      if (mimeType && !["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
        return res.status(400).json({ detail: "Upload a PNG, JPG, or WEBP certificate image." });
      }
    }

    const current = existing.rows[0];
    const uploaded = file?.buffer?.length
      ? await uploadHomepageCertificateImage({ certificateId, file })
      : {
          url: current.image_url || "",
          publicId: current.image_public_id || "",
          name: current.original_filename || "",
          mimeType: current.mime_type || "",
          size: Number(current.file_size_bytes) || 0
        };
    const title = normalizeTestimonialShortText(fields.title || uploaded.name || "Demo Certificate", 180) || "Demo Certificate";
    const displayOrder = normalizeDisplayOrder(fields.display_order);
    const isActive = String(fields.is_active || "true") !== "false";

    const { rows } = await pool.query(
      `UPDATE homepage_certificates
       SET title = $2,
           image_url = $3,
           image_public_id = $4,
           original_filename = $5,
           mime_type = $6,
           file_size_bytes = $7,
           display_order = $8,
           is_active = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, image_url, image_public_id, original_filename, mime_type, file_size_bytes,
                 display_order, is_active, created_at, updated_at`,
      [certificateId, title, uploaded.url, uploaded.publicId, uploaded.name, uploaded.mimeType, uploaded.size, displayOrder, isActive]
    );

    clearPublicHomeCertificatesCache();
    return res.json({ message: "Homepage certificate updated.", certificate: mapHomeCertificate(rows[0]) });
  })
);

router.delete(
  "/admin/home-certificates/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureHomepageCertificateSchema();

    const certificateId = Number(req.params.id);
    if (!Number.isFinite(certificateId)) return res.status(400).json({ detail: "Invalid certificate id." });

    const deleted = await pool.query("DELETE FROM homepage_certificates WHERE id = $1 RETURNING id", [certificateId]);
    if (!deleted.rowCount) return res.status(404).json({ detail: "Homepage certificate not found." });
    clearPublicHomeCertificatesCache();
    return res.json({ message: "Homepage certificate deleted." });
  })
);

router.get(
  "/admin/testimonials/public",
  asyncHandler(async (_req, res) => {
    await ensureTestimonialSchema();
    const now = Date.now();
    if (publicTestimonialsCache.payload && publicTestimonialsCache.expiresAt > now) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return res.json(publicTestimonialsCache.payload);
    }

    const { rows } = await pool.query(
      `SELECT id, testimonial_type, name, role, description, text_content, video_url, video_public_id,
              display_order, is_active, created_at, updated_at
       FROM testimonials
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id DESC
       LIMIT 12`
    );
    const payload = { testimonials: rows.map(mapTestimonial) };
    publicTestimonialsCache = { expiresAt: now + 60_000, payload };
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    return res.json(payload);
  })
);

router.get(
  "/admin/testimonials",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureTestimonialSchema();

    const { rows } = await pool.query(
      `SELECT id, testimonial_type, name, role, description, text_content, video_url, video_public_id,
              display_order, is_active, created_at, updated_at
       FROM testimonials
       ORDER BY display_order ASC, id DESC
       LIMIT 200`
    );
    return res.json({ testimonials: rows.map(mapTestimonial) });
  })
);

router.post(
  "/admin/testimonials",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "120mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureTestimonialSchema();

    const parsed = await readParsedMultipart(req);
    const fields = parsed.fields || {};
    const testimonialType = normalizeTestimonialType(fields.testimonial_type || fields.type);
    const name = normalizeTestimonialShortText(fields.name);
    const role = normalizeTestimonialShortText(fields.role);
    const description = normalizeTestimonialText(fields.description);
    const textContent = normalizeTestimonialText(fields.text_content || fields.text);
    const submittedVideoUrl = normalizeYouTubeUrl(fields.video_url || fields.video_link || fields.youtube_url);
    const displayOrder = normalizeDisplayOrder(fields.display_order);
    const isActive = String(fields.is_active || "true") !== "false";

    if (!name) return res.status(400).json({ detail: "Name is required." });
    if (!role) return res.status(400).json({ detail: "Role is required." });
    if (testimonialType === "text" && !textContent) return res.status(400).json({ detail: "Text testimonial is required." });
    if (testimonialType === "video" && !submittedVideoUrl) return res.status(400).json({ detail: "A valid YouTube video link is required." });

    const videoUrl = testimonialType === "video" ? submittedVideoUrl : "";
    const videoPublicId = "";

    const { rows } = await pool.query(
      `INSERT INTO testimonials
        (testimonial_type, name, role, description, text_content, video_url, video_public_id, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, testimonial_type, name, role, description, text_content, video_url, video_public_id,
                 display_order, is_active, created_at, updated_at`,
      [
        testimonialType,
        name,
        role,
        description,
        testimonialType === "text" ? textContent : "",
        videoUrl,
        videoPublicId,
        displayOrder,
        isActive
      ]
    );

    clearPublicTestimonialsCache();
    return res.status(201).json({ message: "Testimonial created.", testimonial: mapTestimonial(rows[0]) });
  })
);

router.put(
  "/admin/testimonials/:id",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "120mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureTestimonialSchema();

    const testimonialId = Number(req.params.id);
    if (!Number.isFinite(testimonialId)) return res.status(400).json({ detail: "Invalid testimonial id." });

    const { rows: existingRows } = await pool.query(
      "SELECT id, video_url, video_public_id FROM testimonials WHERE id = $1 LIMIT 1",
      [testimonialId]
    );
    if (!existingRows.length) return res.status(404).json({ detail: "Testimonial not found." });
    const existing = existingRows[0];

    const parsed = await readParsedMultipart(req);
    const fields = parsed.fields || {};
    const testimonialType = normalizeTestimonialType(fields.testimonial_type || fields.type);
    const name = normalizeTestimonialShortText(fields.name);
    const role = normalizeTestimonialShortText(fields.role);
    const description = normalizeTestimonialText(fields.description);
    const textContent = normalizeTestimonialText(fields.text_content || fields.text);
    const submittedVideoUrl = normalizeYouTubeUrl(fields.video_url || fields.video_link || fields.youtube_url);
    const displayOrder = normalizeDisplayOrder(fields.display_order);
    const isActive = String(fields.is_active || "true") !== "false";

    if (!name) return res.status(400).json({ detail: "Name is required." });
    if (!role) return res.status(400).json({ detail: "Role is required." });
    if (testimonialType === "text" && !textContent) return res.status(400).json({ detail: "Text testimonial is required." });

    let videoUrl = testimonialType === "video" ? existing.video_url || "" : "";
    const videoPublicId = "";
    if (testimonialType === "video" && submittedVideoUrl) videoUrl = submittedVideoUrl;
    if (testimonialType === "video" && !videoUrl) return res.status(400).json({ detail: "A valid YouTube video link is required." });

    const { rows } = await pool.query(
      `UPDATE testimonials
       SET testimonial_type = $2,
           name = $3,
           role = $4,
           description = $5,
           text_content = $6,
           video_url = $7,
           video_public_id = $8,
           display_order = $9,
           is_active = $10,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, testimonial_type, name, role, description, text_content, video_url, video_public_id,
                 display_order, is_active, created_at, updated_at`,
      [
        testimonialId,
        testimonialType,
        name,
        role,
        description,
        testimonialType === "text" ? textContent : "",
        videoUrl,
        videoPublicId,
        displayOrder,
        isActive
      ]
    );

    clearPublicTestimonialsCache();
    return res.json({ message: "Testimonial updated.", testimonial: mapTestimonial(rows[0]) });
  })
);

router.delete(
  "/admin/testimonials/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureTestimonialSchema();

    const testimonialId = Number(req.params.id);
    if (!Number.isFinite(testimonialId)) return res.status(400).json({ detail: "Invalid testimonial id." });

    const deleted = await pool.query("DELETE FROM testimonials WHERE id = $1 RETURNING id", [testimonialId]);
    if (!deleted.rowCount) return res.status(404).json({ detail: "Testimonial not found." });
    clearPublicTestimonialsCache();
    return res.json({ message: "Testimonial deleted." });
  })
);

router.get(
  "/admin/certificate-requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCertificateRequestSchema();
    const { rows } = await pool.query(
      `SELECT cr.id, cr.user_id, cr.project_name, cr.experience_text,
              cr.overall_rating, cr.mentor_rating, cr.project_clarity_rating, cr.support_rating, cr.recommend_rating,
              cr.feedback_answers, cr.video_url, cr.video_public_id,
              cr.certificate_url, cr.certificate_public_id, cr.certificate_original_filename, cr.certificate_mime_type,
              cr.status, cr.certificate_issued_at, cr.certificate_emailed_at,
              cr.created_at, cr.updated_at, u.public_id AS user_public_id, u.name AS user_name, u.email AS user_email
       FROM certificate_requests cr
       JOIN users u ON u.id = cr.user_id
       ORDER BY cr.created_at DESC, cr.id DESC`
    );
    return res.json({
      requests: rows.map((row) => ({
        ...row,
        video_url: signedVideoUrl(row),
        certificate_url: signedCertificateUrl(row)
      }))
    });
  })
);

router.post(
  "/admin/certificate-requests/:id/certificate",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCertificateRequestSchema();

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return res.status(400).json({ detail: "Invalid certificate request id." });
    }
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

    const file = parsed?.files?.certificate;
    if (!file?.buffer?.length) {
      return res.status(400).json({ detail: "Certificate file is required." });
    }
    const mimeType = String(file.contentType || "").toLowerCase();
    if (mimeType && !["application/pdf", "image/png", "image/jpeg", "image/jpg"].includes(mimeType)) {
      return res.status(400).json({ detail: "Upload a PDF, PNG, or JPG certificate." });
    }

    const existing = await pool.query(
      `SELECT cr.id, cr.user_id, cr.project_name, u.name AS user_name, u.email AS user_email
       FROM certificate_requests cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.id = $1
       LIMIT 1`,
      [requestId]
    );
    if (!existing.rowCount) return res.status(404).json({ detail: "Certificate request not found." });
    const requestRow = existing.rows[0];
    const uploaded = await uploadIssuedCertificate({ requestId, userId: requestRow.user_id, file });
    const { rows } = await pool.query(
      `UPDATE certificate_requests
       SET certificate_url = $2,
           certificate_public_id = $3,
           certificate_original_filename = $4,
           certificate_mime_type = $5,
           status = 'certificate_assigned',
           certificate_issued_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId, uploaded.url, uploaded.publicId, uploaded.originalFilename, uploaded.mimeType]
    );
    const updated = rows[0];
    const certificateUrl = signedCertificateUrl(updated, 3600);

    try {
      const sent = await sendCertificateIssuedEmail({
        to: requestRow.user_email,
        recipientName: requestRow.user_name || "Intern",
        projectName: requestRow.project_name,
        certificateUrl,
        attachment: {
          name: uploaded.originalFilename,
          contentType: uploaded.mimeType,
          contentBytes: file.buffer.toString("base64")
        }
      });
      if (sent?.sent) {
        await pool.query(
          `UPDATE certificate_requests
           SET certificate_emailed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [requestId]
        );
        updated.certificate_emailed_at = new Date().toISOString();
      }
    } catch {
      // The certificate stays assigned even if the email provider is temporarily unavailable.
    }

    return res.json({
      message: "Certificate uploaded and assigned.",
      request: {
        ...updated,
        user_name: requestRow.user_name,
        user_email: requestRow.user_email,
        video_url: signedVideoUrl(updated),
        certificate_url: certificateUrl
      }
    });
  })
);

router.get(
  "/admin/project-draft",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureAdminProjectDraftSchema();
    const { rows } = await pool.query(
      `SELECT payload, created_at, updated_at
       FROM admin_project_drafts
       WHERE admin_user_id = $1
         AND draft_key = 'project_create'
       LIMIT 1`,
      [req.auth.userId]
    );
    if (!rows.length) return res.json({ draft: null });
    return res.json({
      draft: {
        ...(rows[0].payload || {}),
        created_at: rows[0].created_at,
        updated_at: rows[0].updated_at,
        saved_at: rows[0].payload?.saved_at || rows[0].updated_at
      }
    });
  })
);

router.put(
  "/admin/project-draft",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureAdminProjectDraftSchema();
    const payload = normalizeProjectDraftPayload(req.body?.draft || req.body || {});
    const { rows } = await pool.query(
      `INSERT INTO admin_project_drafts (admin_user_id, draft_key, payload, created_at, updated_at)
       VALUES ($1, 'project_create', $2::jsonb, NOW(), NOW())
       ON CONFLICT (admin_user_id, draft_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()
       RETURNING payload, created_at, updated_at`,
      [req.auth.userId, JSON.stringify(payload)]
    );
    return res.json({
      message: "Project draft saved.",
      draft: {
        ...(rows[0].payload || {}),
        created_at: rows[0].created_at,
        updated_at: rows[0].updated_at,
        saved_at: rows[0].payload?.saved_at || rows[0].updated_at
      }
    });
  })
);

router.delete(
  "/admin/project-draft",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureAdminProjectDraftSchema();
    await pool.query(
      `DELETE FROM admin_project_drafts
       WHERE admin_user_id = $1
         AND draft_key = 'project_create'`,
      [req.auth.userId]
    );
    return res.json({ message: "Project draft cleared." });
  })
);

router.get(
  "/admin/projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureDocumentArchitectureSchema();

    const { rows } = await pool.query(
      `SELECT id, title, description, timeline_weeks, project_coins, category, global_category, is_active,
              is_demo_project,
              complexity, keywords, skills_required, skills_gained, target_branch, target_year,
              tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
              introduction_document, introduction_document_url,
              private_brd_document, private_brd_document_url,
              solution_document, solution_document_url,
              company_profile_text,
              created_at, updated_at,
              steps_json AS steps
       FROM projects
       ORDER BY updated_at DESC, id DESC
       LIMIT 200`
    );

    return res.json({ projects: rows });
  })
);

router.get(
  "/admin/home-stats/public",
  asyncHandler(async (_req, res) => {
    await ensureCoinSchema();
    const keys = [
      "home_stats_learners_value",
      "home_stats_learners_suffix",
      "home_stats_learners_override",
      "home_stats_projects_suffix",
      "home_stats_satisfaction_value",
      "home_stats_satisfaction_suffix"
    ];
    const [settingsRes, usersRes, projectsRes] = await Promise.all([
      pool.query(
      `SELECT key, value
       FROM app_settings
       WHERE key = ANY($1::text[])`,
      [keys]
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM projects")
    ]);
    const settings = Object.fromEntries(settingsRes.rows.map((row) => [row.key, row.value]));
    if (!normalizeWorkspaceClosed(settings.home_stats_learners_override)) {
      settings.home_stats_learners_value = String(usersRes.rows[0]?.count ?? 0);
    }
    settings.home_stats_projects_value = String(projectsRes.rows[0]?.count ?? 0);
    settings.home_stats_learners_suffix = "";
    settings.home_stats_projects_suffix = "";
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    return res.json({ stats: mapHomeStats(settings) });
  })
);

router.get(
  "/admin/settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT key, value, value_type, description, updated_at
       FROM app_settings
       WHERE key IN (
         'coin_unit_amount_paisa', 'coin_original_amount_paisa', 'razorpay_key_id', 'razorpay_key_secret',
         'recommendation_project_file_url', 'recommendation_project_file_name',
         'home_stats_learners_value', 'home_stats_learners_suffix', 'home_stats_learners_override',
         'home_stats_projects_value', 'home_stats_projects_suffix',
         'home_stats_satisfaction_value', 'home_stats_satisfaction_suffix',
         'workspace_closed', 'workspace_closed_message', 'project_category_options', 'mentor_chat_rules'
       )`
    );
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const [usersCountRes, projectsCountRes] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM projects")
    ]);
    const learnersOverride = normalizeWorkspaceClosed(settings.home_stats_learners_override);
    if (!learnersOverride) {
      settings.home_stats_learners_value = String(usersCountRes.rows[0]?.count ?? 0);
    }
    settings.home_stats_learners_suffix = "";
    settings.home_stats_projects_value = String(projectsCountRes.rows[0]?.count ?? 0);
    settings.home_stats_projects_suffix = "";
    const coinUnitAmountPaisa = normalizeCoinUnitAmountPaisa(settings.coin_unit_amount_paisa);
    const coinOriginalAmountPaisa = normalizeCoinOriginalAmountPaisa(settings.coin_original_amount_paisa);
    const razorpayKeyId = normalizeRazorpayKeyId(settings.razorpay_key_id);
    const razorpayKeySecret = normalizeRazorpayKeySecret(settings.razorpay_key_secret);
    return res.json({
      settings: {
        coin_unit_amount_paisa: coinUnitAmountPaisa,
        coin_original_amount_paisa: coinOriginalAmountPaisa,
        razorpay_key_id: razorpayKeyId,
        razorpay_key_secret_configured: Boolean(razorpayKeySecret),
        razorpay_key_secret_masked: maskSecret(razorpayKeySecret),
        recommendation_project_file_url: String(settings.recommendation_project_file_url || ""),
        recommendation_project_file_name: String(settings.recommendation_project_file_name || ""),
        home_stats: mapHomeStats(settings),
        workspace_closed: normalizeWorkspaceClosed(settings.workspace_closed),
        workspace_closed_message: normalizeWorkspaceClosedMessage(settings.workspace_closed_message),
        home_stats_learners_override: learnersOverride,
        project_category_options: normalizeProjectCategoryOptions(settings.project_category_options),
        mentor_chat_rules: normalizeMentorChatRules(settings.mentor_chat_rules)
      }
    });
  })
);

router.put(
  "/admin/settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const coinUnitAmountPaisa = normalizeCoinUnitAmountPaisa(
      req.body?.coin_unit_amount_paisa ?? Number(req.body?.coin_price_rupees) * 100
    );
    const coinOriginalAmountPaisa = normalizeCoinOriginalAmountPaisa(
      req.body?.coin_original_amount_paisa ?? Number(req.body?.coin_original_price_rupees) * 100
    );
    const razorpayKeyIdProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "razorpay_key_id");
    const razorpayKeySecretProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "razorpay_key_secret");
    const razorpayKeyId = normalizeRazorpayKeyId(req.body?.razorpay_key_id);
    const razorpayKeySecret = normalizeRazorpayKeySecret(req.body?.razorpay_key_secret);
    const homeStatsInput = req.body?.home_stats || {};
    const learnersOverride = normalizeWorkspaceClosed(homeStatsInput.learners?.override);
    const homeStats = mapHomeStats({
      home_stats_learners_value: homeStatsInput.learners?.value,
      home_stats_learners_suffix: homeStatsInput.learners?.suffix,
      home_stats_projects_value: homeStatsInput.projects?.value,
      home_stats_projects_suffix: homeStatsInput.projects?.suffix,
      home_stats_satisfaction_value: homeStatsInput.satisfaction?.value,
      home_stats_satisfaction_suffix: homeStatsInput.satisfaction?.suffix
    });
    const workspaceClosed = normalizeWorkspaceClosed(req.body?.workspace_closed);
    const workspaceClosedMessage = normalizeWorkspaceClosedMessage(req.body?.workspace_closed_message);
    const projectCategoryOptions = normalizeProjectCategoryOptions(req.body?.project_category_options);
    const mentorChatRules = normalizeMentorChatRules(req.body?.mentor_chat_rules);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
      `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
       VALUES ('coin_unit_amount_paisa', $1, 'integer', 'Price of one coin in paise.', $2, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         value_type = EXCLUDED.value_type,
         description = EXCLUDED.description,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING key, value, value_type, description, updated_at`,
      [String(coinUnitAmountPaisa), req.auth.userId]
      );
      await client.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ('coin_original_amount_paisa', $1, 'integer', 'Original display price of one coin in paise.', $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [String(coinOriginalAmountPaisa), req.auth.userId]
      );
      if (razorpayKeyIdProvided && razorpayKeyId) {
        await client.query(
          `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
           VALUES ('razorpay_key_id', $1, 'secret', 'Razorpay key ID used for checkout orders.', $2, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET
             value = EXCLUDED.value,
             value_type = EXCLUDED.value_type,
             description = EXCLUDED.description,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [razorpayKeyId, req.auth.userId]
        );
      }
      if (razorpayKeySecretProvided && razorpayKeySecret) {
        await client.query(
          `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
           VALUES ('razorpay_key_secret', $1, 'secret', 'Razorpay key secret used for checkout signatures.', $2, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET
             value = EXCLUDED.value,
             value_type = EXCLUDED.value_type,
             description = EXCLUDED.description,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [razorpayKeySecret, req.auth.userId]
        );
      }
      const homeStatRows = [
        ["home_stats_learners_value", String(homeStats.learners.value), "integer", "Homepage active learners manual value."],
        ["home_stats_learners_suffix", homeStats.learners.suffix, "string", "Homepage active learners stat suffix."],
        ["home_stats_learners_override", learnersOverride ? "true" : "false", "boolean", "Whether homepage active learners uses the manual value."],
        ["home_stats_projects_suffix", homeStats.projects.suffix, "string", "Homepage real projects stat suffix."],
        ["home_stats_satisfaction_value", String(homeStats.satisfaction.value), "integer", "Homepage satisfaction stat value."],
        ["home_stats_satisfaction_suffix", homeStats.satisfaction.suffix, "string", "Homepage satisfaction stat suffix."]
      ];
      for (const [key, value, valueType, description] of homeStatRows) {
        await client.query(
          `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET
             value = EXCLUDED.value,
             value_type = EXCLUDED.value_type,
             description = EXCLUDED.description,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [key, value, valueType, description, req.auth.userId]
        );
      }
      await client.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ('workspace_closed', $1, 'boolean', 'Whether learner workspace access is temporarily closed.', $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [workspaceClosed ? "true" : "false", req.auth.userId]
      );
      await client.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ('workspace_closed_message', $1, 'string', 'Message shown to learners when the workspace is closed.', $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [workspaceClosedMessage, req.auth.userId]
      );
      await client.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ('project_category_options', $1, 'json', 'Editable project category dropdown options.', $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [JSON.stringify(projectCategoryOptions), req.auth.userId]
      );
      await client.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ('mentor_chat_rules', $1, 'json', 'Runtime mentor chat behavior rules.', $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [JSON.stringify(mentorChatRules), req.auth.userId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      `SELECT key, value
       FROM app_settings
       WHERE key IN ('razorpay_key_id', 'razorpay_key_secret')`
    );
    const nextSettings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return res.json({
      message: "Settings updated.",
      settings: {
        coin_unit_amount_paisa: coinUnitAmountPaisa,
        coin_original_amount_paisa: coinOriginalAmountPaisa,
        razorpay_key_id: normalizeRazorpayKeyId(nextSettings.razorpay_key_id),
        razorpay_key_secret_configured: Boolean(normalizeRazorpayKeySecret(nextSettings.razorpay_key_secret)),
        razorpay_key_secret_masked: maskSecret(nextSettings.razorpay_key_secret),
        home_stats: { ...homeStats, learners: { ...homeStats.learners, override: learnersOverride } },
        workspace_closed: workspaceClosed,
        workspace_closed_message: workspaceClosedMessage,
        project_category_options: projectCategoryOptions,
        mentor_chat_rules: mentorChatRules
      }
    });
  })
);

router.get(
  "/admin/github-settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT github_token, webhook_secret, token_expires_at, is_active, updated_at
       FROM github_app_settings
       WHERE is_active = TRUE
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    );
    return res.json({ settings: serializeGithubSettings(rows[0] || null) });
  })
);

router.put(
  "/admin/github-settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();

    const githubTokenProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "github_token");
    const webhookSecretProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "webhook_secret");
    const githubToken = normalizeGithubToken(req.body?.github_token);
    const webhookSecret = normalizeGithubWebhookSecret(req.body?.webhook_secret);
    const tokenExpiresAt =
      normalizeOptionalDate(req.body?.token_expires_at) ||
      (githubTokenProvided && githubToken ? defaultGithubTokenExpiry() : null);

    if (githubTokenProvided && !githubToken) {
      return res.status(400).json({ detail: "GitHub token cannot be blank when provided." });
    }
    if (webhookSecretProvided && !webhookSecret) {
      return res.status(400).json({ detail: "Webhook secret cannot be blank when provided." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: existingRows } = await client.query(
        `SELECT id, github_token, webhook_secret, token_expires_at
         FROM github_app_settings
         WHERE is_active = TRUE
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
      );
      const existing = existingRows[0] || {};
      const nextGithubToken = githubTokenProvided ? githubToken : normalizeGithubToken(existing.github_token);
      const nextWebhookSecret = webhookSecretProvided
        ? webhookSecret
        : normalizeGithubWebhookSecret(existing.webhook_secret);
      const nextExpiresAt = tokenExpiresAt || existing.token_expires_at || null;

      if (!nextGithubToken && !nextWebhookSecret) {
        await client.query("ROLLBACK");
        return res.status(400).json({ detail: "Provide a GitHub token or webhook secret." });
      }

      const { rows } = await client.query(
        `INSERT INTO github_app_settings (
           github_token, webhook_secret, token_expires_at, is_active, updated_by, created_at, updated_at
         )
         VALUES ($1, $2, $3, TRUE, $4, NOW(), NOW())
         RETURNING id, github_token, webhook_secret, token_expires_at, is_active, updated_at`,
        [nextGithubToken, nextWebhookSecret, nextExpiresAt, req.auth.userId]
      );

      await client.query(
        `UPDATE github_app_settings
         SET is_active = FALSE, updated_at = NOW()
         WHERE id <> $1 AND is_active = TRUE`,
        [rows[0].id]
      );

      await client.query("COMMIT");
      return res.json({
        message: "GitHub settings updated.",
        settings: serializeGithubSettings(rows[0])
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/admin/admin-credential",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT ac.email, ac.can_access_admin, ac.bypass_otp, ac.is_active
       FROM users u
       INNER JOIN admin_credentials ac ON LOWER(ac.email) = LOWER(u.email)
       WHERE u.id = $1
         AND ac.is_active = TRUE
         AND ac.can_access_admin = TRUE
       LIMIT 1`,
      [req.auth.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ detail: "Admin credential not found." });
    }
    return res.json({ credential: rows[0] });
  })
);

router.put(
  "/admin/admin-credential",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();

    const currentEmailInput = normalizeAdminEmail(req.body?.current_email);
    const nextEmail = normalizeAdminEmail(req.body?.email);
    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");

    if (!currentEmailInput || !currentEmailInput.includes("@")) {
      return res.status(400).json({ detail: "Current admin email is required." });
    }
    if (!nextEmail || !nextEmail.includes("@")) {
      return res.status(400).json({ detail: "Valid admin email is required." });
    }
    if (!currentPassword) {
      return res.status(400).json({ detail: "Current password is required." });
    }
    if (newPassword && newPassword.length < 8) {
      return res.status(400).json({ detail: "New password must be at least 8 characters." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRes = await client.query(
        `SELECT ac.id, ac.email, ac.password_hash, ac.password_salt
         FROM users u
         INNER JOIN admin_credentials ac ON LOWER(ac.email) = LOWER(u.email)
         WHERE u.id = $1
           AND ac.is_active = TRUE
           AND ac.can_access_admin = TRUE
         LIMIT 1`,
        [req.auth.userId]
      );
      if (!currentRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "Admin credential not found." });
      }
      const current = currentRes.rows[0];
      if (normalizeAdminEmail(current.email) !== currentEmailInput) {
        await client.query("ROLLBACK");
        return res.status(401).json({ detail: "Current email is incorrect." });
      }
      if (!verifyAdminPassword(currentPassword, current.password_hash, current.password_salt)) {
        await client.query("ROLLBACK");
        return res.status(401).json({ detail: "Current password is incorrect." });
      }

      let passwordHash = String(current.password_hash || "");
      let passwordSalt = String(current.password_salt || "");
      if (newPassword) {
        passwordSalt = crypto.randomBytes(16).toString("hex");
        passwordHash = hashAdminPassword(newPassword, passwordSalt);
      }

      await client.query(
        `UPDATE admin_credentials
         SET email = $2,
             password_hash = $3,
             password_salt = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [current.id, nextEmail, passwordHash, passwordSalt]
      );

      await client.query(
        `UPDATE users
         SET email = $2
         WHERE id = $1`,
        [req.auth.userId, nextEmail]
      );

      await client.query("COMMIT");
      return res.json({
        message: "Admin credential updated.",
        credential: {
          email: nextEmail,
          can_access_admin: true,
          bypass_otp: true,
          is_active: true
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
  "/admin/recommendation-project-file",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
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
    const file = parsed?.files?.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ detail: "Project recommendation file is required." });
    }

    const uploaded = await uploadRecommendationProjectFile({ file });
    const rows = [
      ["recommendation_project_file_url", uploaded.url, "string", "Cloudinary URL for admin-uploaded recommendation project catalog file."],
      ["recommendation_project_file_public_id", uploaded.publicId, "string", "Cloudinary public id for admin-uploaded recommendation project catalog file."],
      ["recommendation_project_file_name", uploaded.name, "string", "Original filename for admin-uploaded recommendation project catalog file."]
    ];
    for (const [key, value, valueType, description] of rows) {
      await pool.query(
        `INSERT INTO app_settings (key, value, value_type, description, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           value_type = EXCLUDED.value_type,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [key, value, valueType, description, req.auth.userId]
      );
    }

    return res.json({
      message: "Recommendation project file uploaded.",
      file: {
        url: uploaded.url,
        public_id: uploaded.publicId,
        name: uploaded.name
      }
    });
  })
);

router.get(
  "/admin/recommendation-logs",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureRecommendationLogSchema();
    const limit = Math.max(1, Math.min(300, Number(req.query?.limit) || 100));
    const { rows } = await pool.query(
      `WITH grouped AS (
         SELECT
           MIN(l.id) AS id,
           l.user_id,
           l.shown_at,
           MAX(l.source) AS source,
           MAX(NULLIF(l.resume_url, '')) AS logged_resume_url,
           jsonb_agg(
             jsonb_build_object(
               'project_id', l.project_id,
               'project_title', l.project_title,
               'rank', l.rank,
               'match_percent', l.match_percent,
               'reason', l.reason
             )
             ORDER BY l.rank ASC, l.id ASC
           ) AS projects
         FROM project_recommendation_logs l
         GROUP BY l.user_id, l.shown_at
       )
       SELECT
         g.id,
         g.user_id,
         u.public_id AS user_public_id,
         u.name AS user_name,
         u.email AS user_email,
         COALESCE(g.logged_resume_url, up.resume_url, '') AS resume_url,
         COALESCE(up.branch, '') AS branch,
         COALESCE(up.year, '') AS year,
         g.source,
         g.shown_at,
         g.projects
       FROM grouped g
       INNER JOIN users u ON u.id = g.user_id
       LEFT JOIN user_profiles up ON up.user_id = g.user_id
       ORDER BY g.shown_at DESC, g.id DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ logs: rows });
  })
);

router.get(
  "/admin/contact-messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT id, name, email, subject, message, created_at
       FROM contact_messages
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    );
    return res.json({ messages: rows });
  })
);


router.get(
  "/admin/newsletter/subscribers",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
    const { rows } = await pool.query(
      `SELECT id, email, status, created_at, updated_at
       FROM newsletter_subscribers
       ORDER BY created_at DESC, id DESC
       LIMIT 1000`
    );
    const summaryRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_subscribers,
         COUNT(*) FILTER (WHERE status = 'subscribed')::int AS active_subscribers,
         (SELECT COUNT(*)::int FROM users WHERE COALESCE(email, '') <> '') AS platform_users
       FROM newsletter_subscribers`
    );
    return res.json({ subscribers: rows, summary: summaryRes.rows[0] || {} });
  })
);

router.get(
  "/admin/newsletters",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
    const { rows } = await pool.query(
      `SELECT *
       FROM admin_newsletters
       ORDER BY created_at DESC, id DESC
       LIMIT 100`
    );
    return res.json({ newsletters: rows.map(serializeNewsletter) });
  })
);

router.post(
  "/admin/newsletters",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "12mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
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

    const subject = normalizeNewsletterText(parsed.fields?.subject, 180);
    const title = normalizeNewsletterText(parsed.fields?.title, 180);
    const bodyText = normalizeNewsletterText(parsed.fields?.body_text || parsed.fields?.body, 5000);
    if (!subject) return res.status(400).json({ detail: "Newsletter subject is required." });
    if (!bodyText) return res.status(400).json({ detail: "Newsletter text is required." });

    const file = parsed.files?.image || parsed.files?.file || null;
    if (file?.buffer?.length) {
      const mimeType = String(file.contentType || "").toLowerCase();
      if (!mimeType.startsWith("image/")) return res.status(400).json({ detail: "Upload an image file." });
      if (Number(file.size || file.buffer.length || 0) > 8 * 1024 * 1024) {
        return res.status(400).json({ detail: "Newsletter image must be 8 MB or smaller." });
      }
    }

    const uploaded = file?.buffer?.length ? await uploadNewsletterImage({ file }) : null;
    const { rows } = await pool.query(
      `INSERT INTO admin_newsletters
         (subject, title, body_text, image_url, image_public_id, image_original_filename, image_mime_type, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, NOW(), NOW())
       RETURNING *`,
      [
        subject,
        title || subject,
        bodyText,
        uploaded?.url || "",
        uploaded?.publicId || "",
        uploaded?.originalFilename || "",
        uploaded?.mimeType || "",
        req.auth.userId
      ]
    );
    return res.status(201).json({ message: "Newsletter saved.", newsletter: serializeNewsletter(rows[0]) });
  })
);

router.put(
  "/admin/newsletters/:id",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "9mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
    const newsletterId = Number(req.params.id);
    if (!Number.isInteger(newsletterId) || newsletterId <= 0) {
      return res.status(400).json({ detail: "Valid newsletter id is required." });
    }
    const existingRes = await pool.query(`SELECT * FROM admin_newsletters WHERE id = $1`, [newsletterId]);
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ detail: "Newsletter not found." });

    const parsed = parseMultipartRequest(req);
    const subject = normalizeNewsletterText(parsed.fields?.subject, 180);
    const title = normalizeNewsletterText(parsed.fields?.title, 180);
    const bodyText = normalizeNewsletterText(parsed.fields?.body_text || parsed.fields?.body, 5000);
    if (!subject) return res.status(400).json({ detail: "Newsletter subject is required." });
    if (!bodyText) return res.status(400).json({ detail: "Newsletter text is required." });

    const file = parsed.files?.image;
    if (file?.buffer?.length) {
      const mimeType = String(file.contentType || "").toLowerCase();
      if (!mimeType.startsWith("image/")) return res.status(400).json({ detail: "Upload an image file." });
      if (Number(file.size || file.buffer.length || 0) > 8 * 1024 * 1024) {
        return res.status(400).json({ detail: "Newsletter image must be 8 MB or smaller." });
      }
    }

    const uploaded = file?.buffer?.length ? await uploadNewsletterImage({ newsletterId, file }) : null;
    const { rows } = await pool.query(
      `UPDATE admin_newsletters
       SET subject = $2,
           title = $3,
           body_text = $4,
           image_url = $5,
           image_public_id = $6,
           image_original_filename = $7,
           image_mime_type = $8,
           status = CASE WHEN status = 'sending' THEN status ELSE 'draft' END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        newsletterId,
        subject,
        title || subject,
        bodyText,
        uploaded?.url || existing.image_url || "",
        uploaded?.publicId || existing.image_public_id || "",
        uploaded?.originalFilename || existing.image_original_filename || "",
        uploaded?.mimeType || existing.image_mime_type || ""
      ]
    );
    return res.json({ message: "Newsletter updated.", newsletter: serializeNewsletter(rows[0]) });
  })
);
router.delete(
  "/admin/newsletters/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
    const newsletterId = Number(req.params.id);
    if (!Number.isInteger(newsletterId) || newsletterId <= 0) {
      return res.status(400).json({ detail: "Valid newsletter id is required." });
    }
    const { rows } = await pool.query(
      `DELETE FROM admin_newsletters
       WHERE id = $1
       RETURNING id, subject, image_public_id`,
      [newsletterId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Newsletter not found." });
    const imageKey = String(rows[0].image_public_id || "").trim();
    if (imageKey) {
      deleteS3Object({ key: imageKey }).catch(() => {});
    }
    return res.json({ message: "Newsletter deleted.", newsletter: rows[0] });
  })
);
router.post(
  "/admin/newsletters/:id/send",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureNewsletterSchema();
    const newsletterId = Number(req.params.id);
    if (!Number.isInteger(newsletterId) || newsletterId <= 0) {
      return res.status(400).json({ detail: "Valid newsletter id is required." });
    }
    const newsletterRes = await pool.query(`SELECT * FROM admin_newsletters WHERE id = $1`, [newsletterId]);
    const newsletter = newsletterRes.rows[0];
    if (!newsletter) return res.status(404).json({ detail: "Newsletter not found." });

    const scope = String(req.body?.scope || "all").trim().toLowerCase() === "subscribers" ? "subscribers" : "all";
    const recipientQuery = scope === "subscribers"
      ? `SELECT LOWER(TRIM(email)) AS email, 'Subscriber' AS recipient_name
         FROM newsletter_subscribers
         WHERE status = 'subscribed' AND COALESCE(email, '') <> ''
         GROUP BY LOWER(TRIM(email))
         ORDER BY email
         LIMIT 5000`
      : `WITH recipients AS (
         SELECT LOWER(TRIM(email)) AS email, COALESCE(NULLIF(name, ''), 'Intern') AS recipient_name
         FROM users
         WHERE COALESCE(email, '') <> ''
         UNION ALL
         SELECT LOWER(TRIM(email)) AS email, 'Subscriber' AS recipient_name
         FROM newsletter_subscribers
         WHERE status = 'subscribed' AND COALESCE(email, '') <> ''
       )
       SELECT email, MAX(recipient_name) AS recipient_name
       FROM recipients
       WHERE email <> ''
       GROUP BY email
       ORDER BY email
       LIMIT 5000`;
    const recipientsRes = await pool.query(recipientQuery);    const recipients = recipientsRes.rows || [];
    if (!recipients.length) return res.status(400).json({ detail: "No recipients found." });

    await pool.query(
      `UPDATE admin_newsletters
       SET status = 'sending', recipient_count = $2, sent_count = 0, skipped_count = 0, failed_count = 0,
           last_error = '', sent_by = $3, updated_at = NOW()
       WHERE id = $1`,
      [newsletterId, recipients.length, req.auth.userId]
    );

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];
    const imageUrl = newsletterImageUrl(newsletter, 86400);
    for (const recipient of recipients) {
      try {
        const result = await sendNewsletterEmail({
          to: recipient.email,
          subject: newsletter.subject,
          title: newsletter.title,
          bodyText: newsletter.body_text,
          imageUrl
        });
        if (result?.sent) sentCount += 1;
        else skippedCount += 1;
      } catch (error) {
        failedCount += 1;
        if (errors.length < 8) errors.push(`${recipient.email}: ${error.message}`);
      }
    }
    const status = failedCount ? (sentCount || skippedCount ? "partial" : "failed") : "sent";
    const lastError = errors.join(" | ").slice(0, 2000);
    const updateRes = await pool.query(
      `UPDATE admin_newsletters
       SET status = $2, recipient_count = $3, sent_count = $4, skipped_count = $5, failed_count = $6,
           last_error = $7, sent_by = $8, sent_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [newsletterId, status, recipients.length, sentCount, skippedCount, failedCount, lastError, req.auth.userId]
    );
    return res.json({
      message: failedCount ? "Newsletter sent with some failures." : "Newsletter send completed.",
      scope,
      newsletter: serializeNewsletter(updateRes.rows[0]),
      recipient_count: recipients.length,
      sent_count: sentCount,
      skipped_count: skippedCount,
      failed_count: failedCount
    });
  })
);
router.get(
  "/admin/overview",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const usersRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_users,
         COUNT(*) FILTER (WHERE has_paid = TRUE)::int AS paid_users
       FROM users`
    );

    const projectsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_projects,
         COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_projects
       FROM projects`
    );

    const activeUsersRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS users_with_active_projects
       FROM project_progress`
    );

    const projectUsageRes = await pool.query(
      `SELECT p.id, p.title, p.category, p.timeline_weeks, p.project_coins, p.is_active,
              COUNT(pp.user_id)::int AS users_working
       FROM projects p
       LEFT JOIN project_progress pp
         ON pp.project_name = p.title
       GROUP BY p.id, p.title, p.category, p.timeline_weeks, p.project_coins, p.is_active
       ORDER BY users_working DESC, p.updated_at DESC, p.id DESC
       LIMIT 200`
    );

    return res.json({
      generated_at: new Date().toISOString(),
      stats: {
        ...(usersRes.rows[0] || {}),
        ...(projectsRes.rows[0] || {}),
        ...(activeUsersRes.rows[0] || {})
      },
      projects: projectUsageRes.rows || []
    });
  })
);

router.get(
  "/admin/token-usage",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    await ensureAiUsageSchema();

    const llmProvider = "openai";
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const modelOrDefault = (value, fallback) => {
      const normalized = String(value || "").split("#")[0].trim();
      return normalized && !normalized.toLowerCase().startsWith("your_") ? normalized : fallback;
    };
    const cleanOpenaiModel = modelOrDefault(openaiModel, "gpt-4o-mini");
    const openaiLightModel = modelOrDefault(process.env.OPENAI_LIGHT_MODEL, cleanOpenaiModel);
    const openaiMentorModel = modelOrDefault(process.env.OPENAI_MENTOR_MODEL, openaiLightModel);
    const openaiReviewModel = modelOrDefault(process.env.OPENAI_REVIEW_MODEL, cleanOpenaiModel);
    const openaiEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const anthropicLightModel = process.env.ANTHROPIC_LIGHT_MODEL || "claude-haiku-4-5-20251001";
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    const geminiModel = process.env.GEMINI_SELF_INTRO_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const activeChatModel = openaiMentorModel;
    const activeReviewModel = openaiReviewModel;
    const openaiStandardPricing = {
      "gpt-5.6": { input: 5, cachedInput: 0.5, output: 30 },
      "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
      "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, output: 15 },
      "gpt-5.6-luna": { input: 1, cachedInput: 0.1, output: 6 },
      "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
      "gpt-5.5-pro": { input: 30, cachedInput: null, output: 180 },
      "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
      "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
      "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
      "gpt-5.4-pro": { input: 30, cachedInput: null, output: 180 },
      "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
      "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
      "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
      "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
      "text-embedding-3-small": { input: 0.02, cachedInput: null, output: 0 },
      "text-embedding-3-large": { input: 0.13, cachedInput: null, output: 0 }
    };
    const normalizeModelForPricing = (model) => String(model || "").trim().toLowerCase();
    const getPricing = (provider, model) => {
      if (String(provider || "").toLowerCase() !== "openai") return null;
      const cleanModel = normalizeModelForPricing(model);
      if (openaiStandardPricing[cleanModel]) return openaiStandardPricing[cleanModel];
      const datedBase = cleanModel.replace(/-\d{4}-\d{2}-\d{2}$/, "");
      return openaiStandardPricing[datedBase] || null;
    };
    const money = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
    const enrichUsageRow = (row) => {
      const inputTokens = Number(row.input_tokens || row.prompt_tokens || 0);
      const outputTokens = Number(row.output_tokens || row.completion_tokens || 0);
      const cachedTokens = Math.min(Math.max(Number(row.cached_tokens || 0), 0), Math.max(inputTokens, 0));
      const uncachedInputTokens = Math.max(inputTokens - cachedTokens, 0);
      const pricing = getPricing(row.provider, row.model);
      if (!pricing) {
        return {
          ...row,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cached_tokens: cachedTokens,
          uncached_input_tokens: uncachedInputTokens,
          cache_adjusted_input_tokens: inputTokens,
          estimated_uncached_cost_usd: null,
          estimated_cache_adjusted_cost_usd: null,
          estimated_cache_savings_usd: null,
          pricing_basis: ""
        };
      }
      const cachedInputRate = Number.isFinite(Number(pricing.cachedInput)) ? Number(pricing.cachedInput) : Number(pricing.input);
      const uncachedCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
      const adjustedCost = (uncachedInputTokens * pricing.input + cachedTokens * cachedInputRate + outputTokens * pricing.output) / 1000000;
      const cacheSavings = Math.max(0, uncachedCost - adjustedCost);
      const cacheAdjustedInputTokens = uncachedInputTokens + (pricing.input ? cachedTokens * (cachedInputRate / pricing.input) : cachedTokens);
      return {
        ...row,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_tokens: cachedTokens,
        uncached_input_tokens: uncachedInputTokens,
        cache_adjusted_input_tokens: Math.round(cacheAdjustedInputTokens),
        estimated_uncached_cost_usd: money(uncachedCost),
        estimated_cache_adjusted_cost_usd: money(adjustedCost),
        estimated_cache_savings_usd: money(cacheSavings),
        input_price_per_mtok: pricing.input,
        cached_input_price_per_mtok: cachedInputRate,
        output_price_per_mtok: pricing.output,
        pricing_basis: "OpenAI standard short-context USD per 1M tokens"
      };
    };
    const enrichRows = (rows = []) => rows.map(enrichUsageRow);

    const [
      usageFeatureRes,
      usageDailyRes,
      usageDailyBreakdownRes,
      usageModelRes,
      usageRouteRes,
      usageRouteDailyRes,
      usageRequestEventRes,
      usageHourlyRes,
      usageUserRes,
      usageRecentRes,
      usageOverviewRes,
      mentorOptimizationRes,
      mentorRes,
      mentorDailyRes,
      codeReviewRes,
      codeReviewDailyRes,
      embeddingRes,
      embeddingDailyRes,
      selfIntroRes,
      selfIntroDailyRes
    ] =
      await Promise.all([
        pool.query(
          `SELECT feature,
                  provider,
                  model,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COALESCE(ROUND(AVG(NULLIF(total_tokens, 0)))::int, 0)::int AS avg_tokens
           FROM ai_usage_events
           GROUP BY feature, provider, model
           ORDER BY total_tokens DESC, requests DESC`
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COUNT(*)::int AS requests
           FROM ai_usage_events
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date
           ORDER BY day ASC`
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  feature,
                  provider,
                  model,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COUNT(*)::int AS requests
           FROM ai_usage_events
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date, feature, provider, model
           ORDER BY day ASC, total_tokens DESC`
        ),
        pool.query(
          `SELECT provider, model,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COALESCE(ROUND(AVG(NULLIF(total_tokens, 0)))::int, 0)::int AS avg_tokens
           FROM ai_usage_events
           GROUP BY provider, model
           ORDER BY total_tokens DESC, requests DESC`
        ),
        pool.query(
          `SELECT feature,
                  route,
                  provider,
                  model,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COALESCE(ROUND(AVG(NULLIF(total_tokens, 0)))::int, 0)::int AS avg_tokens,
                  COALESCE(ROUND(AVG(NULLIF(
                    CASE
                      WHEN COALESCE(raw_usage->>'prompt_chars', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                      THEN (raw_usage->>'prompt_chars')::numeric
                      ELSE 0
                    END,
                    0
                  )))::int, 0)::int AS avg_prompt_chars
           FROM ai_usage_events
           GROUP BY feature, route, provider, model
           ORDER BY total_tokens DESC, requests DESC
           LIMIT 100`
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  feature,
                  route,
                  provider,
                  model,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(billable_units), 0)::int AS billable_units,
                  COALESCE(ROUND(AVG(NULLIF(total_tokens, 0)))::int, 0)::int AS avg_tokens,
                  COALESCE(ROUND(AVG(NULLIF(
                    CASE
                      WHEN COALESCE(raw_usage->>'prompt_chars', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                      THEN (raw_usage->>'prompt_chars')::numeric
                      ELSE 0
                    END,
                    0
                  )))::int, 0)::int AS avg_prompt_chars
           FROM ai_usage_events
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date, feature, route, provider, model
           ORDER BY day ASC, total_tokens DESC
           LIMIT 500`
        ),
        pool.query(
          `SELECT e.id,
                  e.created_at,
                  e.feature,
                  e.route,
                  e.provider,
                  e.model,
                  e.user_id,
                  COALESCE(u.name, u.email, CASE WHEN e.user_id IS NULL THEN 'System / Unknown' ELSE 'User ' || e.user_id::text END) AS user_name,
                  COALESCE(u.email, '') AS user_email,
                  e.project_name,
                  e.prompt_tokens,
                  e.completion_tokens,
                  e.total_tokens,
                  CASE WHEN e.input_tokens > 0 THEN e.input_tokens ELSE e.prompt_tokens END AS input_tokens,
                  CASE WHEN e.output_tokens > 0 THEN e.output_tokens ELSE e.completion_tokens END AS output_tokens,
                  e.cached_tokens,
                  e.billable_units
           FROM ai_usage_events e
           LEFT JOIN users u ON u.id = e.user_id
           WHERE e.created_at >= NOW() - INTERVAL '30 days'
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT 1000`
        ),
        pool.query(
          `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens
           FROM ai_usage_events
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY EXTRACT(HOUR FROM created_at)
           ORDER BY hour ASC`
        ),
        pool.query(
          `SELECT e.user_id,
                  COALESCE(u.name, u.email, CASE WHEN e.user_id IS NULL THEN 'System / Unknown' ELSE 'User ' || e.user_id::text END) AS user_name,
                  COALESCE(u.email, '') AS user_email,
                  COUNT(*)::int AS requests,
                  COALESCE(SUM(e.prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(e.completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(e.total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN e.input_tokens > 0 THEN e.input_tokens ELSE e.prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN e.output_tokens > 0 THEN e.output_tokens ELSE e.completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(e.cached_tokens), 0)::int AS cached_tokens,
                  COALESCE(SUM(e.billable_units), 0)::int AS billable_units,
                  MAX(e.created_at) AS last_used_at
           FROM ai_usage_events e
           LEFT JOIN users u ON u.id = e.user_id
           WHERE e.created_at >= NOW() - INTERVAL '30 days'
           GROUP BY e.user_id, u.name, u.email
           ORDER BY total_tokens DESC, requests DESC
           LIMIT 50`
        ),
        pool.query(
          `SELECT e.created_at,
                  e.feature,
                  e.route,
                  e.provider,
                  e.model,
                  e.user_id,
                  COALESCE(u.email, '') AS user_email,
                  e.project_name,
                  e.related_table,
                  e.related_id,
                  e.prompt_tokens,
                  e.completion_tokens,
                  e.total_tokens,
                  CASE WHEN e.input_tokens > 0 THEN e.input_tokens ELSE e.prompt_tokens END AS input_tokens,
                  CASE WHEN e.output_tokens > 0 THEN e.output_tokens ELSE e.completion_tokens END AS output_tokens,
                  e.cached_tokens,
                  e.billable_units,
                  e.raw_usage,
                  COALESCE(u.name, u.email, CASE WHEN e.user_id IS NULL THEN 'System / Unknown' ELSE 'User ' || e.user_id::text END) AS user_name
           FROM ai_usage_events e
           LEFT JOIN users u ON u.id = e.user_id
           ORDER BY e.created_at DESC
           LIMIT 50`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS requests,
                  COUNT(DISTINCT user_id)::int AS unique_users,
                  COUNT(DISTINCT provider)::int AS providers,
                  COUNT(DISTINCT model)::int AS models,
                  COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
                  COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
                  COALESCE(SUM(CASE WHEN input_tokens > 0 THEN input_tokens ELSE prompt_tokens END), 0)::int AS input_tokens,
                  COALESCE(SUM(CASE WHEN output_tokens > 0 THEN output_tokens ELSE completion_tokens END), 0)::int AS output_tokens,
                  COALESCE(SUM(cached_tokens), 0)::int AS cached_tokens
           FROM ai_usage_events
           WHERE created_at >= NOW() - INTERVAL '30 days'`
        ),
        pool.query(
          `SELECT COALESCE(metadata->'optimization'->>'reply_source', 'unknown') AS reply_source,
                  COUNT(*)::int AS assistant_messages,
                  COUNT(*) FILTER (
                    WHERE COALESCE(metadata->'optimization'->>'llm_called', metadata->'optimization'->>'claude_called', 'false') = 'true'
                  )::int AS llm_messages,
                  COUNT(*) FILTER (WHERE COALESCE(metadata->'optimization'->>'rag_used', 'false') = 'true')::int AS rag_messages
           FROM mentor_chat_messages
           WHERE role = 'assistant'
           GROUP BY COALESCE(metadata->'optimization'->>'reply_source', 'unknown')
           ORDER BY assistant_messages DESC`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS messages,
                  COUNT(*) FILTER (WHERE role = 'user')::int AS user_messages,
                  COUNT(*) FILTER (WHERE role = 'assistant')::int AS assistant_messages,
                  COALESCE(CEIL(SUM(LENGTH(message)) / 4.0), 0)::int AS estimated_tokens
           FROM mentor_chat_messages`
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  COALESCE(CEIL(SUM(LENGTH(message)) / 4.0), 0)::int AS estimated_tokens,
                  COUNT(*)::int AS messages
           FROM mentor_chat_messages
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date
           ORDER BY day ASC`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS reviews,
                  COALESCE(CEIL(SUM(LENGTH(review_feedback)) / 4.0), 0)::int AS estimated_tokens
           FROM code_reviews`
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  COALESCE(CEIL(SUM(LENGTH(review_feedback)) / 4.0), 0)::int AS estimated_tokens,
                  COUNT(*)::int AS reviews
           FROM code_reviews
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date
           ORDER BY day ASC`
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(embedding_model, ''), $1) AS model,
                  COUNT(*)::int AS chunks,
                  COALESCE(SUM(token_count), 0)::int AS tokens
           FROM document_chunks
           GROUP BY COALESCE(NULLIF(embedding_model, ''), $1)
           ORDER BY tokens DESC, chunks DESC`,
          [openaiEmbeddingModel]
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  COALESCE(SUM(token_count), 0)::int AS tokens,
                  COUNT(*)::int AS chunks
           FROM document_chunks
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date
           ORDER BY day ASC`
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(analysis_model, ''), $1) AS model,
                  COUNT(*)::int AS submissions,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                  COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                  COALESCE(SUM(duration_seconds), 0)::int AS video_seconds,
                  COALESCE(SUM(file_size_bytes), 0)::bigint AS file_bytes
           FROM self_intro_submissions
           GROUP BY COALESCE(NULLIF(analysis_model, ''), $1)
           ORDER BY submissions DESC`,
          [geminiModel]
        ),
        pool.query(
          `SELECT created_at::date AS day,
                  COUNT(*)::int AS submissions,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
           FROM self_intro_submissions
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY created_at::date
           ORDER BY day ASC`
        )
      ]);

    const mentor = mentorRes.rows[0] || {};
    const codeReview = codeReviewRes.rows[0] || {};
    const embeddingTokens = embeddingRes.rows.reduce((sum, row) => sum + (Number(row.tokens) || 0), 0);
    const embeddingChunks = embeddingRes.rows.reduce((sum, row) => sum + (Number(row.chunks) || 0), 0);
    const selfIntroSubmissions = selfIntroRes.rows.reduce((sum, row) => sum + (Number(row.submissions) || 0), 0);
    const exactTokens = usageFeatureRes.rows.reduce((sum, row) => sum + (Number(row.total_tokens) || 0), 0);
    const exactRequests = usageFeatureRes.rows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0);
    const exactInputTokens = usageFeatureRes.rows.reduce((sum, row) => {
      const inputTokens = Number(row.input_tokens) || 0;
      const promptTokens = Number(row.prompt_tokens) || 0;
      return sum + (inputTokens > 0 ? inputTokens : promptTokens);
    }, 0);
    const exactOutputTokens = usageFeatureRes.rows.reduce((sum, row) => {
      const outputTokens = Number(row.output_tokens) || 0;
      const completionTokens = Number(row.completion_tokens) || 0;
      return sum + (outputTokens > 0 ? outputTokens : completionTokens);
    }, 0);
    const exactCachedTokens = usageFeatureRes.rows.reduce((sum, row) => sum + (Number(row.cached_tokens) || 0), 0);
    const usageFeatureRows = enrichRows(usageFeatureRes.rows);
    const usageDailyRows = enrichRows(usageDailyRes.rows);
    const usageDailyBreakdownRows = enrichRows(usageDailyBreakdownRes.rows);
    const usageModelRows = enrichRows(usageModelRes.rows);
    const usageRouteRows = enrichRows(usageRouteRes.rows);
    const usageRouteDailyRows = enrichRows(usageRouteDailyRes.rows);
    const usageRequestEventRows = enrichRows(usageRequestEventRes.rows);
    const usageUserRows = enrichRows(usageUserRes.rows);
    const usageRecentRows = enrichRows(usageRecentRes.rows);
    const exactUncachedInputTokens = usageFeatureRows.reduce((sum, row) => sum + (Number(row.uncached_input_tokens) || 0), 0);
    const exactCacheAdjustedInputTokens = usageFeatureRows.reduce((sum, row) => sum + (Number(row.cache_adjusted_input_tokens) || 0), 0);
    const exactUncachedCostUsd = money(usageFeatureRows.reduce((sum, row) => sum + (Number(row.estimated_uncached_cost_usd) || 0), 0));
    const exactCacheAdjustedCostUsd = money(usageFeatureRows.reduce((sum, row) => sum + (Number(row.estimated_cache_adjusted_cost_usd) || 0), 0));
    const exactCacheSavingsUsd = money(usageFeatureRows.reduce((sum, row) => sum + (Number(row.estimated_cache_savings_usd) || 0), 0));
    const usageOverview = usageOverviewRes.rows[0] || {};
    const providerTotals = new Map();
    for (const row of usageModelRows) {
      const provider = row.provider || "unknown";
      const current = providerTotals.get(provider) || {
        provider,
        requests: 0,
        total_tokens: 0,
        cached_tokens: 0,
        estimated_uncached_cost_usd: 0,
        estimated_cache_adjusted_cost_usd: 0,
        estimated_cache_savings_usd: 0
      };
      current.requests += Number(row.requests) || 0;
      current.total_tokens += Number(row.total_tokens) || 0;
      current.cached_tokens += Number(row.cached_tokens) || 0;
      current.estimated_uncached_cost_usd = money(current.estimated_uncached_cost_usd + (Number(row.estimated_uncached_cost_usd) || 0));
      current.estimated_cache_adjusted_cost_usd = money(current.estimated_cache_adjusted_cost_usd + (Number(row.estimated_cache_adjusted_cost_usd) || 0));
      current.estimated_cache_savings_usd = money(current.estimated_cache_savings_usd + (Number(row.estimated_cache_savings_usd) || 0));
      providerTotals.set(provider, current);
    }
    const llmMentorMessages = mentorOptimizationRes.rows.reduce((sum, row) => sum + (Number(row.llm_messages) || 0), 0);
    const avoidedMentorLlmMessages = mentorOptimizationRes.rows.reduce((sum, row) => {
      const source = String(row.reply_source || "");
      if (source === "llm" || source === "unknown") return sum;
      return sum + (Number(row.assistant_messages) || 0);
    }, 0);
    const ragMentorMessages = mentorOptimizationRes.rows.reduce((sum, row) => sum + (Number(row.rag_messages) || 0), 0);
    const exactByFeature = new Map();
    for (const row of usageFeatureRows) {
      if (!exactByFeature.has(row.feature)) exactByFeature.set(row.feature, []);
      exactByFeature.get(row.feature).push(row);
    }
    const featureTotals = (feature) => {
      const rows = exactByFeature.get(feature) || [];
      return {
        requests: rows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0),
        tokens: rows.reduce((sum, row) => sum + (Number(row.total_tokens) || 0), 0),
        model: rows[0]?.model || "",
        provider: rows[0]?.provider || ""
      };
    };
    const mentorExact = featureTotals("mentor_chat");
    const reviewExact = featureTotals("code_review");
    const selfIntroExact = featureTotals("self_intro_video");
    const embeddingExact = featureTotals("document_embeddings");

    const sources = [
      {
        key: "mentor_chat",
        label: "Mentor Chat",
        provider: mentorExact.provider || llmProvider,
        model: mentorExact.model || activeChatModel,
        requests: mentorExact.requests || Number(mentor.assistant_messages || 0),
        tokens: mentorExact.requests ? mentorExact.tokens : null,
        estimated_tokens: Number(mentor.estimated_tokens || 0),
        exact: Boolean(mentorExact.requests),
        detail: mentorExact.requests
          ? `${mentorExact.requests} exact tracked AI calls, ${avoidedMentorLlmMessages} local/cache mentor replies`
          : `${Number(mentor.messages || 0)} saved chat messages, exact tracking starts after this update`
      },
      {
        key: "code_review",
        label: "Code Review",
        provider: reviewExact.provider || llmProvider,
        model: reviewExact.model || activeReviewModel,
        requests: reviewExact.requests || Number(codeReview.reviews || 0),
        tokens: reviewExact.requests ? reviewExact.tokens : null,
        estimated_tokens: Number(codeReview.estimated_tokens || 0),
        exact: Boolean(reviewExact.requests),
        detail: reviewExact.requests
          ? `${reviewExact.requests} exact tracked AI calls`
          : `${Number(codeReview.reviews || 0)} saved review reports, exact tracking starts after this update`
      },
      {
        key: "document_embeddings",
        label: "Document Embeddings",
        provider: embeddingExact.provider || "openai",
        model: embeddingExact.model || openaiEmbeddingModel,
        requests: embeddingExact.requests || embeddingChunks,
        tokens: embeddingExact.requests ? embeddingExact.tokens : null,
        estimated_tokens: embeddingTokens,
        exact: Boolean(embeddingExact.requests),
        detail: embeddingExact.requests
          ? `${embeddingExact.requests} exact tracked embedding calls`
          : `${embeddingChunks} indexed chunks, exact embedding API usage not captured yet`
      },
      {
        key: "self_intro_video",
        label: "Self Intro Video",
        provider: selfIntroExact.provider || "gemini",
        model: selfIntroExact.model || geminiModel,
        requests: selfIntroExact.requests || selfIntroSubmissions,
        tokens: selfIntroExact.requests ? selfIntroExact.tokens : null,
        exact: Boolean(selfIntroExact.requests),
        detail: selfIntroExact.requests
          ? `${selfIntroExact.requests} exact tracked Gemini calls`
          : `${selfIntroSubmissions} video submissions, exact tracking starts after this update`
      }
    ];

    return res.json({
      generated_at: new Date().toISOString(),
      note: "Exact totals come from ai_usage_events and are recorded only when the provider response returns usage metadata. Older activity before this table was added can only appear as historical counts or estimates.",
      models: {
        llm_provider: llmProvider,
        openai_model: cleanOpenaiModel,
        openai_light_model: openaiLightModel,
        openai_mentor_model: openaiMentorModel,
        openai_review_model: openaiReviewModel,
        openai_embedding_model: openaiEmbeddingModel,
        anthropic_light_model: anthropicLightModel,
        anthropic_model: anthropicModel,
        gemini_self_intro_model: geminiModel
      },
      totals: {
        exact_tokens: exactTokens,
        exact_requests: exactRequests,
        exact_input_tokens: exactInputTokens,
        exact_output_tokens: exactOutputTokens,
        exact_cached_tokens: exactCachedTokens,
        exact_uncached_input_tokens: exactUncachedInputTokens,
        exact_cache_adjusted_input_tokens: exactCacheAdjustedInputTokens,
        exact_estimated_uncached_cost_usd: exactUncachedCostUsd,
        exact_estimated_cache_adjusted_cost_usd: exactCacheAdjustedCostUsd,
        exact_estimated_cache_savings_usd: exactCacheSavingsUsd,
        last_30_day_requests: Number(usageOverview.requests || 0),
        last_30_day_tokens: Number(usageOverview.total_tokens || 0),
        last_30_day_unique_users: Number(usageOverview.unique_users || 0),
        last_30_day_providers: Number(usageOverview.providers || 0),
        last_30_day_models: Number(usageOverview.models || 0),
        last_30_day_input_tokens: Number(usageOverview.input_tokens || 0),
        last_30_day_output_tokens: Number(usageOverview.output_tokens || 0),
        last_30_day_cached_tokens: Number(usageOverview.cached_tokens || 0),
        mentor_llm_messages: llmMentorMessages,
        mentor_local_or_cached_messages: avoidedMentorLlmMessages,
        mentor_rag_messages: ragMentorMessages,
        estimated_tokens: sources.reduce((sum, source) => sum + (!source.exact ? Number(source.estimated_tokens || 0) : 0), 0),
        requests: sources.reduce((sum, source) => sum + (Number(source.requests) || 0), 0)
      },
      sources,
      charts: {
        exact_usage_daily: usageDailyRows,
        exact_usage_daily_breakdown: usageDailyBreakdownRows,
        exact_usage_by_model: usageModelRows,
        exact_usage_by_feature: usageFeatureRows,
        exact_usage_by_route: usageRouteRows,
        exact_usage_by_route_daily: usageRouteDailyRows,
        exact_usage_request_events: usageRequestEventRows,
        requests_by_hour: usageHourlyRes.rows,
        provider_distribution: Array.from(providerTotals.values()).sort(
          (a, b) => (Number(b.total_tokens) || 0) - (Number(a.total_tokens) || 0)
        ),
        token_breakdown: {
          input_tokens: Number(usageOverview.input_tokens || 0) || exactInputTokens,
          output_tokens: Number(usageOverview.output_tokens || 0) || exactOutputTokens,
          cached_tokens: Number(usageOverview.cached_tokens || 0) || exactCachedTokens,
          uncached_input_tokens: exactUncachedInputTokens,
          cache_adjusted_input_tokens: exactCacheAdjustedInputTokens,
          estimated_uncached_cost_usd: exactUncachedCostUsd,
          estimated_cache_adjusted_cost_usd: exactCacheAdjustedCostUsd,
          estimated_cache_savings_usd: exactCacheSavingsUsd,
          pricing_basis: "OpenAI standard short-context USD per 1M tokens where model pricing is known"
        },
        top_users: usageUserRows,
        recent_activity: usageRecentRows,
        mentor_reply_sources: mentorOptimizationRes.rows,
        mentor_chat_daily: mentorDailyRes.rows,
        code_review_daily: codeReviewDailyRes.rows,
        embedding_daily: embeddingDailyRes.rows,
        self_intro_daily: selfIntroDailyRes.rows,
        embeddings_by_model: embeddingRes.rows,
        self_intro_by_model: selfIntroRes.rows
      }
    });
  })
);

router.get(
  "/admin/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureCertificateRequestSchema();
    const q = String(req.query?.q || "").trim();
    const mode = String(req.query?.mode || "").trim().toLowerCase();
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const paymentAccess = String(req.query?.payment_access || "all").trim().toLowerCase();
    const joined = String(req.query?.joined || "all").trim().toLowerCase();

    const params = [];
    const andFilters = [];
    const searchFilters = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      searchFilters.push(`lower(u.email) LIKE $${params.length}`);
      searchFilters.push(`lower(u.name) LIKE $${params.length}`);
      searchFilters.push(`lower(u.public_id) LIKE $${params.length}`);
    }
    const idNumber = Number(q);
    const includeId = Number.isInteger(idNumber) && idNumber > 0;
    if (includeId) {
      params.push(idNumber);
      searchFilters.push(`u.id = $${params.length}`);
    }
    if (searchFilters.length) {
      andFilters.push(`(${searchFilters.join(" OR ")})`);
    }
    if (status === "active") {
      andFilters.push("u.is_active = TRUE");
    } else if (status === "inactive") {
      andFilters.push("u.is_active = FALSE");
    }
    if (paymentAccess === "paid") {
      andFilters.push("COALESCE(u.has_paid, FALSE) = TRUE");
    } else if (paymentAccess === "access_granted") {
      andFilters.push("COALESCE(u.has_paid, FALSE) = FALSE");
      andFilters.push("EXISTS (SELECT 1 FROM project_progress access_pp LEFT JOIN projects access_p ON access_p.title = access_pp.project_name WHERE access_pp.user_id = u.id AND COALESCE(access_p.is_demo_project, FALSE) = FALSE)");
      andFilters.push("NOT EXISTS (SELECT 1 FROM project_progress real_pp LEFT JOIN projects real_p ON real_p.title = real_pp.project_name WHERE real_pp.user_id = u.id AND COALESCE(real_p.is_demo_project, FALSE) = FALSE)");
    } else if (paymentAccess === "unpaid") {
      andFilters.push("COALESCE(u.has_paid, FALSE) = FALSE");
      andFilters.push("NOT EXISTS (SELECT 1 FROM project_progress access_pp WHERE access_pp.user_id = u.id)");
    }
    if (joined === "today") {
      andFilters.push("u.created_at >= date_trunc('day', NOW())");
    } else if (joined === "yesterday") {
      andFilters.push("u.created_at >= date_trunc('day', NOW()) - INTERVAL '1 day'");
      andFilters.push("u.created_at < date_trunc('day', NOW())");
    } else if (joined === "7d" || joined === "7_days") {
      andFilters.push("u.created_at >= NOW() - INTERVAL '7 days'");
    } else if (joined === "month" || joined === "this_month") {
      andFilters.push("u.created_at >= date_trunc('month', NOW())");
    }
    if (mode !== "management" && !q) return res.json({ users: [] });
    const whereSql = andFilters.length ? `WHERE ${andFilters.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT u.id,
              u.public_id,
              u.name,
              u.email,
              u.has_paid,
              u.is_active,
              u.created_at,
              u.last_seen_at,
              COALESCE(ucb.coin_balance, u.coin_balance, 0)::int AS coin_balance,
              COALESCE(ucb.total_coins_purchased, u.total_coins_purchased, 0)::int AS total_coins_purchased,
              COALESCE(pp.project_count, 0)::int AS project_count,
              COALESCE(pp.demo_project_count, 0)::int AS demo_project_count,
              COALESCE(pp.real_project_count, 0)::int AS real_project_count,
              COALESCE(inv.invoice_count, 0)::int AS invoice_count,
              COALESCE(cert.certificate_request_count, 0)::int AS certificate_request_count,
              CASE
                WHEN COALESCE(u.has_paid, FALSE) THEN 'paid'
                WHEN COALESCE(pp.real_project_count, 0) > 0 THEN 'access_granted'
                WHEN COALESCE(pp.demo_project_count, 0) > 0 THEN 'demo_active'
                ELSE 'unpaid'
              END AS payment_access_status,
              CASE
                WHEN COALESCE(u.has_paid, FALSE) THEN COALESCE(ucb.total_coins_purchased, u.total_coins_purchased, 0)::int
                WHEN COALESCE(pp.real_project_count, 0) > 0 THEN 1
                ELSE 0
              END AS access_coin_value,
              (u.last_seen_at >= NOW() - INTERVAL '2 minutes') AS is_online
       FROM users u
       LEFT JOIN user_coin_balances ucb ON ucb.user_id = u.id
       LEFT JOIN (
         SELECT pp.user_id,
                COUNT(*)::int AS project_count,
                COUNT(*) FILTER (WHERE COALESCE(p.is_demo_project, FALSE) = TRUE)::int AS demo_project_count,
                COUNT(*) FILTER (WHERE COALESCE(p.is_demo_project, FALSE) = FALSE)::int AS real_project_count
         FROM project_progress pp
         LEFT JOIN projects p ON p.title = pp.project_name
         GROUP BY pp.user_id
       ) pp ON pp.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*)::int AS invoice_count
         FROM invoices
         GROUP BY user_id
       ) inv ON inv.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*)::int AS certificate_request_count
         FROM certificate_requests
         GROUP BY user_id
       ) cert ON cert.user_id = u.id
       ${whereSql}
       ORDER BY u.is_active DESC, u.id DESC
       LIMIT ${mode === "management" ? 500 : 25}`,
      params
    );

    return res.json({ users: rows });
  })
);

router.patch(
  "/admin/users/:id/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ detail: "Invalid user id." });
    }
    if (userId === Number(req.auth.userId)) {
      return res.status(400).json({ detail: "You cannot deactivate your own admin account." });
    }
    if (typeof req.body?.is_active !== "boolean") {
      return res.status(400).json({ detail: "is_active boolean is required." });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET is_active = $2
       WHERE id = $1
       RETURNING id, public_id, name, email, has_paid, is_active, created_at, last_seen_at`,
      [userId, req.body.is_active]
    );
    if (!rows.length) return res.status(404).json({ detail: "User not found." });
    if (!req.body.is_active) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE",
        [userId]
      );
    }

    return res.json({
      message: req.body.is_active ? "User account activated." : "User account deactivated.",
      user: rows[0]
    });
  })
);

router.delete(
  "/admin/users/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureCertificateRequestSchema();

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ detail: "Invalid user id." });
    }
    if (userId === Number(req.auth.userId)) {
      return res.status(400).json({ detail: "You cannot delete your own admin account." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT id, public_id, name, email FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "User not found." });
      }

      const deleted = await hardDeleteUserAccount(client, userId, existing.rows[0].email);
      if (!deleted.user) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "User not found." });
      }
      await client.query("COMMIT");
      return res.json({
        message: "User account and linked records deleted.",
        user: deleted.user,
        deleted_counts: deleted.counts
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
  "/admin/s3-objects",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const prefix = String(req.query?.prefix || "").trim();
    const continuationToken = String(req.query?.continuation_token || "").trim();
    const listAll = ["1", "true", "yes", "all"].includes(String(req.query?.all || req.query?.list_all || "").trim().toLowerCase());
    const maxKeys = Number(req.query?.max_keys || (listAll ? 1000 : 100));
    let listed = await listS3Objects({ prefix, continuationToken, maxKeys });
    if (listAll) {
      const objects = [...(listed.objects || [])];
      let nextToken = listed.next_continuation_token || "";
      let pageCount = 1;
      while (nextToken && pageCount < 25) {
        const nextPage = await listS3Objects({ prefix, continuationToken: nextToken, maxKeys });
        objects.push(...(nextPage.objects || []));
        nextToken = nextPage.next_continuation_token || "";
        listed = nextPage;
        pageCount += 1;
      }
      listed = {
        ...listed,
        objects,
        key_count: objects.length,
        is_truncated: Boolean(nextToken),
        next_continuation_token: nextToken,
      };
    }
    const keys = (listed.objects || []).map((item) => item.key).filter(Boolean);
    const client = await pool.connect();
    try {
      let referenceMap = new Map();
      try {
        referenceMap = await buildS3ReferenceMap(client, keys);
      } catch (error) {
        console.warn("S3 cleanup reference enrichment failed", error?.message || error);
      }
      const objects = (listed.objects || []).map((item) => {
        const references = referenceMap.get(item.key) || [];
        const primary = references[0] || null;
        return {
          ...item,
          references,
          reference_count: references.length,
          source: primary?.source || "Unlinked object",
          user_id: primary?.user_id || null,
          user_public_id: primary?.user_public_id || "",
          user_name: primary?.user_name || "",
          user_email: primary?.user_email || "",
          detail: primary?.detail || "",
          view_url: createPresignedS3GetUrl({ key: item.key, expiresSeconds: 600 }),
        };
      });
      return res.json({
        bucket: listed.bucket,
        prefix: listed.prefix,
        objects,
        total_size_bytes: objects.reduce((sum, item) => sum + (Number(item.size) || 0), 0),
        is_truncated: listed.is_truncated,
        next_continuation_token: listed.next_continuation_token,
        key_count: listed.key_count,
      });
    } finally {
      client.release();
    }
  })
);

router.get(
  "/admin/rag-monitoring",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const limit = Math.max(1, Math.min(500, Math.round(Number(req.query?.limit) || 200)));
    const hasMentorMessages = await tableExists(pool, "mentor_chat_messages");
    if (!hasMentorMessages) {
      return res.json({
        summary: { total: 0, rag_used: 0, skipped: 0, llm_called: 0, chunks: 0 },
        events: []
      });
    }

    const hasAiUsageEvents = await tableExists(pool, "ai_usage_events");
    const aiUsageJoin = hasAiUsageEvents
      ? `LEFT JOIN LATERAL (
           SELECT e.id, e.created_at, e.provider, e.model, e.route,
                  e.prompt_tokens, e.completion_tokens, e.total_tokens, e.raw_usage
           FROM ai_usage_events e
           WHERE e.feature = 'mentor_chat'
             AND e.user_id = m.user_id
             AND LOWER(TRIM(e.project_name)) = LOWER(TRIM(m.project_name))
             AND e.created_at BETWEEN m.created_at - INTERVAL '10 minutes' AND m.created_at + INTERVAL '5 minutes'
           ORDER BY ABS(EXTRACT(EPOCH FROM (e.created_at - m.created_at))) ASC, e.id DESC
           LIMIT 1
         ) usage ON TRUE`
      : `LEFT JOIN LATERAL (
           SELECT NULL::int AS id, NULL::timestamptz AS created_at, ''::varchar AS provider, ''::varchar AS model,
                  ''::varchar AS route, 0::int AS prompt_tokens, 0::int AS completion_tokens,
                  0::int AS total_tokens, '{}'::jsonb AS raw_usage
         ) usage ON TRUE`;

    const { rows } = await pool.query(
      `SELECT m.id,
              m.created_at,
              m.user_id,
              COALESCE(u.name, u.email, 'User ' || m.user_id::text) AS user_name,
              COALESCE(u.email, '') AS user_email,
              m.project_name,
              m.mentor_id,
              m.agent_key,
              m.agent_name,
              m.metadata::jsonb->'optimization' AS optimization,
              LEFT(COALESCE(prev_user.message, ''), 900) AS user_message,
              LEFT(m.message, 900) AS assistant_message,
              usage.id AS usage_event_id,
              usage.created_at AS usage_created_at,
              usage.provider,
              usage.model,
              usage.route,
              usage.prompt_tokens,
              usage.completion_tokens,
              usage.total_tokens,
              usage.raw_usage
       FROM mentor_chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN LATERAL (
         SELECT p.message
         FROM mentor_chat_messages p
         WHERE p.user_id = m.user_id
           AND LOWER(TRIM(p.project_name)) = LOWER(TRIM(m.project_name))
           AND p.role = 'user'
           AND (p.created_at < m.created_at OR (p.created_at = m.created_at AND p.id < m.id))
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT 1
       ) prev_user ON TRUE
       ${aiUsageJoin}
       WHERE m.role = 'assistant'
         AND m.metadata::jsonb ? 'optimization'
         AND (
           m.metadata::jsonb->'optimization' ? 'rag_used'
           OR m.metadata::jsonb->'optimization' ? 'rag_skipped'
           OR m.metadata::jsonb->'optimization' ? 'rag_max_chunks'
         )
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $1`,
      [limit]
    );

    const events = rows.map((row) => {
      const optimization = row.optimization && typeof row.optimization === "object" ? row.optimization : {};
      const rawUsage = row.raw_usage && typeof row.raw_usage === "object" ? row.raw_usage : {};
      const usageOptimization = rawUsage.optimization && typeof rawUsage.optimization === "object" ? rawUsage.optimization : {};
      const chunks = Array.isArray(optimization.rag_chunks) ? optimization.rag_chunks : [];
      const retrievedChunks = Number(optimization.rag_retrieved_chunks ?? chunks.length) || 0;
      return {
        id: row.id,
        created_at: row.created_at,
        user_id: row.user_id,
        user_name: row.user_name,
        user_email: row.user_email,
        project_name: row.project_name,
        mentor_id: row.mentor_id,
        agent_key: row.agent_key,
        agent_name: row.agent_name,
        user_message: row.user_message,
        assistant_message: row.assistant_message,
        rag_used: String(optimization.rag_used || usageOptimization.rag_included || "false") === "true" || optimization.rag_used === true || usageOptimization.rag_included === true,
        rag_skipped: optimization.rag_skipped || "",
        rag_retrieved_chunks: retrievedChunks,
        rag_max_chunks: Number(optimization.rag_max_chunks) || null,
        rag_max_context_chars: Number(optimization.rag_max_context_chars) || null,
        rag_min_score: optimization.rag_min_score ?? null,
        chunks,
        reply_source: optimization.reply_source || "",
        llm_called: optimization.llm_called === true || String(optimization.llm_called || "").toLowerCase() === "true",
        llm_provider: optimization.llm_provider || row.provider || "",
        usage_event_id: row.usage_event_id,
        usage_created_at: row.usage_created_at,
        provider: row.provider || "",
        model: row.model || "",
        route: row.route || "",
        prompt_tokens: Number(row.prompt_tokens) || 0,
        completion_tokens: Number(row.completion_tokens) || 0,
        total_tokens: Number(row.total_tokens) || 0,
      };
    });
    const summary = events.reduce(
      (acc, event) => {
        acc.total += 1;
        if (event.rag_used) acc.rag_used += 1;
        if (event.rag_skipped) acc.skipped += 1;
        if (event.llm_called) acc.llm_called += 1;
        acc.chunks += Number(event.rag_retrieved_chunks) || 0;
        return acc;
      },
      { total: 0, rag_used: 0, skipped: 0, llm_called: 0, chunks: 0 }
    );

    return res.json({ summary, events });
  })
);

router.get(
  "/admin/s3-objects/preview-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const key = String(req.query?.key || "").trim();
    if (!key) return res.status(400).json({ detail: "S3 object key is required." });
    await requireS3ObjectAvailable({ key });
    return res.json({
      key,
      url: createPresignedS3GetUrl({ key, expiresSeconds: 600 }),
    });
  })
);

router.delete(
  "/admin/s3-objects",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const key = String(req.body?.key || req.query?.key || "").trim();
    if (!key) return res.status(400).json({ detail: "S3 object key is required." });
    const deleted = await deleteS3Object({ key });
    return res.json({
      message: "S3 object deleted.",
      ...deleted,
    });
  })
);

router.get(
  "/admin/project-assign/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const { rows } = await pool.query(
      `SELECT r.id AS request_id,
              r.created_at,
              r.message,
              r.status,
              u.id AS user_id,
              u.public_id AS user_public_id,
              u.name AS requester_name,
              u.email AS requester_email,
              u.has_paid
       FROM project_assignment_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM project_progress pp WHERE pp.user_id = u.id
         )
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 200`
    );

    return res.json({ requests: rows });
  })
);

router.get(
  "/admin/project-assign/assigned",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureUserPresenceSchema();

    const { rows } = await pool.query(
      `SELECT u.id AS user_id,
              u.public_id AS user_public_id,
              u.name AS user_name,
              u.email AS user_email,
              u.last_seen_at,
              (u.last_seen_at >= NOW() - INTERVAL '2 minutes') AS is_online,
              u.has_paid,
              pp.id AS progress_id,
              pp.project_name,
              pp.current_step,
              pp.completed_tasks,
              pp.created_at AS progress_created_at,
              p.id AS project_id,
              p.title AS project_title,
              p.category AS project_category,
              COALESCE(p.is_demo_project, FALSE) AS project_is_demo,
              p.is_active AS project_is_active,
              p.steps_json,
              latest_req.id AS latest_request_id,
              latest_req.status AS latest_request_status,
              latest_req.assigned_project_id AS latest_request_project_id,
              latest_req.created_at AS latest_request_created_at,
              latest_req.resolved_at AS latest_request_resolved_at
       FROM users u
       LEFT JOIN LATERAL (
         SELECT id, user_id, project_name, current_step, completed_tasks, created_at
         FROM project_progress
         WHERE user_id = u.id
         ORDER BY id DESC
         LIMIT 1
       ) pp ON TRUE
       LEFT JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       LEFT JOIN LATERAL (
         SELECT id, status, assigned_project_id, created_at, resolved_at
         FROM project_assignment_requests
         WHERE user_id = u.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) latest_req ON TRUE
       ORDER BY COALESCE(pp.id, 0) DESC, u.id DESC
       LIMIT 500`
    );

    const userIds = [...new Set(rows.map((row) => Number(row.user_id)).filter((id) => Number.isFinite(id) && id > 0))];
    const stageRes = userIds.length
      ? await pool.query(
        `SELECT user_id, project_name, step_number, stage_index, status, started_at, completed_at
         FROM project_stage_progress
         WHERE user_id = ANY($1::int[])`,
        [userIds]
      )
      : { rows: [] };

    const stagesByUserProject = stageRes.rows.reduce((acc, row) => {
      const key = `${Number(row.user_id)}::${assignmentProjectKey(row.project_name)}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
    const stagesByUser = stageRes.rows.reduce((acc, row) => {
      const key = String(Number(row.user_id));
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const assignments = rows.map((row) => {
      const userKey = String(Number(row.user_id));
      const projectKeys = [
        row.project_name,
        row.project_title,
      ]
        .map((value) => `${Number(row.user_id)}::${assignmentProjectKey(value)}`)
        .filter(Boolean);
      let stageRows = [];
      for (const projectKey of projectKeys) {
        if (stagesByUserProject[projectKey]?.length) {
          stageRows = stagesByUserProject[projectKey];
          break;
        }
      }
      if (!stageRows.length) {
        const userStages = stagesByUser[userKey] || [];
        const uniqueStageProjects = [...new Set(userStages.map((stage) => assignmentProjectKey(stage.project_name)).filter(Boolean))];
        if (uniqueStageProjects.length === 1) stageRows = userStages;
      }
      const snapshot = deriveAssignmentSnapshot({
        progressRow: row,
        stageRows,
        latestRequestStatus: row.latest_request_status
      });

      return {
        ...row,
        ...snapshot
      };
    });

    return res.json({ assignments });
  })
);

router.get(
  "/admin/project-assign/assigned/:progressId/chats",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const progressId = Number(req.params.progressId);
    if (!Number.isFinite(progressId) || progressId <= 0) {
      return res.status(400).json({ detail: "Valid assignment id is required." });
    }

    const userIdFallback = Number(req.query?.user_id);
    const projectNameFallback = String(req.query?.project_name || "").trim();
    let { rows: progressRows } = await pool.query(
      `SELECT pp.id AS progress_id,
              pp.user_id,
              pp.project_name,
              u.public_id AS user_public_id,
              u.name AS user_name,
              u.email AS user_email,
              p.id AS project_id,
              p.title AS project_title,
              p.category AS project_category,
              COALESCE(p.is_demo_project, FALSE) AS project_is_demo,
              p.steps_json
       FROM project_progress pp
       JOIN users u ON u.id = pp.user_id
       LEFT JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
       WHERE pp.id = $1
       LIMIT 1`,
      [progressId]
    );
    if (!progressRows.length && Number.isFinite(userIdFallback) && userIdFallback > 0 && projectNameFallback) {
      const fallbackRes = await pool.query(
        `SELECT pp.id AS progress_id,
                pp.user_id,
                pp.project_name,
                u.public_id AS user_public_id,
                u.name AS user_name,
                u.email AS user_email,
                p.id AS project_id,
                p.title AS project_title,
                p.category AS project_category,
                COALESCE(p.is_demo_project, FALSE) AS project_is_demo,
                p.steps_json
         FROM project_progress pp
         JOIN users u ON u.id = pp.user_id
         LEFT JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(pp.project_name))
         WHERE pp.user_id = $1
           AND LOWER(TRIM(pp.project_name)) = LOWER(TRIM($2))
         ORDER BY pp.id DESC
         LIMIT 1`,
        [userIdFallback, projectNameFallback]
      );
      progressRows = fallbackRes.rows;
    }
    if (!progressRows.length) return res.status(404).json({ detail: "Assigned project not found." });

    const assignment = progressRows[0];
    const projectSteps = parseProjectSteps(assignment.steps_json);
    const { rows } = await pool.query(
      `SELECT m.id,
              m.role,
              m.message,
              m.agent_key,
              m.agent_name,
              m.mentor_id,
              m.metadata,
              m.created_at,
              pm.mentor_name,
              pm.role AS mentor_role
       FROM mentor_chat_messages m
       LEFT JOIN project_mentors pm ON pm.id = m.mentor_id
       WHERE m.user_id = $1
         AND LOWER(TRIM(m.project_name)) = LOWER(TRIM($2))
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 500`,
      [assignment.user_id, assignment.project_name]
    );

    const messages = rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const labels = stageLabelsForMessage({ metadata, projectSteps });
      const mentorName = String(row.mentor_name || row.agent_name || row.agent_key || "InternzBee Crew").trim();
      return {
        id: row.id,
        role: row.role,
        message: row.message,
        content: row.message,
        agent_key: row.agent_key || "",
        agent_name: row.agent_name || "",
        mentor_id: row.mentor_id,
        mentor_name: row.role === "user" ? "Student" : mentorName,
        mentor_role: row.role === "user" ? "" : String(row.mentor_role || "").trim(),
        metadata,
        ...labels,
        created_at: row.created_at
      };
    });

    const { rows: documentRows } = await pool.query(
      `SELECT d.id,
              d.step_number,
              d.stage_index,
              d.submission_group_id,
              d.document_url,
              d.document_name,
              d.document_public_id,
              d.document_review_status,
              d.document_review_feedback,
              d.document_reviewed_at,
              d.created_at,
              p.status AS stage_status,
              p.document_submission_group_id AS stage_submission_group_id,
              p.document_review_status AS stage_review_status,
              p.document_review_feedback AS stage_review_feedback,
              p.document_reviewed_at AS stage_reviewed_at
       FROM project_stage_documents d
       LEFT JOIN project_stage_progress p
         ON p.user_id = d.user_id
        AND LOWER(TRIM(p.project_name)) = LOWER(TRIM(d.project_name))
        AND p.step_number = d.step_number
        AND p.stage_index = d.stage_index
       WHERE d.user_id = $1
         AND LOWER(TRIM(d.project_name)) = LOWER(TRIM($2))
       ORDER BY d.step_number ASC, d.stage_index ASC, d.id ASC
       LIMIT 500`,
      [assignment.user_id, assignment.project_name]
    );
    const documents = documentRows.map((row) => {
      const documentStatus = String(row.document_review_status || "").trim().toLowerCase();
      const stageStatus = String(row.stage_review_status || "").trim().toLowerCase();
      const documentGroupId = String(row.submission_group_id || "").trim();
      const stageGroupId = String(row.stage_submission_group_id || "").trim();
      const canUseStageReview =
        stageStatus && stageStatus !== "not_submitted" && (!stageGroupId || !documentGroupId || stageGroupId === documentGroupId);
      const effectiveReviewStatus =
        documentStatus && documentStatus !== "not_submitted"
          ? documentStatus
          : canUseStageReview
            ? stageStatus
            : row.document_url
              ? "pending"
              : "not_submitted";
      const labels = stageLabelsForMessage({
        metadata: {
          step_number: row.step_number,
          stage_index: row.stage_index,
        },
        projectSteps,
      });
      return {
        id: row.id,
        submission_group_id: row.submission_group_id || "",
        document_url: row.document_url || "",
        preview_url: buildInlinePreviewUrl({
          documentUrl: row.document_url || "",
          documentName: row.document_name || "",
        }),
        document_name: row.document_name || "",
        document_public_id: row.document_public_id || "",
        stage_status: row.stage_status || "",
        document_review_status: effectiveReviewStatus,
        document_review_feedback: row.document_review_feedback || (canUseStageReview ? row.stage_review_feedback : "") || "",
        document_reviewed_at: row.document_reviewed_at || (canUseStageReview ? row.stage_reviewed_at : null),
        created_at: row.created_at,
        ...labels,
      };
    });

    return res.json({
      assignment: {
        progress_id: assignment.progress_id,
        user_id: assignment.user_id,
        user_public_id: assignment.user_public_id,
        user_name: assignment.user_name,
        user_email: assignment.user_email,
        project_id: assignment.project_id,
        project_name: assignment.project_name,
        project_title: assignment.project_title,
        project_category: assignment.project_category
      },
      messages,
      documents
    });
  })
);

router.get(
  "/admin/stage-document-reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureStageDocumentReviewAuditSchema();

    const search = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const limit = Math.max(1, Math.min(300, Number(req.query?.limit) || 150));
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        u.name ILIKE $${params.length}
        OR u.email ILIKE $${params.length}
        OR u.public_id ILIKE $${params.length}
        OR d.project_name ILIKE $${params.length}
        OR d.document_name ILIKE $${params.length}
      )`);
    }
    let statusParam = "";
    if (["pending", "approved", "rejected", "not_submitted"].includes(status)) {
      params.push(status);
      statusParam = `$${params.length}`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;

    const { rows } = await pool.query(
      `WITH grouped_documents AS (
         SELECT d.user_id,
                d.project_name,
                d.step_number,
                d.stage_index,
                COALESCE(NULLIF(d.submission_group_id, ''), CONCAT('doc-', d.id)) AS group_key,
                MAX(d.submission_group_id) AS submission_group_id,
                MAX(d.document_review_status) AS document_review_status,
                MIN(d.created_at) AS uploaded_at,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', d.id,
                    'document_url', d.document_url,
                    'preview_url', '',
                    'document_name', d.document_name,
                    'document_public_id', d.document_public_id,
                    'document_review_status', d.document_review_status,
                    'document_review_feedback', d.document_review_feedback,
                    'document_reviewed_at', d.document_reviewed_at,
                    'created_at', d.created_at
                  )
                  ORDER BY d.id ASC
                ) AS documents
         FROM project_stage_documents d
         JOIN users u ON u.id = d.user_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         GROUP BY d.user_id, d.project_name, d.step_number, d.stage_index, COALESCE(NULLIF(d.submission_group_id, ''), CONCAT('doc-', d.id))
       )
       SELECT gd.*,
              u.public_id AS user_public_id,
              u.name AS user_name,
              u.email AS user_email,
              p.title AS project_title,
              p.category AS project_category,
              p.steps_json,
              sp.status AS stage_status,
              sp.document_review_status AS stage_review_status,
              sp.document_review_feedback AS stage_review_feedback,
              sp.document_reviewed_at AS stage_reviewed_at,
              a.id AS audit_id,
              a.parser_details,
              a.raw_markdown,
              a.optimized_text,
              a.prompt_input,
              a.full_prompt,
              a.llm_raw_output,
              a.llm_json,
              a.review_source,
              a.review_status,
              a.review_score,
              a.review_feedback,
              a.github_required,
              a.github_connected AS audit_github_connected,
              gh.id AS github_repository_id,
              a.stage_completed,
              a.audit_text,
              a.created_at AS audit_created_at
       FROM grouped_documents gd
       JOIN users u ON u.id = gd.user_id
       LEFT JOIN github_repositories gh ON gh.user_id = gd.user_id
       LEFT JOIN projects p ON LOWER(TRIM(p.title)) = LOWER(TRIM(gd.project_name))
       LEFT JOIN project_stage_progress sp
         ON sp.user_id = gd.user_id
        AND LOWER(TRIM(sp.project_name)) = LOWER(TRIM(gd.project_name))
        AND sp.step_number = gd.step_number
        AND sp.stage_index = gd.stage_index
       LEFT JOIN LATERAL (
         SELECT *
         FROM stage_document_review_audits audit
         WHERE audit.user_id = gd.user_id
           AND LOWER(TRIM(audit.project_name)) = LOWER(TRIM(gd.project_name))
           AND audit.step_number = gd.step_number
           AND audit.stage_index = gd.stage_index
           AND (
             COALESCE(NULLIF(audit.submission_group_id, ''), gd.group_key) = gd.group_key
             OR COALESCE(NULLIF(audit.submission_group_id, ''), '') = COALESCE(NULLIF(gd.submission_group_id, ''), '')
           )
         ORDER BY audit.created_at DESC, audit.id DESC
         LIMIT 1
       ) a ON TRUE
       ${statusParam ? `WHERE LOWER(COALESCE(a.review_status, sp.document_review_status, gd.document_review_status, 'not_submitted')) = ${statusParam}` : ""}
       ORDER BY COALESCE(a.created_at, gd.uploaded_at) DESC, gd.uploaded_at DESC
       LIMIT ${limitParam}`,
      params
    );

    const reviews = rows.map((row) => {
      const projectSteps = parseProjectSteps(row.steps_json);
      const labels = stageLabelsForMessage({
        metadata: {
          step_number: row.step_number,
          stage_index: row.stage_index,
        },
        projectSteps,
      });
      const documents = Array.isArray(row.documents) ? row.documents : [];
      return {
        id: row.audit_id || `${row.user_id}-${row.project_name}-${row.step_number}-${row.stage_index}-${row.group_key}`,
        audit_id: row.audit_id,
        user_id: row.user_id,
        user_public_id: row.user_public_id,
        user_name: row.user_name,
        user_email: row.user_email,
        project_name: row.project_name,
        project_title: row.project_title,
        project_category: row.project_category,
        step_number: row.step_number,
        stage_index: row.stage_index,
        submission_group_id: row.submission_group_id || "",
        uploaded_at: row.uploaded_at,
        documents: documents.map((document) => ({
          ...document,
          preview_url: buildInlinePreviewUrl({
            documentUrl: document.document_url || "",
            documentName: document.document_name || "",
          }),
        })),
        stage_status: row.stage_status || "",
        stage_review_status: row.stage_review_status || "",
        stage_review_feedback: row.stage_review_feedback || "",
        stage_reviewed_at: row.stage_reviewed_at,
        parser_details: row.parser_details || {},
        raw_markdown: row.raw_markdown || "",
        optimized_text: row.optimized_text || "",
        prompt_input: row.prompt_input || {},
        full_prompt: row.full_prompt || "",
        llm_raw_output: row.llm_raw_output || "",
        llm_json: row.llm_json || {},
        review_source: row.review_source || "",
        review_status: row.review_status || row.stage_review_status || documents[0]?.document_review_status || "not_submitted",
        review_score: row.review_score,
        review_feedback: row.review_feedback || row.stage_review_feedback || "",
        github_required: Boolean(row.github_required),
        github_connected: Boolean(row.github_repository_id),
        audit_github_connected: Boolean(row.audit_github_connected),
        stage_completed: Boolean(row.stage_completed),
        audit_text: row.audit_text || "",
        audit_created_at: row.audit_created_at,
        ...labels,
      };
    });

    return res.json({ reviews });
  })
);

router.put(
  "/admin/project-assign/assigned/:progressId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const progressId = Number(req.params.progressId);
    const projectId = Number(req.body?.project_id);
    if (!Number.isFinite(progressId) || progressId <= 0) {
      return res.status(400).json({ detail: "Valid assignment id is required." });
    }
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ detail: "Valid project_id is required." });
    }

    const projectRes = await pool.query(
      "SELECT id, title, category, global_category, is_active FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });
    const project = projectRes.rows[0];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progressRes = await client.query(
        `SELECT id, user_id, project_name, current_step
         FROM project_progress
         WHERE id = $1
         FOR UPDATE`,
        [progressId]
      );
      if (!progressRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "Assigned project not found." });
      }
      const progress = progressRes.rows[0];
      const oldProjectName = String(progress.project_name || "");

      const stageStateRes = await client.query(
        `SELECT user_id, project_name, step_number, stage_index, status, started_at, completed_at
         FROM project_stage_progress
         WHERE user_id = $1
           AND project_name = $2`,
        [progress.user_id, oldProjectName]
      );
      const currentProjectRes = await client.query(
        `SELECT steps_json
         FROM projects
         WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
         LIMIT 1`,
        [oldProjectName]
      );
      const snapshot = deriveAssignmentSnapshot({
        progressRow: {
          ...progress,
          steps_json: currentProjectRes.rows[0]?.steps_json || []
        },
        stageRows: stageStateRes.rows || [],
        latestRequestStatus: "assigned"
      });

      if (snapshot.lifecycle_status !== "assigned") {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "Project can be reassigned only before the user starts working on it." });
      }

      const duplicateRes = await client.query(
        `SELECT id
         FROM project_progress
         WHERE user_id = $1
           AND project_name = $2
           AND id <> $3
         LIMIT 1`,
        [progress.user_id, project.title, progressId]
      );
      if (duplicateRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "This user already has that project assigned." });
      }

      const updatedProgress = await client.query(
        `UPDATE project_progress
         SET project_name = $2
         WHERE id = $1
         RETURNING id, user_id, project_name, current_step, completed_tasks`,
        [progressId, project.title]
      );

      await client.query(
        `UPDATE project_stage_progress
         SET project_name = $3,
             updated_at = NOW()
         WHERE user_id = $1
           AND project_name = $2`,
        [progress.user_id, oldProjectName, project.title]
      );

      await client.query(
        `UPDATE project_assignment_requests
         SET assigned_project_id = $3
         WHERE user_id = $1
           AND status = 'assigned'
           AND assigned_project_id = (
             SELECT id FROM projects WHERE title = $2 LIMIT 1
           )`,
        [progress.user_id, oldProjectName, project.id]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Assigned project updated.",
        assignment: {
          ...updatedProgress.rows[0],
          project_id: project.id,
          project_title: project.title,
          project_category: project.category,
          project_is_active: project.is_active
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
  "/admin/project-assign/assigned/:progressId/abandon",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const progressId = Number(req.params.progressId);
    if (!Number.isFinite(progressId) || progressId <= 0) {
      return res.status(400).json({ detail: "Valid assignment id is required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const progressRes = await client.query(
        `SELECT id, user_id, project_name
         FROM project_progress
         WHERE id = $1
         FOR UPDATE`,
        [progressId]
      );
      if (!progressRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "Assigned project not found." });
      }
      const progress = progressRes.rows[0];

      await client.query(
        `DELETE FROM project_stage_progress
         WHERE user_id = $1
           AND project_name = $2`,
        [progress.user_id, progress.project_name]
      );

      await client.query("DELETE FROM project_progress WHERE id = $1", [progressId]);

      const latestRequestRes = await client.query(
        `SELECT id
         FROM project_assignment_requests
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [progress.user_id]
      );

      if (latestRequestRes.rowCount) {
        await client.query(
          `UPDATE project_assignment_requests
           SET status = 'abandoned',
               assigned_project_id = NULL,
               resolved_at = NOW(),
               resolved_by = $2
           WHERE id = $1`,
          [latestRequestRes.rows[0].id, req.auth.userId]
        );
      } else {
        await client.query(
          `INSERT INTO project_assignment_requests (user_id, message, status, assigned_project_id, resolved_by, resolved_at, created_at)
           VALUES ($1, $2, 'abandoned', NULL, $3, NOW(), NOW())`,
          [progress.user_id, "Marked abandoned by admin.", req.auth.userId]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, metadata, created_at)
         VALUES ($1, 'admin_assignment_abandoned', $2::jsonb, NOW())`,
        [progress.user_id, JSON.stringify({ project_name: progress.project_name, abandoned_by: req.auth.userId })]
      );

      await client.query("COMMIT");
      return res.json({ message: "Project assignment abandoned." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/admin/project-assign/users/:userId/revert-abandoned",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ detail: "Valid user id is required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const latestRequestRes = await client.query(
        `SELECT id, status
         FROM project_assignment_requests
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      if (!latestRequestRes.rowCount || String(latestRequestRes.rows[0].status || "").toLowerCase() !== "abandoned") {
        await client.query("ROLLBACK");
        return res.status(409).json({ detail: "Only abandoned assignments can be reverted." });
      }

      const abandonedProgressRes = await client.query(
        `SELECT project_name
         FROM project_progress
         WHERE user_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [userId]
      );

      let projectName = String(req.body?.project_name || "").trim();
      if (!projectName) {
        const auditRes = await client.query(
          `SELECT metadata->>'project_name' AS project_name
           FROM audit_logs
           WHERE user_id = $1
             AND action = 'admin_assignment_abandoned'
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [userId]
        );
        projectName = String(auditRes.rows[0]?.project_name || "").trim();
      }

      if (!projectName) {
        await client.query("ROLLBACK");
        return res.status(404).json({ detail: "No abandoned project found to restore." });
      }

      const existingProgressRes = await client.query(
        `SELECT id
         FROM project_progress
         WHERE user_id = $1
           AND project_name = $2
         LIMIT 1`,
        [userId, projectName]
      );

      let progressId = existingProgressRes.rows[0]?.id || null;
      if (!progressId) {
        const inserted = await client.query(
          `INSERT INTO project_progress (user_id, project_name, current_step, completed_tasks)
           VALUES ($1, $2, 1, '')
           RETURNING id`,
          [userId, projectName]
        );
        progressId = inserted.rows[0].id;
      } else {
        await client.query(
          `UPDATE project_progress
           SET current_step = 1,
               completed_tasks = ''
           WHERE id = $1`,
          [progressId]
        );
      }

      await client.query(
        `UPDATE project_assignment_requests
         SET status = 'assigned',
             resolved_at = NOW(),
             resolved_by = $2
         WHERE id = $1`,
        [latestRequestRes.rows[0].id, req.auth.userId]
      );

      await client.query(
        `INSERT INTO audit_logs (user_id, action, metadata, created_at)
         VALUES ($1, 'admin_assignment_reverted', $2::jsonb, NOW())`,
        [userId, JSON.stringify({ project_name: projectName, progress_id: progressId, reverted_by: req.auth.userId })]
      );

      await client.query("COMMIT");
      return res.json({ message: "Abandoned assignment reverted.", project_name: projectName, progress_id: progressId });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/admin/companies",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const name = normalizeCompanyName(req.body?.name);
    const slug = normalizeCompanySlug(req.body?.slug, name);
    const industry = normalizeCompanyIndustry(req.body?.industry);
    const description = normalizeCompanyDescription(req.body?.description);
    const isActive = req.body?.is_active === false ? false : true;

    if (!name) return res.status(400).json({ detail: "Company name is required." });

    const existing = await pool.query("SELECT id FROM companies WHERE slug = $1 LIMIT 1", [slug]);
    if (existing.rowCount) return res.status(409).json({ detail: "Company slug already exists." });

    const { rows } = await pool.query(
      `INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, slug, industry, description, is_active, created_at, updated_at`,
      [name, slug, industry, description, isActive]
    );

    return res.status(201).json({ message: "Company created.", company: rows[0] });
  })
);

router.get(
  "/admin/companies",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.slug, c.industry, c.description, c.is_active,
              c.created_at, c.updated_at,
              COUNT(p.id)::integer AS project_count
       FROM companies c
       LEFT JOIN projects p ON p.company_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC, c.id DESC`
    );

    return res.json({ companies: rows });
  })
);

router.get(
  "/admin/category-icons",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const { rows } = await pool.query(
      `SELECT global_category, image_url, image_public_id, original_filename, mime_type, file_size_bytes, background_image_url, background_image_public_id, background_original_filename, background_mime_type, background_file_size_bytes, updated_at
       FROM project_category_icons
       ORDER BY global_category ASC`
    );
    const byCategory = new Map(rows.map((row) => [row.global_category, row]));
    return res.json({
      icons: Array.from(GLOBAL_CATEGORY_OPTIONS).map((category) =>
        serializeCategoryIcon(byCategory.get(category) || { global_category: category })
      )
    });
  })
);

router.post(
  "/admin/category-icons/:category",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "8mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const globalCategory = normalizeGlobalCategory(req.params.category);
    if (!globalCategory) return res.status(400).json({ detail: "Valid global category is required." });

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

    const file = parsed.files?.icon || parsed.files?.image || parsed.files?.file;
    if (!file?.buffer?.length) return res.status(400).json({ detail: "Category icon image is required." });
    const mimeType = String(file.contentType || "").toLowerCase();
    if (!mimeType.startsWith("image/")) return res.status(400).json({ detail: "Upload an image file." });
    if (Number(file.size || file.buffer.length || 0) > 5 * 1024 * 1024) {
      return res.status(400).json({ detail: "Category icon image must be 5 MB or smaller." });
    }

    const uploaded = await uploadCategoryIcon({ category: globalCategory, file });
    const { rows } = await pool.query(
      `INSERT INTO project_category_icons
         (global_category, image_url, image_public_id, original_filename, mime_type, file_size_bytes, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (global_category) DO UPDATE SET
         image_url = EXCLUDED.image_url,
         image_public_id = EXCLUDED.image_public_id,
         original_filename = EXCLUDED.original_filename,
         mime_type = EXCLUDED.mime_type,
         file_size_bytes = EXCLUDED.file_size_bytes,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING global_category, image_url, image_public_id, original_filename, mime_type, file_size_bytes, updated_at`,
      [globalCategory, uploaded.url, uploaded.publicId, uploaded.originalFilename, uploaded.mimeType, uploaded.size, req.auth.userId]
    );

    return res.json({ message: "Category icon saved.", icon: serializeCategoryIcon(rows[0]) });
  })
);

router.post(
  "/admin/category-icons/:category/background",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "12mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const globalCategory = normalizeGlobalCategory(req.params.category);
    if (!globalCategory) return res.status(400).json({ detail: "Valid global category is required." });

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

    const file = parsed.files?.background || parsed.files?.image || parsed.files?.file;
    if (!file?.buffer?.length) return res.status(400).json({ detail: "Category background image is required." });
    const mimeType = String(file.contentType || "").toLowerCase();
    if (!mimeType.startsWith("image/")) return res.status(400).json({ detail: "Upload an image file." });
    if (Number(file.size || file.buffer.length || 0) > 8 * 1024 * 1024) {
      return res.status(400).json({ detail: "Category background image must be 8 MB or smaller." });
    }

    const uploaded = await uploadCategoryBackground({ category: globalCategory, file });
    const { rows } = await pool.query(
      `INSERT INTO project_category_icons
         (global_category, background_image_url, background_image_public_id, background_original_filename, background_mime_type, background_file_size_bytes, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (global_category) DO UPDATE SET
         background_image_url = EXCLUDED.background_image_url,
         background_image_public_id = EXCLUDED.background_image_public_id,
         background_original_filename = EXCLUDED.background_original_filename,
         background_mime_type = EXCLUDED.background_mime_type,
         background_file_size_bytes = EXCLUDED.background_file_size_bytes,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING global_category, image_url, image_public_id, original_filename, mime_type, file_size_bytes, background_image_url, background_image_public_id, background_original_filename, background_mime_type, background_file_size_bytes, updated_at`,
      [globalCategory, uploaded.url, uploaded.publicId, uploaded.originalFilename, uploaded.mimeType, uploaded.size, req.auth.userId]
    );

    return res.json({ message: "Category background saved.", icon: serializeCategoryIcon(rows[0]) });
  })
);
router.get(
  "/admin/demo-documents",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const { rows } = await pool.query(
      `SELECT id, name, tag, storage_url, storage_public_id, original_filename, mime_type,
              file_size_bytes, is_active, uploaded_by, created_at, updated_at
       FROM demo_documents
       ORDER BY is_active DESC, updated_at DESC, id DESC
       LIMIT 300`
    );
    return res.json({ documents: rows });
  })
);

router.post(
  "/admin/demo-documents",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "50mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

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

    const fields = parsed.fields || {};
    const file = parsed.files?.file || parsed.files?.document || null;
    const name = String(fields.name || fields.title || file?.filename || "").trim().slice(0, 240);
    const tag = String(fields.tag || fields.category || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ detail: "Document name is required." });
    if (!file?.buffer?.length) return res.status(400).json({ detail: "Document upload is required." });

    let inserted = await pool.query(
      `INSERT INTO demo_documents
         (name, tag, original_filename, mime_type, file_size_bytes, is_active, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
       RETURNING id, name, tag, storage_url, storage_public_id, original_filename, mime_type,
                 file_size_bytes, is_active, uploaded_by, created_at, updated_at`,
      [
        name,
        tag,
        String(file.filename || "").trim().slice(0, 255),
        String(file.contentType || "application/octet-stream").slice(0, 120),
        Number(file.size || file.buffer.length || 0),
        req.auth.userId
      ]
    );

    try {
      const uploaded = await uploadDemoDocumentFile({ documentId: inserted.rows[0].id, file });
      inserted = await pool.query(
        `UPDATE demo_documents
         SET storage_url = $2,
             storage_public_id = $3,
             original_filename = $4,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, tag, storage_url, storage_public_id, original_filename, mime_type,
                   file_size_bytes, is_active, uploaded_by, created_at, updated_at`,
        [inserted.rows[0].id, uploaded.url, uploaded.publicId, uploaded.name]
      );
    } catch (error) {
      await pool.query("DELETE FROM demo_documents WHERE id = $1", [inserted.rows[0].id]);
      throw error;
    }

    return res.status(201).json({ message: "Demo document uploaded.", document: inserted.rows[0] });
  })
);

router.get(
  "/admin/demo-documents/:id/preview-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    const { rows } = await pool.query(
      "SELECT id, storage_url, storage_public_id FROM demo_documents WHERE id = $1 LIMIT 1",
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Demo document not found." });
    const doc = rows[0];
    if (doc.storage_public_id) {
      await requireS3ObjectAvailable({ key: doc.storage_public_id });
    }
    const previewUrl = doc.storage_public_id
      ? createPresignedS3GetUrl({ key: doc.storage_public_id, expiresSeconds: 900 })
      : doc.storage_url;
    return res.json({ preview_url: previewUrl });
  })
);

router.patch(
  "/admin/demo-documents/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    const name = Object.prototype.hasOwnProperty.call(req.body || {}, "name")
      ? String(req.body.name || "").trim().slice(0, 240)
      : null;
    const isActive = Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")
      ? normalizeBoolean(req.body.is_active, true)
      : null;
    const tag = Object.prototype.hasOwnProperty.call(req.body || {}, "tag")
      ? String(req.body.tag || "").trim().slice(0, 120)
      : null;
    const { rows } = await pool.query(
      `UPDATE demo_documents
       SET name = CASE WHEN $2::text IS NULL THEN name ELSE $2 END,
           is_active = CASE WHEN $3::boolean IS NULL THEN is_active ELSE $3 END,
           tag = CASE WHEN $4::text IS NULL THEN tag ELSE $4 END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, tag, storage_url, storage_public_id, original_filename, mime_type,
                 file_size_bytes, is_active, uploaded_by, created_at, updated_at`,
      [documentId, name, isActive, tag]
    );
    if (!rows.length) return res.status(404).json({ detail: "Demo document not found." });
    return res.json({ message: "Demo document updated.", document: rows[0] });
  })
);

router.get(
  "/admin/global-documents",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const globalCategory = normalizeGlobalCategory(req.query?.global_category);
    const where = [];
    const params = [];
    if (globalCategory) {
      params.push(globalCategory);
      where.push(`gd.global_category = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT gd.id, gd.global_category, gd.title, gd.document_type, gd.source_type,
              gd.storage_url, gd.storage_public_id, gd.original_filename, gd.raw_text,
              gd.content_hash, gd.status, gd.indexing_error, gd.ingestion_attempted_at,
              gd.version, gd.is_active, gd.uploaded_by, gd.indexed_at, gd.created_at, gd.updated_at,
              COUNT(gdc.id)::integer AS chunk_count
       FROM global_documents gd
       LEFT JOIN global_document_chunks gdc ON gdc.global_document_id = gd.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY gd.id
       ORDER BY gd.created_at DESC, gd.id DESC`,
      params
    );

    return res.json({ documents: rows });
  })
);

router.get(
  "/admin/global-document-access",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const [documentRes, accessRes, settingsRes] = await Promise.all([
      pool.query(
        `SELECT gd.id, gd.global_category, gd.title, gd.document_type, gd.status, gd.is_active,
                COUNT(gdc.id)::integer AS chunk_count
         FROM global_documents gd
         LEFT JOIN global_document_chunks gdc ON gdc.global_document_id = gd.id
         WHERE gd.is_active = TRUE
         GROUP BY gd.id
         ORDER BY gd.global_category ASC, gd.title ASC, gd.id ASC`
      ),
      pool.query(
        `SELECT global_category, global_document_id
         FROM global_category_document_access
         ORDER BY global_category ASC, global_document_id ASC`
      ),
      pool.query(
        `SELECT global_category, is_restricted
         FROM global_category_document_access_settings
         ORDER BY global_category ASC`
      )
    ]);

    return res.json({
      documents: documentRes.rows,
      access_rules: accessRes.rows,
      settings: settingsRes.rows
    });
  })
);

router.put(
  "/admin/global-document-access",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const validCategories = new Set(Array.from(GLOBAL_CATEGORY_OPTIONS).filter(Boolean));
    const documentRows = await pool.query(`SELECT id FROM global_documents WHERE is_active = TRUE`);
    const documentIds = new Set(documentRows.rows.map((row) => Number(row.id)));

    const uniqueRules = [];
    const seen = new Set();
    for (const rule of rules) {
      const globalCategory = normalizeGlobalCategory(rule?.global_category);
      const documentId = Number(rule?.global_document_id ?? rule?.document_id);
      if (!globalCategory || !validCategories.has(globalCategory)) continue;
      if (!Number.isFinite(documentId)) continue;
      if (!documentIds.has(documentId)) return res.status(400).json({ detail: "Invalid global document." });
      const key = `${globalCategory}:${documentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRules.push({ global_category: globalCategory, global_document_id: documentId });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM global_category_document_access`);
      await client.query(
        `INSERT INTO global_category_document_access_settings (
           global_category, is_restricted, created_at, updated_at
         )
         SELECT value, TRUE, NOW(), NOW()
         FROM unnest($1::text[]) AS value
         ON CONFLICT (global_category) DO UPDATE SET
           is_restricted = TRUE,
           updated_at = NOW()`,
        [Array.from(validCategories)]
      );
      for (const rule of uniqueRules) {
        await client.query(
          `INSERT INTO global_category_document_access (
             global_category, global_document_id, created_at, updated_at
           )
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (global_category, global_document_id) DO UPDATE SET
             updated_at = NOW()`,
          [rule.global_category, rule.global_document_id]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      message: "Global document access saved.",
      access_rules: uniqueRules
    });
  })
);
router.post(
  "/admin/global-documents",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "50mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const contentType = String(req.headers["content-type"] || "");
    let fields = req.body || {};
    let file = null;
    if (contentType.includes("multipart/form-data")) {
      try {
        const parsed = parseMultipartFormData({ contentType, bodyBuffer: req.body });
        fields = parsed.fields || {};
        file = parsed.files?.file || parsed.files?.document || null;
      } catch {
        return res.status(400).json({ detail: "Invalid multipart form data." });
      }
    }

    const globalCategory = normalizeGlobalCategory(fields.global_category || fields.category);
    if (!globalCategory) return res.status(400).json({ detail: "Global category is required." });

    const rawText = normalizeDocument(fields.raw_text || fields.content || fields.text);
    let storageUrl = normalizeDocumentUrl(fields.storage_url || fields.document_url || fields.url);
    let storagePublicId = String(fields.storage_public_id || fields.public_id || "").trim().slice(0, 255);
    let originalFilename = String(fields.original_filename || fields.filename || "").trim().slice(0, 255);
    let sourceType = normalizeProjectDocumentSourceType(fields.source_type);
    if (file?.buffer?.length) {
      originalFilename = String(file.filename || originalFilename || "").trim().slice(0, 255);
      sourceType = "upload";
    } else if (!sourceType) {
      sourceType = storageUrl ? "url" : "manual";
    }

    if (!file?.buffer?.length && !storageUrl && !rawText) {
      return res.status(400).json({ detail: "Upload a file, provide storage_url, or provide raw_text." });
    }

    const documentType = normalizeProjectDocumentType(fields.document_type || fields.type);
    const title = normalizeProjectDocumentTitle(fields.title || fields.name, originalFilename || documentType);
    const contentHash = buildProjectDocumentContentHash({ file, storageUrl, rawText });
    const status = normalizeProjectDocumentStatus(fields.status);
    const versionValue = Number(fields.version);
    const version = Number.isFinite(versionValue) ? Math.max(1, Math.min(100000, Math.round(versionValue))) : 1;
    const isActive = fields.is_active === false || String(fields.is_active || "").toLowerCase() === "false" ? false : true;
    const indexedAt = status === "indexed" ? new Date() : null;

    let { rows } = await pool.query(
      `INSERT INTO global_documents (
         global_category, title, document_type, source_type,
         storage_url, storage_public_id, original_filename, raw_text, content_hash,
         status, version, is_active, uploaded_by, indexed_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
       RETURNING id, global_category, title, document_type, source_type,
                 storage_url, storage_public_id, original_filename, raw_text,
                 content_hash, status, indexing_error, ingestion_attempted_at,
                 version, is_active, uploaded_by, indexed_at, created_at, updated_at`,
      [
        globalCategory,
        title,
        documentType,
        sourceType,
        storageUrl,
        storagePublicId,
        originalFilename,
        rawText,
        contentHash,
        status,
        version,
        isActive,
        req.auth.userId,
        indexedAt
      ]
    );

    if (file?.buffer?.length) {
      const documentId = rows[0].id;
      try {
        const uploaded = await uploadGlobalDocumentFile({ category: globalCategory, documentId, file });
        const updated = await pool.query(
          `UPDATE global_documents
           SET storage_url = $2,
               storage_public_id = $3,
               original_filename = $4,
               status = 'uploaded',
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, global_category, title, document_type, source_type,
                     storage_url, storage_public_id, original_filename, raw_text,
                     content_hash, status, indexing_error, ingestion_attempted_at,
                     version, is_active, uploaded_by, indexed_at, created_at, updated_at`,
          [documentId, uploaded.url, uploaded.publicId, uploaded.name]
        );
        rows = updated.rows;
      } catch (error) {
        await pool.query(
          `UPDATE global_documents
           SET status = 'failed',
               indexing_error = $2,
               ingestion_attempted_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [documentId, String(error?.message || "Document upload failed.").slice(0, 2000)]
        );
        throw error;
      }
    }

    scheduleGlobalDocumentAutoIndex(Number(rows[0].id));
    return res.status(201).json({
      message: config.autoIndexProjectDocuments
        ? "Global document created. Auto indexing started."
        : "Global document created.",
      document: rows[0],
      auto_index_queued: !!config.autoIndexProjectDocuments
    });
  })
);

router.post(
  "/admin/global-documents/:id/reindex",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    await pool.query(
      `UPDATE global_documents
       SET status = 'processing',
           indexing_error = '',
           ingestion_attempted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND is_active = TRUE`,
      [documentId]
    );
    const result = await runGlobalDocumentIndexer(documentId);
    return res.json({ message: "Global document reindexed.", result });
  })
);

router.post(
  "/admin/global-documents/:id/archive",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    const { rows } = await pool.query(
      `UPDATE global_documents
       SET status = 'archived',
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, status, is_active`,
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Global document not found." });
    return res.json({ message: "Global document archived.", document: rows[0] });
  })
);

router.delete(
  "/admin/global-documents/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    const deleted = await pool.query("DELETE FROM global_documents WHERE id = $1 RETURNING id, title", [documentId]);
    if (!deleted.rowCount) return res.status(404).json({ detail: "Global document not found." });
    return res.json({ message: "Global document deleted.", document: deleted.rows[0] });
  })
);

router.get(
  "/admin/global-documents/:id/preview-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });
    const { rows } = await pool.query(
      "SELECT id, title, storage_url FROM global_documents WHERE id = $1 LIMIT 1",
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Global document not found." });
    const storageUrl = String(rows[0].storage_url || "").trim();
    if (!storageUrl) return res.status(400).json({ detail: "Document has no file URL." });
    const key = s3KeyFromUrl(storageUrl);
    if (key) await requireS3ObjectAvailable({ key });
    const previewUrl = key ? createPresignedS3GetUrl({ key, expiresSeconds: 600 }) : storageUrl;
    return res.json({ document_id: rows[0].id, title: rows[0].title, preview_url: previewUrl, expires_in_seconds: key ? 600 : null });
  })
);

router.get(
  "/admin/projects/:id/documents",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const projectRes = await pool.query(
      "SELECT id, company_id, title FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });

    const { rows } = await pool.query(
      `SELECT d.id, d.company_id, d.project_id, d.title, d.document_type, d.source_type,
              d.storage_url, d.storage_public_id, d.original_filename, d.raw_text,
              d.scope, d.content_hash, d.status, d.indexing_error, d.ingestion_attempted_at,
              d.version, d.is_active, d.uploaded_by, d.indexed_at,
              d.created_at, d.updated_at,
              pdl.link_type,
              COUNT(DISTINCT dc.id)::integer AS chunk_count,
              COUNT(DISTINCT ada.id)::integer AS access_rule_count
       FROM project_document_links pdl
       INNER JOIN project_documents d ON d.id = pdl.document_id
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       LEFT JOIN agent_document_access ada ON ada.document_id = d.id AND ada.project_id = pdl.project_id
       WHERE pdl.project_id = $1
       GROUP BY d.id, pdl.link_type, pdl.created_at
       ORDER BY pdl.created_at DESC, d.created_at DESC, d.id DESC`,
      [projectId]
    );

    return res.json({ project: projectRes.rows[0], documents: rows });
  })
);

router.post(
  "/admin/projects/:id/documents",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "50mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const projectRes = await pool.query(
      "SELECT id, company_id, title FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });
    const project = projectRes.rows[0];

    const contentType = String(req.headers["content-type"] || "");
    let fields = req.body || {};
    let file = null;
    if (contentType.includes("multipart/form-data")) {
      try {
        const parsed = parseMultipartFormData({ contentType, bodyBuffer: req.body });
        fields = parsed.fields || {};
        file = parsed.files?.file || parsed.files?.document || null;
      } catch {
        return res.status(400).json({ detail: "Invalid multipart form data." });
      }
    }

    const rawText = normalizeDocument(fields.raw_text || fields.content || fields.text);
    let storageUrl = normalizeDocumentUrl(fields.storage_url || fields.document_url || fields.url);
    let storagePublicId = String(fields.storage_public_id || fields.public_id || "").trim().slice(0, 255);
    let originalFilename = String(fields.original_filename || fields.filename || "").trim().slice(0, 255);
    let sourceType = normalizeProjectDocumentSourceType(fields.source_type);

    if (file?.buffer?.length) {
      originalFilename = String(file.filename || originalFilename || "").trim().slice(0, 255);
      sourceType = "upload";
    } else if (!sourceType) {
      sourceType = storageUrl ? "url" : "manual";
    }

    if (!file?.buffer?.length && !storageUrl && !rawText) {
      return res.status(400).json({ detail: "Upload a file, provide storage_url, or provide raw_text." });
    }

    const documentType = normalizeProjectDocumentType(fields.document_type || fields.type);
    const title = normalizeProjectDocumentTitle(fields.title || fields.name, originalFilename || documentType);
    const documentScope = normalizeProjectDocumentScope(fields.document_scope || fields.scope);
    const contentHash = buildProjectDocumentContentHash({ file, storageUrl, rawText });
    const status = normalizeProjectDocumentStatus(fields.status);
    const versionValue = Number(fields.version);
    const version = Number.isFinite(versionValue) ? Math.max(1, Math.min(100000, Math.round(versionValue))) : 1;
    const isActive = fields.is_active === false || String(fields.is_active || "").toLowerCase() === "false" ? false : true;

    if (documentScope === "company") {
      const existingCompanyDoc = await pool.query(
        `SELECT d.id, d.company_id, d.project_id, d.title, d.document_type, d.source_type,
                d.storage_url, d.storage_public_id, d.original_filename, d.raw_text,
                d.scope, d.content_hash, d.status, d.indexing_error, d.ingestion_attempted_at,
                d.version, d.is_active, d.uploaded_by, d.indexed_at, d.created_at, d.updated_at,
                COUNT(dc.id)::integer AS chunk_count
         FROM project_documents d
         LEFT JOIN document_chunks dc ON dc.document_id = d.id
         WHERE d.company_id = $1
           AND d.scope = 'company'
           AND (
             (d.content_hash <> '' AND d.content_hash = $2)
             OR (d.document_type = $3 AND LOWER(TRIM(d.title)) = LOWER(TRIM($4)))
           )
           AND d.is_active = TRUE
         GROUP BY d.id
         ORDER BY d.updated_at DESC, d.id DESC
         LIMIT 1`,
        [project.company_id, contentHash, documentType, title]
      );
      if (existingCompanyDoc.rowCount) {
        const existingDocument = existingCompanyDoc.rows[0];
        await pool.query(
          `INSERT INTO project_document_links (company_id, project_id, document_id, link_type, created_at, updated_at)
           VALUES ($1, $2, $3, 'inherited', NOW(), NOW())
           ON CONFLICT (project_id, document_id) DO UPDATE SET
             link_type = EXCLUDED.link_type,
             updated_at = NOW()`,
          [project.company_id, project.id, existingDocument.id]
        );
        if (String(existingDocument.status || "").toLowerCase() !== "indexed") {
          scheduleProjectDocumentAutoIndex(Number(existingDocument.id));
        }
        return res.status(200).json({
          message: config.autoIndexProjectDocuments && String(existingDocument.status || "").toLowerCase() !== "indexed"
            ? "Company document already exists; linked it to this project and queued indexing."
            : "Company document already exists; linked it to this project.",
          document: { ...existingDocument, link_type: "inherited" },
          reused: true,
          auto_index_queued: config.autoIndexProjectDocuments && String(existingDocument.status || "").toLowerCase() !== "indexed"
        });
      }
    }

    const indexedAt = status === "indexed" ? new Date() : null;
    let { rows } = await pool.query(
      `INSERT INTO project_documents (
         company_id, project_id, title, document_type, source_type,
         storage_url, storage_public_id, original_filename, raw_text, scope, content_hash,
         status, version, is_active, uploaded_by, indexed_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
       RETURNING id, company_id, project_id, title, document_type, source_type,
                 storage_url, storage_public_id, original_filename, raw_text,
                 scope, content_hash, status, indexing_error, ingestion_attempted_at,
                 version, is_active, uploaded_by, indexed_at, created_at, updated_at`,
      [
        project.company_id,
        project.id,
        title,
        documentType,
        sourceType,
        storageUrl,
        storagePublicId,
        originalFilename,
        rawText,
        documentScope,
        contentHash,
        status,
        version,
        isActive,
        req.auth.userId,
        indexedAt
      ]
    );
    await pool.query(
      `INSERT INTO project_document_links (company_id, project_id, document_id, link_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (project_id, document_id) DO NOTHING`,
      [project.company_id, project.id, rows[0].id, documentScope === "company" ? "owner" : "owner"]
    );

    if (file?.buffer?.length) {
      const documentId = rows[0].id;
      try {
        const uploaded = await uploadProjectDocumentFile({
          companyId: project.company_id,
          projectId: project.id,
          documentId,
          scope: documentScope,
          file
        });
        const updated = await pool.query(
          `UPDATE project_documents
           SET storage_url = $2,
               storage_public_id = $3,
               original_filename = $4,
               status = 'uploaded',
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, company_id, project_id, title, document_type, source_type,
                     storage_url, storage_public_id, original_filename, raw_text,
                     scope, content_hash, status, indexing_error, ingestion_attempted_at,
                     version, is_active, uploaded_by, indexed_at, created_at, updated_at`,
          [documentId, uploaded.url, uploaded.publicId, uploaded.name]
        );
        rows = updated.rows;
      } catch (error) {
        await pool.query(
          `UPDATE project_documents
           SET status = 'failed',
               indexing_error = $2,
               ingestion_attempted_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [documentId, String(error?.message || "Document upload failed.").slice(0, 2000)]
        );
        throw error;
      }
    }

    scheduleProjectDocumentAutoIndex(Number(rows[0].id));

    return res.status(201).json({
      message: config.autoIndexProjectDocuments
        ? "Project document created. Auto indexing started."
        : "Project document created.",
      document: rows[0],
      auto_index_queued: !!config.autoIndexProjectDocuments
    });
  })
);

router.get(
  "/admin/projects/:id/agent-document-access",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    await ensureMentorSchema();

    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const projectRes = await pool.query(
      "SELECT id, company_id, title FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });

    const [mentorRes, documentRes, accessRes] = await Promise.all([
      pool.query(
        `SELECT id, agent_key, mentor_name, role, is_hidden, output_format
         FROM project_mentors
         ORDER BY is_hidden ASC, id ASC`
      ),
      pool.query(
        `SELECT d.id, d.company_id, d.project_id, d.title, d.document_type,
                d.scope, d.status, d.is_active, pdl.link_type
         FROM project_document_links pdl
         INNER JOIN project_documents d ON d.id = pdl.document_id
         WHERE pdl.project_id = $1
           AND d.is_active = TRUE
         ORDER BY d.scope ASC, d.id ASC`,
        [projectId]
      ),
      pool.query(
        `SELECT id, company_id, project_id, mentor_id, document_id, access_level, created_at, updated_at
         FROM agent_document_access
         WHERE project_id = $1
         ORDER BY mentor_id ASC, document_id ASC`,
        [projectId]
      )
    ]);

    return res.json({
      project: projectRes.rows[0],
      mentors: mentorRes.rows,
      documents: documentRes.rows,
      access_rules: accessRes.rows
    });
  })
);

router.put(
  "/admin/projects/:id/agent-document-access",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();
    await ensureMentorSchema();

    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const projectRes = await pool.query(
      "SELECT id, company_id, title FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });
    const project = projectRes.rows[0];

    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const normalizedRules = rules
      .map((rule) => ({
        mentor_id: Number(rule?.mentor_id),
        document_id: Number(rule?.document_id),
        access_level: normalizeAgentDocumentAccessLevel(rule?.access_level)
      }))
      .filter((rule) => Number.isFinite(rule.mentor_id) && Number.isFinite(rule.document_id));

    const mentorRows = await pool.query("SELECT id FROM project_mentors");
    const documentRows = await pool.query(
      `SELECT d.id
       FROM project_document_links pdl
       INNER JOIN project_documents d ON d.id = pdl.document_id
       WHERE pdl.project_id = $1
         AND d.is_active = TRUE`,
      [projectId]
    );
    const mentorIds = new Set(mentorRows.rows.map((row) => Number(row.id)));
    const documentIds = new Set(documentRows.rows.map((row) => Number(row.id)));

    for (const rule of normalizedRules) {
      if (!mentorIds.has(rule.mentor_id)) return res.status(400).json({ detail: "Invalid mentor in access rules." });
      if (!documentIds.has(rule.document_id)) return res.status(400).json({ detail: "Invalid document in access rules." });
    }

    const uniqueRules = [];
    const seen = new Set();
    for (const rule of normalizedRules) {
      const key = `${rule.mentor_id}:${rule.document_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRules.push(rule);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM agent_document_access WHERE project_id = $1", [projectId]);
      for (const rule of uniqueRules) {
        await client.query(
          `INSERT INTO agent_document_access (
             company_id, project_id, mentor_id, document_id, access_level, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (mentor_id, project_id, document_id) DO UPDATE SET
             access_level = EXCLUDED.access_level,
             updated_at = NOW()`,
          [project.company_id, project.id, rule.mentor_id, rule.document_id, rule.access_level]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const accessRes = await pool.query(
      `SELECT id, company_id, project_id, mentor_id, document_id, access_level, created_at, updated_at
       FROM agent_document_access
       WHERE project_id = $1
       ORDER BY mentor_id ASC, document_id ASC`,
      [projectId]
    );

    return res.json({ message: "Agent document access updated.", access_rules: accessRes.rows });
  })
);

router.post(
  "/admin/project-documents/:id/reindex",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });

    const existing = await pool.query(
      "SELECT id, is_active FROM project_documents WHERE id = $1 LIMIT 1",
      [documentId]
    );
    if (!existing.rowCount) return res.status(404).json({ detail: "Document not found." });
    if (!existing.rows[0].is_active) {
      return res.status(400).json({ detail: "Archived documents cannot be re-indexed." });
    }

    await pool.query(
      `UPDATE project_documents
       SET status = 'uploaded',
           indexing_error = '',
           ingestion_attempted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [documentId]
    );

    let indexerOutput = null;
    try {
      indexerOutput = await runProjectDocumentIndexer(documentId);
    } catch (error) {
      await pool.query(
        `UPDATE project_documents
         SET status = 'failed',
             indexing_error = $2,
             ingestion_attempted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [documentId, String(error?.message || "Indexer command failed.").slice(0, 2000)]
      );
      throw error;
    }

    const { rows } = await pool.query(
      `SELECT d.id, d.company_id, d.project_id, d.title, d.document_type, d.source_type,
              d.storage_url, d.storage_public_id, d.original_filename,
              d.scope, d.content_hash, d.status, d.indexing_error, d.ingestion_attempted_at,
              d.version, d.is_active, d.indexed_at, d.created_at, d.updated_at,
              COUNT(dc.id)::integer AS chunk_count
       FROM project_documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE d.id = $1
       GROUP BY d.id
       LIMIT 1`,
      [documentId]
    );

    const document = rows[0];
    if (!document || document.status !== "indexed") {
      return res.status(422).json({
        detail: document?.indexing_error || "Document indexing failed.",
        document,
        indexer: indexerOutput
      });
    }

    return res.json({ message: "Document re-index completed.", document: rows[0], indexer: indexerOutput });
  })
);

router.post(
  "/admin/project-documents/:id/archive",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });

    const { rows } = await pool.query(
      `UPDATE project_documents
       SET status = 'archived',
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, title, status, is_active`,
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Document not found." });
    await pool.query("DELETE FROM agent_document_access WHERE document_id = $1", [documentId]);

    return res.json({ message: "Document archived.", document: rows[0] });
  })
);

router.delete(
  "/admin/project-documents/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });

    const deleted = await pool.query(
      "DELETE FROM project_documents WHERE id = $1 RETURNING id, project_id, title",
      [documentId]
    );
    if (!deleted.rowCount) return res.status(404).json({ detail: "Document not found." });
    return res.json({ message: "Document deleted.", document: deleted.rows[0] });
  })
);

router.get(
  "/admin/project-documents/:id/preview-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureDocumentArchitectureSchema();

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) return res.status(400).json({ detail: "Invalid document id." });

    const { rows } = await pool.query(
      "SELECT id, title, storage_url FROM project_documents WHERE id = $1 LIMIT 1",
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Document not found." });
    const document = rows[0];
    const storageUrl = String(document.storage_url || "").trim();
    if (!storageUrl) return res.status(400).json({ detail: "Document has no file URL." });

    const key = s3KeyFromUrl(storageUrl);
    if (key) {
      await requireS3ObjectAvailable({ key });
    }
    const previewUrl = key ? createPresignedS3GetUrl({ key, expiresSeconds: 600 }) : storageUrl;
    return res.json({ document_id: document.id, title: document.title, preview_url: previewUrl, expires_in_seconds: key ? 600 : null });
  })
);

router.post(
  "/admin/project-assign",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();

    const userId = Number(req.body?.user_id);
    const projectId = Number(req.body?.project_id);
    const requestId = req.body?.request_id != null ? Number(req.body.request_id) : null;
    if (!Number.isFinite(userId) || !Number.isFinite(projectId)) {
      return res.status(400).json({ detail: "user_id and project_id are required." });
    }

    const userRes = await pool.query("SELECT id, public_id, has_paid FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userRes.rowCount) return res.status(404).json({ detail: "User not found." });

    const projectRes = await pool.query(
      `SELECT id, title, description, category, global_category, timeline_weeks, project_coins, is_active, steps_json
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    );
    if (!projectRes.rowCount) return res.status(404).json({ detail: "Project not found." });
    const project = projectRes.rows[0];

    const existing = await pool.query(
      "SELECT project_name, current_step FROM project_progress WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [userId]
    );
    if (existing.rowCount) {
      const currentStep = Number(existing.rows[0].current_step) || 1;
      if (currentStep < 5 && existing.rows[0].project_name !== project.title) {
        return res.status(409).json({ detail: "User already has an ongoing project. Finish it first." });
      }
    }

    await pool.query(
      `INSERT INTO project_progress (user_id, project_name, current_step, completed_tasks)
       VALUES ($1, $2, 1, '')
       ON CONFLICT (user_id, project_name) DO NOTHING`,
      [userId, project.title]
    );

    if (Number.isFinite(requestId)) {
      await pool.query(
        `UPDATE project_assignment_requests
         SET status = 'assigned',
             assigned_project_id = $2,
             resolved_at = NOW(),
             resolved_by = $3
         WHERE id = $1`,
        [requestId, project.id, req.auth.userId]
      );
    }

    return res.json({
      message: "Project assigned.",
      assignment: {
        user_id: userRes.rows[0].id,
        user_public_id: userRes.rows[0].public_id,
        project_id: project.id,
        project_name: project.title
      },
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        category: project.category,
        timeline_weeks: project.timeline_weeks,
        project_coins: project.project_coins,
        is_active: project.is_active,
        steps: Array.isArray(project.steps_json) ? project.steps_json : []
      }
    });
  })
);

router.post(
  "/admin/projects",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureDocumentArchitectureSchema();

    const title = String(req.body?.title || "").trim().slice(0, 160);
    const description = String(req.body?.description || "").trim();
    const timelineWeeks = normalizeTimelineWeeks(req.body?.timeline_weeks);
    const projectCoins = normalizeProjectCoins(req.body?.project_coins);
    const category = normalizeCategory(req.body?.category);
    const globalCategory = normalizeGlobalCategory(req.body?.global_category);
    const complexity = normalizeProjectTextField(req.body?.complexity, 40);
    const keywords = normalizeProjectTextField(req.body?.keywords);
    const skillsRequired = normalizeProjectTextField(req.body?.skills_required);
    const skillsGained = normalizeProjectTextField(req.body?.skills_gained);
    const targetBranch = normalizeProjectTextField(req.body?.target_branch);
    const targetYear = normalizeProjectTextField(req.body?.target_year);
    const techStack = normalizeProjectTextField(req.body?.tech_stack);
    const shortSummary = normalizeProjectTextField(req.body?.short_summary);
    const domain = normalizeProjectTextField(req.body?.domain, 80);
    const prerequisites = normalizeProjectTextField(req.body?.prerequisites);
    const learningOutcomes = normalizeProjectTextField(req.body?.learning_outcomes);
    const difficultyScore = normalizeDifficultyScore(req.body?.difficulty_score);
    const isActive = req.body?.is_active === false ? false : true;
    const isDemoProject = normalizeBoolean(req.body?.is_demo_project, false);
    const introductionDocument = normalizeDocument(req.body?.introduction_document);
    const introductionDocumentUrl = normalizeDocumentUrl(req.body?.introduction_document_url);
    const privateBrdDocument = normalizeDocument(req.body?.private_brd_document);
    const privateBrdDocumentUrl = normalizeDocumentUrl(req.body?.private_brd_document_url);
    const solutionDocument = normalizeDocument(req.body?.solution_document);
    const solutionDocumentUrl = normalizeDocumentUrl(req.body?.solution_document_url);
    const companyProfileText = normalizeDocument(req.body?.company_profile_text);
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

    if (!title) {
      return res.status(400).json({ detail: "Project title is required." });
    }
    if (!description) {
      return res.status(400).json({ detail: "Project description is required." });
    }

    const normalizedSteps = steps
      .map((s, idx) => ({
        step_order: idx + 1,
        title: normalizeStepTitle(s?.title || s?.name),
        agent_key: normalizeAgentKey(s?.agent_key || s?.agent),
        step_context: String(s?.step_context || s?.context || "").trim(),
        duration_value: normalizeDurationValue(s?.duration_value),
        duration_max_value: normalizeDurationMaxValue(s?.duration_value, s?.duration_max_value ?? s?.duration_value),
        duration_unit: normalizeDurationUnit(s?.duration_unit),
        phase_context: String(s?.phase_context || "").trim().slice(0, 12000),
        stages: normalizeStoredStages(s?.stages)
      }))
      .filter((s) => s.title);

    if (!normalizedSteps.length) {
      return res.status(400).json({ detail: "At least one step is required." });
    }

    const durationError = validateProjectTimelineDuration({ timelineWeeks, steps: normalizedSteps });
    if (durationError) {
      return res.status(400).json({ detail: durationError });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const requestedCompanyId = Number(req.body?.company_id);
      let companyId = Number.isFinite(requestedCompanyId) ? Math.round(requestedCompanyId) : await getDefaultCompanyId(client);
      if (Number.isFinite(requestedCompanyId)) {
        const companyRes = await client.query(
          "SELECT id FROM companies WHERE id = $1 AND is_active = TRUE LIMIT 1",
          [companyId]
        );
        if (!companyRes.rowCount) {
          const error = new Error("Selected company was not found.");
          error.statusCode = 400;
          throw error;
        }
      }
      if (!companyId) {
        const error = new Error("Default company is not configured.");
        error.statusCode = 500;
        throw error;
      }

      const inserted = await client.query(
        `INSERT INTO projects (
           company_id, title, description, timeline_weeks, project_coins, category, global_category, is_active, is_demo_project,
           complexity, keywords, skills_required, skills_gained, target_branch, target_year,
           tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
           introduction_document, introduction_document_url,
           private_brd_document, private_brd_document_url,
           solution_document, solution_document_url,
           company_profile_text,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW())
         RETURNING id, title, description, timeline_weeks, project_coins, category, global_category, is_active, is_demo_project,
                   complexity, keywords, skills_required, skills_gained, target_branch, target_year,
                   tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
                   introduction_document, introduction_document_url,
                   private_brd_document, private_brd_document_url,
                   solution_document, solution_document_url,
           company_profile_text,
           created_at, updated_at`,
        [
          companyId,
          title,
          description,
          timelineWeeks,
          projectCoins,
          category,
          globalCategory,
          isActive,
          isDemoProject,
          complexity,
          keywords,
          skillsRequired,
          skillsGained,
          targetBranch,
          targetYear,
          techStack,
          shortSummary,
          domain,
          prerequisites,
          learningOutcomes,
          difficultyScore,
          introductionDocument,
          introductionDocumentUrl,
          privateBrdDocument,
          privateBrdDocumentUrl,
          solutionDocument,
          solutionDocumentUrl,
          companyProfileText
        ]
      );
      const project = inserted.rows[0];

      for (const step of normalizedSteps) {
        await client.query(
          `INSERT INTO project_steps (project_id, step_order, title, agent_key, step_context, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [project.id, step.step_order, step.title, step.agent_key, step.step_context]
        );
      }

      await client.query("UPDATE projects SET steps_json = $2::jsonb, updated_at = NOW() WHERE id = $1", [
        project.id,
        JSON.stringify(
          normalizedSteps.map((s) => ({
            step_order: s.step_order,
            title: s.title,
            agent_key: s.agent_key,
            duration_value: s.duration_value,
            duration_max_value: s.duration_max_value,
            duration_unit: s.duration_unit,
            step_context: s.step_context,
            phase_context: s.phase_context,
            stages: s.stages
          }))
        )
      ]);

      await client.query("COMMIT");

      const full = await pool.query(
        `SELECT id, title, description, timeline_weeks, project_coins, category, global_category, is_active, is_demo_project,
                complexity, keywords, skills_required, skills_gained, target_branch, target_year,
                tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
                introduction_document, introduction_document_url,
                private_brd_document, private_brd_document_url,
                solution_document, solution_document_url,
           company_profile_text,
           created_at, updated_at,
                steps_json AS steps
         FROM projects
         WHERE id = $1
         LIMIT 1`,
        [project.id]
      );

      return res.status(201).json({ message: "Project created.", project: full.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/admin/projects/bulk-upload",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "8mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureDocumentArchitectureSchema();

    let parsed;
    try {
      parsed = parseMultipartFormData({
        contentType: req.headers["content-type"],
        bodyBuffer: req.body
      });
    } catch {
      return res.status(400).json({ detail: "Upload a valid CSV file." });
    }

    const file = parsed.files?.file || parsed.files?.csv || parsed.files?.projects;
    if (!file) return res.status(400).json({ detail: "CSV file is required." });
    const filename = String(file.filename || "").toLowerCase();
    if (filename && !filename.endsWith(".csv")) {
      return res.status(400).json({ detail: "Only .csv files are supported." });
    }

    const rows = csvRowsToObjects(file.buffer.toString("utf8"));
    if (!rows.length) {
      return res.status(400).json({ detail: "CSV has no data rows." });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ detail: "CSV can contain at most 2000 stage rows." });
    }

    const errors = [];
    const projectsByKey = new Map();
    const companyIds = new Set();
    const demoDocumentIds = new Set();

    for (const row of rows) {
      const rowNumber = row.__rowNumber;
      const projectTitle = normalizeProjectTitle(pickCsvValue(row, ["project_title", "title"]));
      const description = normalizeProjectDescription(pickCsvValue(row, ["description", "project_description"]));
      const companyId = parsePositiveCsvInteger(pickCsvValue(row, ["company_id"]));
      const phaseOrder = parsePositiveCsvInteger(pickCsvValue(row, ["phase_order", "step_order"]));
      const phaseTitle = normalizeStepTitle(pickCsvValue(row, ["phase_title", "step_title"]));
      const stageOrder = parsePositiveCsvInteger(pickCsvValue(row, ["stage_order"]));
      const stageTitle = String(pickCsvValue(row, ["stage_title", "stage_name"]) || "").slice(0, 240);
      const demoDocumentRaw = pickCsvValue(row, ["demo_document_ids", "demo_document_id"]);
      const demoDocumentIdsForStage = parsePositiveCsvIntegerList(demoDocumentRaw);
      const demoDocumentId = Array.isArray(demoDocumentIdsForStage) ? (demoDocumentIdsForStage[0] || null) : null;

      if (!projectTitle) errors.push({ row: rowNumber, detail: "project_title is required." });
      if (!description) errors.push({ row: rowNumber, detail: "description is required." });
      if (!companyId) errors.push({ row: rowNumber, detail: "company_id must be a valid existing id." });
      if (!phaseOrder) errors.push({ row: rowNumber, detail: "phase_order must be a positive number." });
      if (!phaseTitle) errors.push({ row: rowNumber, detail: "phase_title is required." });
      if (!stageOrder) errors.push({ row: rowNumber, detail: "stage_order must be a positive number." });
      if (!stageTitle) errors.push({ row: rowNumber, detail: "stage_title is required." });
      if (demoDocumentRaw && !Array.isArray(demoDocumentIdsForStage)) {
        errors.push({ row: rowNumber, detail: "demo_document_ids must contain positive numbers when provided." });
      }
      if (errors.some((error) => error.row === rowNumber)) continue;

      companyIds.add(companyId);
      if (Array.isArray(demoDocumentIdsForStage)) {
        demoDocumentIdsForStage.forEach((id) => demoDocumentIds.add(id));
      }

      const projectCode = pickCsvValue(row, ["project_code", "code"]);
      const projectKey = projectCode || `${companyId}::${projectTitle.toLowerCase()}`;
      if (!projectsByKey.has(projectKey)) {
        projectsByKey.set(projectKey, {
          title: projectTitle,
          description,
          company_id: companyId,
          category: normalizeCategory(pickCsvValue(row, ["category"])),
          global_category: normalizeGlobalCategory(pickCsvValue(row, ["global_category", "rag_category", "document_category"])),
          timeline_weeks: normalizeTimelineWeeks(pickCsvValue(row, ["timeline_weeks"])),
          project_coins: normalizeProjectCoins(pickCsvValue(row, ["project_coins"])),
          complexity: normalizeProjectTextField(pickCsvValue(row, ["complexity", "difficulty_level", "level"]), 40),
          keywords: normalizeProjectTextField(pickCsvValue(row, ["keywords", "tags"])),
          skills_required: normalizeProjectTextField(pickCsvValue(row, ["skills_required", "required_skills"])),
          skills_gained: normalizeProjectTextField(pickCsvValue(row, ["skills_gained", "learning_skills"])),
          target_branch: normalizeProjectTextField(pickCsvValue(row, ["target_branch", "branch"])),
          target_year: normalizeProjectTextField(pickCsvValue(row, ["target_year", "year"])),
          tech_stack: normalizeProjectTextField(pickCsvValue(row, ["tech_stack", "technology_stack"])),
          short_summary: normalizeProjectTextField(pickCsvValue(row, ["short_summary", "summary"])),
          domain: normalizeProjectTextField(pickCsvValue(row, ["domain"]), 80),
          prerequisites: normalizeProjectTextField(pickCsvValue(row, ["prerequisites"])),
          learning_outcomes: normalizeProjectTextField(pickCsvValue(row, ["learning_outcomes"])),
          difficulty_score: normalizeDifficultyScore(pickCsvValue(row, ["difficulty_score"])),
          is_active: normalizeBoolean(pickCsvValue(row, ["is_active"]), true),
          is_demo_project: normalizeBoolean(pickCsvValue(row, ["is_demo_project"]), false),
          introduction_document: normalizeDocument(pickCsvValue(row, ["introduction_document"])),
          introduction_document_url: normalizeDocumentUrl(pickCsvValue(row, ["introduction_document_url"])),
          private_brd_document: normalizeDocument(pickCsvValue(row, ["private_brd_document"])),
          private_brd_document_url: normalizeDocumentUrl(pickCsvValue(row, ["private_brd_document_url"])),
          solution_document: normalizeDocument(pickCsvValue(row, ["solution_document"])),
          solution_document_url: normalizeDocumentUrl(pickCsvValue(row, ["solution_document_url"])),
          company_profile_text: normalizeDocument(pickCsvValue(row, ["company_profile_text"])),
          phases: new Map(),
          rowNumbers: []
        });
      }

      const project = projectsByKey.get(projectKey);
      project.rowNumbers.push(rowNumber);
      if (project.company_id !== companyId) {
        errors.push({ row: rowNumber, detail: "Rows for the same project_code must use the same company_id." });
        continue;
      }

      const phaseKey = String(phaseOrder);
      if (!project.phases.has(phaseKey)) {
        project.phases.set(phaseKey, {
          order: phaseOrder,
          title: phaseTitle,
          agent_key: normalizeAgentKey(pickCsvValue(row, ["phase_agent_key", "agent_key"])),
          duration_value: normalizeDurationValue(pickCsvValue(row, ["phase_duration_min", "duration_value"])),
          duration_max_value: normalizeDurationMaxValue(
            pickCsvValue(row, ["phase_duration_min", "duration_value"]),
            pickCsvValue(row, ["phase_duration_max", "duration_max_value", "phase_duration_min", "duration_value"])
          ),
          duration_unit: normalizeDurationUnit(pickCsvValue(row, ["phase_duration_unit", "duration_unit"])),
          context: String(pickCsvValue(row, ["phase_context", "step_context"]) || "").slice(0, 12000),
          stages: new Map()
        });
      }

      const phase = project.phases.get(phaseKey);
      if (phase.title !== phaseTitle) {
        errors.push({ row: rowNumber, detail: "Rows with the same phase_order must use the same phase_title." });
        continue;
      }
      if (phase.stages.has(String(stageOrder))) {
        errors.push({ row: rowNumber, detail: "Duplicate stage_order inside the same project phase." });
        continue;
      }
      phase.stages.set(String(stageOrder), {
        order: stageOrder,
        title: stageTitle,
        agent_key: normalizeAgentKey(pickCsvValue(row, ["stage_agent_key", "phase_agent_key", "agent_key"])),
        context: String(pickCsvValue(row, ["stage_instructions", "stage_context", "instructions", "context"]) || "").slice(0, 12000),
        objective: String(pickCsvValue(row, ["stage_objective", "objective"]) || "").slice(0, 4000),
        deliverable: String(pickCsvValue(row, ["stage_deliverable", "deliverable"]) || "").slice(0, 4000),
        document_required: normalizeBoolean(pickCsvValue(row, ["document_required"]), false),
        link_submission_required: normalizeBoolean(pickCsvValue(row, ["link_submission_required"]), false),
        github_integration_required: normalizeBoolean(pickCsvValue(row, ["github_integration_required", "github_required"]), false),
        demo_document_id: demoDocumentId,
        demo_document_ids: Array.isArray(demoDocumentIdsForStage) ? demoDocumentIdsForStage : []
      });
    }

    if (companyIds.size) {
      const companyRes = await pool.query(
        "SELECT id FROM companies WHERE id = ANY($1::int[]) AND is_active = TRUE",
        [[...companyIds]]
      );
      const validCompanies = new Set(companyRes.rows.map((row) => Number(row.id)));
      for (const companyId of companyIds) {
        if (!validCompanies.has(companyId)) {
          errors.push({ row: null, detail: `company_id ${companyId} was not found or is inactive.` });
        }
      }
    }

    if (demoDocumentIds.size) {
      const demoRes = await pool.query(
        "SELECT id FROM demo_documents WHERE id = ANY($1::int[]) AND is_active = TRUE",
        [[...demoDocumentIds]]
      );
      const validDemoDocuments = new Set(demoRes.rows.map((row) => Number(row.id)));
      for (const demoDocumentId of demoDocumentIds) {
        if (!validDemoDocuments.has(demoDocumentId)) {
          errors.push({ row: null, detail: `demo_document_id ${demoDocumentId} was not found or is inactive.` });
        }
      }
    }

    for (const project of projectsByKey.values()) {
      const phases = [...project.phases.values()];
      const durationError = validateProjectTimelineDuration({
        timelineWeeks: project.timeline_weeks,
        steps: phases,
        label: `Project "${project.title}"`
      });
      if (durationError) {
        errors.push({ row: project.rowNumbers[0] || null, detail: durationError });
      }
    }

    if (errors.length) {
      return res.status(400).json({
        detail: "CSV validation failed. No projects were created.",
        message: "Fix the listed rows and upload the CSV again.",
        errors: errors.slice(0, 100),
        totals: {
          rows: rows.length,
          projects: projectsByKey.size,
          phases: [...projectsByKey.values()].reduce((sum, project) => sum + project.phases.size, 0)
        }
      });
    }

    const client = await pool.connect();
    const insertedProjects = [];
    let insertedPhases = 0;
    let insertedStages = 0;
    try {
      await client.query("BEGIN");
      for (const project of projectsByKey.values()) {
        const inserted = await client.query(
          `INSERT INTO projects (
             company_id, title, description, timeline_weeks, project_coins, category, global_category, is_active, is_demo_project,
             complexity, keywords, skills_required, skills_gained, target_branch, target_year,
             tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
             introduction_document, introduction_document_url,
             private_brd_document, private_brd_document_url,
             solution_document, solution_document_url,
             company_profile_text,
             created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW())
           RETURNING id, title`,
          [
            project.company_id,
            project.title,
            project.description,
            project.timeline_weeks,
            project.project_coins,
            project.category,
            project.global_category,
            project.is_active,
            project.is_demo_project,
            project.complexity,
            project.keywords,
            project.skills_required,
            project.skills_gained,
            project.target_branch,
            project.target_year,
            project.tech_stack,
            project.short_summary,
            project.domain,
            project.prerequisites,
            project.learning_outcomes,
            project.difficulty_score,
            project.introduction_document,
            project.introduction_document_url,
            project.private_brd_document,
            project.private_brd_document_url,
            project.solution_document,
            project.solution_document_url,
            project.company_profile_text
          ]
        );
        const projectRow = inserted.rows[0];
        const normalizedSteps = [...project.phases.values()]
          .sort((a, b) => a.order - b.order)
          .map((phase, index) => {
            const stages = [...phase.stages.values()].sort((a, b) => a.order - b.order);
            insertedStages += stages.length;
            return {
              step_order: index + 1,
              title: phase.title,
              agent_key: phase.agent_key,
              duration_value: phase.duration_value,
              duration_max_value: phase.duration_max_value,
              duration_unit: phase.duration_unit,
              step_context: buildImportedStepContext({ phase, stages })
            };
          });

        for (const step of normalizedSteps) {
          await client.query(
            `INSERT INTO project_steps (project_id, step_order, title, agent_key, step_context, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [projectRow.id, step.step_order, step.title, step.agent_key, step.step_context]
          );
        }
        insertedPhases += normalizedSteps.length;
        await client.query("UPDATE projects SET steps_json = $2::jsonb, updated_at = NOW() WHERE id = $1", [
          projectRow.id,
          JSON.stringify(normalizedSteps)
        ]);
        insertedProjects.push(projectRow);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      message: `Bulk upload complete. Created ${insertedProjects.length} projects, ${insertedPhases} phases, and ${insertedStages} stages.`,
      totals: {
        rows: rows.length,
        projects: insertedProjects.length,
        phases: insertedPhases,
        stages: insertedStages
      },
      projects: insertedProjects
    });
  })
);

router.patch(
  "/admin/projects/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const { rows: existing } = await pool.query("SELECT id, is_active FROM projects WHERE id = $1 LIMIT 1", [projectId]);
    if (!existing.length) return res.status(404).json({ detail: "Project not found." });

    const isActive = req.body?.is_active;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ detail: "is_active boolean is required." });
    }

    await pool.query("UPDATE projects SET is_active = $2, updated_at = NOW() WHERE id = $1", [projectId, isActive]);
    return res.json({ message: "Project updated." });
  })
);

router.get(
  "/admin/projects/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureDocumentArchitectureSchema();
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const { rows } = await pool.query(
      `SELECT id, title, description, timeline_weeks, category, global_category, is_active,
              project_coins,
              is_demo_project,
              complexity, keywords, skills_required, skills_gained, target_branch, target_year,
              tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
              introduction_document, introduction_document_url,
              private_brd_document, private_brd_document_url,
              solution_document, solution_document_url,
           company_profile_text,
           created_at, updated_at,
              steps_json AS steps
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    );

    if (!rows.length) return res.status(404).json({ detail: "Project not found." });
    return res.json({ project: rows[0] });
  })
);

router.put(
  "/admin/projects/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    await ensureDocumentArchitectureSchema();
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const { rows: existing } = await pool.query("SELECT id FROM projects WHERE id = $1 LIMIT 1", [projectId]);
    if (!existing.length) return res.status(404).json({ detail: "Project not found." });

    const title = normalizeProjectTitle(req.body?.title);
    const description = normalizeProjectDescription(req.body?.description);
    const timelineWeeks = normalizeTimelineWeeks(req.body?.timeline_weeks);
    const projectCoins = normalizeProjectCoins(req.body?.project_coins);
    const category = normalizeCategory(req.body?.category);
    const globalCategory = normalizeGlobalCategory(req.body?.global_category);
    const complexity = normalizeProjectTextField(req.body?.complexity, 40);
    const keywords = normalizeProjectTextField(req.body?.keywords);
    const skillsRequired = normalizeProjectTextField(req.body?.skills_required);
    const skillsGained = normalizeProjectTextField(req.body?.skills_gained);
    const targetBranch = normalizeProjectTextField(req.body?.target_branch);
    const targetYear = normalizeProjectTextField(req.body?.target_year);
    const techStack = normalizeProjectTextField(req.body?.tech_stack);
    const shortSummary = normalizeProjectTextField(req.body?.short_summary);
    const domain = normalizeProjectTextField(req.body?.domain, 80);
    const prerequisites = normalizeProjectTextField(req.body?.prerequisites);
    const learningOutcomes = normalizeProjectTextField(req.body?.learning_outcomes);
    const difficultyScore = normalizeDifficultyScore(req.body?.difficulty_score);
    const isActive = typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined;
    const isDemoProject = normalizeBoolean(req.body?.is_demo_project, false);
    const introductionDocument = normalizeDocument(req.body?.introduction_document);
    const introductionDocumentUrl = normalizeDocumentUrl(req.body?.introduction_document_url);
    const privateBrdDocument = normalizeDocument(req.body?.private_brd_document);
    const privateBrdDocumentUrl = normalizeDocumentUrl(req.body?.private_brd_document_url);
    const solutionDocument = normalizeDocument(req.body?.solution_document);
    const solutionDocumentUrl = normalizeDocumentUrl(req.body?.solution_document_url);
    const companyProfileText = normalizeDocument(req.body?.company_profile_text);
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

    if (!title) return res.status(400).json({ detail: "Project title is required." });
    if (!description) return res.status(400).json({ detail: "Project description is required." });

    const normalizedSteps = steps
      .map((s, idx) => ({
        step_order: idx + 1,
        title: normalizeStepTitle(s?.title || s?.name),
        agent_key: normalizeAgentKey(s?.agent_key || s?.agent),
        step_context: String(s?.step_context || s?.context || "").trim(),
        duration_value: normalizeDurationValue(s?.duration_value),
        duration_max_value: normalizeDurationMaxValue(s?.duration_value, s?.duration_max_value ?? s?.duration_value),
        duration_unit: normalizeDurationUnit(s?.duration_unit),
        phase_context: String(s?.phase_context || "").trim().slice(0, 12000),
        stages: normalizeStoredStages(s?.stages)
      }))
      .filter((s) => s.title);

    if (!normalizedSteps.length) {
      return res.status(400).json({ detail: "At least one step is required." });
    }

    const durationError = validateProjectTimelineDuration({ timelineWeeks, steps: normalizedSteps });
    if (durationError) {
      return res.status(400).json({ detail: durationError });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE projects
         SET title = $2,
             description = $3,
             timeline_weeks = $4,
             project_coins = $5,
             category = $6,
             global_category = $7,
             is_demo_project = $8,
             complexity = $9,
             keywords = $10,
             skills_required = $11,
             skills_gained = $12,
             target_branch = $13,
             target_year = $14,
             tech_stack = $15,
             short_summary = $16,
             domain = $17,
             prerequisites = $18,
             learning_outcomes = $19,
             difficulty_score = $20,
             introduction_document = $21,
             introduction_document_url = $22,
             private_brd_document = $23,
             private_brd_document_url = $24,
             solution_document = $25,
             solution_document_url = $26,
             company_profile_text = $27,
             updated_at = NOW()
         WHERE id = $1`,
        [
          projectId,
          title,
          description,
          timelineWeeks,
          projectCoins,
          category,
          globalCategory,
          isDemoProject,
          complexity,
          keywords,
          skillsRequired,
          skillsGained,
          targetBranch,
          targetYear,
          techStack,
          shortSummary,
          domain,
          prerequisites,
          learningOutcomes,
          difficultyScore,
          introductionDocument,
          introductionDocumentUrl,
          privateBrdDocument,
          privateBrdDocumentUrl,
          solutionDocument,
          solutionDocumentUrl,
          companyProfileText
        ]
      );

      if (typeof isActive === "boolean") {
        await client.query("UPDATE projects SET is_active = $2, updated_at = NOW() WHERE id = $1", [projectId, isActive]);
      }

      await client.query("DELETE FROM project_steps WHERE project_id = $1", [projectId]);
      for (const step of normalizedSteps) {
        await client.query(
          `INSERT INTO project_steps (project_id, step_order, title, agent_key, step_context, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [projectId, step.step_order, step.title, step.agent_key, step.step_context]
        );
      }

      await client.query("UPDATE projects SET steps_json = $2::jsonb, updated_at = NOW() WHERE id = $1", [
        projectId,
        JSON.stringify(
          normalizedSteps.map((s) => ({
            step_order: s.step_order,
            title: s.title,
            agent_key: s.agent_key,
            duration_value: s.duration_value,
            duration_max_value: s.duration_max_value,
            duration_unit: s.duration_unit,
            step_context: s.step_context,
            phase_context: s.phase_context,
            stages: s.stages
          }))
        )
      ]);

      await client.query("COMMIT");

      const { rows } = await pool.query(
        `SELECT id, title, description, timeline_weeks, project_coins, category, global_category, is_active, is_demo_project,
                complexity, keywords, skills_required, skills_gained, target_branch, target_year,
                tech_stack, short_summary, domain, prerequisites, learning_outcomes, difficulty_score,
                introduction_document, introduction_document_url,
                private_brd_document, private_brd_document_url,
                solution_document, solution_document_url,
           company_profile_text,
           created_at, updated_at,
                steps_json AS steps
         FROM projects
         WHERE id = $1
         LIMIT 1`,
        [projectId]
      );

      return res.json({ message: "Project updated.", project: rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/admin/projects/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureCoinSchema();
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: "Invalid project id." });

    const deleted = await pool.query("DELETE FROM projects WHERE id = $1 RETURNING id", [projectId]);
    if (!deleted.rowCount) return res.status(404).json({ detail: "Project not found." });
    return res.json({ message: "Project deleted." });
  })
);

router.get(
  "/admin/mentors",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureMentorSchema();

    const { rows } = await pool.query(
      `SELECT id, agent_key, mentor_name, role, goal, backstory, avatar_url, avatar_public_id, is_hidden, output_format
       FROM project_mentors
       ORDER BY id ASC`
    );
    return res.json({
      mentors: rows.map((mentor) => ({
        ...mentor,
        name: mentor.mentor_name,
        is_active: !mentor.is_hidden,
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

router.post(
  "/admin/mentors",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "10mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureMentorSchema();

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

    const fields = parsed.fields || {};
    const avatar = parsed.files?.avatar;
    const agentKey = normalizeMentorAgentKey(fields.agent_key || fields.backend_key);
    const name = normalizeMentorName(fields.mentor_name || fields.name);
    const role = normalizeMentorRole(fields.role);
    const goal = normalizeMentorText(fields.goal);
    const backstory = normalizeMentorText(fields.backstory || fields.rules);
    const outputFormat = normalizeMentorOutputFormat(fields.output_format);
    const isHidden = String(fields.is_hidden || "false") === "true" || String(fields.is_active || "true") === "false";

    if (!agentKey) return res.status(400).json({ detail: "Agent key is required." });
    if (!name) return res.status(400).json({ detail: "Mentor name is required." });
    if (!role) return res.status(400).json({ detail: "Mentor role is required." });
    if (!goal) return res.status(400).json({ detail: "Mentor goal is required." });
    if (!backstory) return res.status(400).json({ detail: "Mentor backstory is required." });

    let avatarUrl = "";
    let avatarPublicId = "";
    if (avatar?.buffer?.length) {
      const uploaded = await uploadMentorAvatar({ file: avatar });
      avatarUrl = uploaded.url;
      avatarPublicId = uploaded.publicId;
    }

    const { rows } = await pool.query(
      `INSERT INTO project_mentors (agent_key, mentor_name, role, goal, backstory, avatar_url, avatar_public_id, is_hidden, output_format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, agent_key, mentor_name, role, goal, backstory, avatar_url, avatar_public_id, is_hidden, output_format`,
      [agentKey, name, role, goal, backstory, avatarUrl, avatarPublicId, isHidden, outputFormat]
    );

    return res.status(201).json({ message: "Mentor created.", mentor: rows[0] });
  })
);

router.put(
  "/admin/mentors/:id",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "10mb" }),
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureMentorSchema();

    const mentorId = Number(req.params.id);
    if (!Number.isFinite(mentorId)) return res.status(400).json({ detail: "Invalid mentor id." });

    const { rows: existingRows } = await pool.query(
      "SELECT id, avatar_url, avatar_public_id FROM project_mentors WHERE id = $1 LIMIT 1",
      [mentorId]
    );
    if (!existingRows.length) return res.status(404).json({ detail: "Mentor not found." });
    const existing = existingRows[0];

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

    const fields = parsed.fields || {};
    const avatar = parsed.files?.avatar;
    const agentKey = normalizeMentorAgentKey(fields.agent_key || fields.backend_key);
    const name = normalizeMentorName(fields.mentor_name || fields.name);
    const role = normalizeMentorRole(fields.role);
    const goal = normalizeMentorText(fields.goal);
    const backstory = normalizeMentorText(fields.backstory || fields.rules);
    const outputFormat = normalizeMentorOutputFormat(fields.output_format);
    const isHidden = String(fields.is_hidden || "false") === "true" || String(fields.is_active || "true") === "false";

    if (!agentKey) return res.status(400).json({ detail: "Agent key is required." });
    if (!name) return res.status(400).json({ detail: "Mentor name is required." });
    if (!role) return res.status(400).json({ detail: "Mentor role is required." });
    if (!goal) return res.status(400).json({ detail: "Mentor goal is required." });
    if (!backstory) return res.status(400).json({ detail: "Mentor backstory is required." });

    let avatarUrl = existing.avatar_url || "";
    let avatarPublicId = existing.avatar_public_id || "";
    if (avatar?.buffer?.length) {
      const uploaded = await uploadMentorAvatar({ mentorId, file: avatar });
      avatarUrl = uploaded.url;
      avatarPublicId = uploaded.publicId;
    }

    const { rows } = await pool.query(
      `UPDATE project_mentors
       SET agent_key = $2,
           mentor_name = $3,
           role = $4,
           goal = $5,
           backstory = $6,
           avatar_url = $7,
           avatar_public_id = $8,
           is_hidden = $9,
           output_format = $10
       WHERE id = $1
       RETURNING id, agent_key, mentor_name, role, goal, backstory, avatar_url, avatar_public_id, is_hidden, output_format`,
      [mentorId, agentKey, name, role, goal, backstory, avatarUrl, avatarPublicId, isHidden, outputFormat]
    );

    return res.json({ message: "Mentor updated.", mentor: rows[0] });
  })
);

router.delete(
  "/admin/mentors/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await ensureMentorSchema();
    const mentorId = Number(req.params.id);
    if (!Number.isFinite(mentorId)) return res.status(400).json({ detail: "Invalid mentor id." });

    const deleted = await pool.query("DELETE FROM project_mentors WHERE id = $1 RETURNING id", [mentorId]);
    if (!deleted.rowCount) return res.status(404).json({ detail: "Mentor not found." });
    return res.json({ message: "Mentor deleted." });
  })
);

router.get(
  "/admin/video-analytics",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);

    const [summaryResult, scoresResult, trendResult, recentResult, distributionResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0))::int AS avg_duration_seconds,
          ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL))::int AS avg_processing_time_seconds
        FROM self_intro_submissions
      `),
      pool.query(`
        SELECT
          ROUND(AVG(overall_score), 1) AS avg_overall_score,
          ROUND(AVG(clarity_score), 1) AS avg_clarity_score,
          ROUND(AVG(confidence_score), 1) AS avg_confidence_score,
          ROUND(AVG(communication_score), 1) AS avg_communication_score,
          ROUND(AVG(body_language_score), 1) AS avg_body_language_score,
          ROUND(AVG(structure_score), 1) AS avg_structure_score,
          COUNT(*)::int AS total_reports
        FROM self_intro_reports
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM self_intro_submissions
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
        ORDER BY date
      `),
      pool.query(`
        SELECT
          s.id,
          u.public_id AS user_public_id,
          u.name AS user_name,
          u.email AS user_email,
          s.status,
          r.overall_score,
          s.duration_seconds,
          s.file_size_bytes,
          s.mime_type,
          s.analysis_model,
          s.video_s3_key,
          s.video_url,
          s.created_at,
          s.completed_at,
          s.failed_at
        FROM self_intro_submissions s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN self_intro_reports r ON r.submission_id = s.id
        ORDER BY s.created_at DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT
          CASE
            WHEN overall_score BETWEEN 0 AND 20 THEN '0-20'
            WHEN overall_score BETWEEN 21 AND 40 THEN '21-40'
            WHEN overall_score BETWEEN 41 AND 60 THEN '41-60'
            WHEN overall_score BETWEEN 61 AND 80 THEN '61-80'
            WHEN overall_score BETWEEN 81 AND 100 THEN '81-100'
          END AS score_range,
          COUNT(*)::int AS count
        FROM self_intro_reports
        GROUP BY score_range
        ORDER BY score_range
      `)
    ]);

    const summary = { ...(summaryResult.rows[0] || {}), ...(scoresResult.rows[0] || {}) };
    const total = summary.total || 0;
    const completed = summary.completed || 0;
    summary.success_rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return res.json({
      summary,
      daily_trend: trendResult.rows,
      recent_submissions: recentResult.rows,
      score_distribution: distributionResult.rows
    });
  })
);

router.get(
  "/admin/video-analytics/submission/:id/video-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const submissionId = Number(req.params.id);
    if (!Number.isFinite(submissionId)) return res.status(400).json({ detail: "Invalid submission id." });

    const { rows } = await pool.query(
      "SELECT video_s3_key, mime_type FROM self_intro_submissions WHERE id = $1",
      [submissionId]
    );
    if (!rows.length) return res.status(404).json({ detail: "Submission not found." });
    const { video_s3_key, mime_type } = rows[0];
    if (!video_s3_key) return res.status(404).json({ detail: "No video on file for this submission." });
    await requireS3ObjectAvailable({ key: video_s3_key });

    const url = createPresignedS3GetUrl({
      key: video_s3_key,
      expiresSeconds: 900,
      responseContentType: mime_type || "video/webm",
      responseContentDisposition: "inline"
    });
    return res.json({ url });
  })
);

export default router;
