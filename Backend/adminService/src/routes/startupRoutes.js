import crypto from "crypto";
import express from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { chatComplete } from "../services/llmService.js";
import { summarizeSession } from "../services/memoryService.js";
import { chunkText, cosineSimilarity, embedText, embedTexts, getEmbeddingModel } from "../services/ragService.js";
import { uploadToS3 } from "../services/s3Service.js";
import { runWebSearchBatch, questionNeedsWebSearch } from "../services/webSearchService.js";
import { extractTextFromFile, extractTextFromUrl } from "../utils/textExtraction.js";
import { parseMultipartFormData } from "../utils/multipart.js";

const router = express.Router();

let startupMentorSchemaReady = null;
let projectMentorSchemaReady = null;

/**
 * Lazily creates the startup_mentors table (and the journey_phases/journey_stages
 * agent_key columns) if the 2026-08-16_01_startup_mentors_and_agent_routing.sql
 * migration hasn't been applied yet. Mirrors the ensureMentorSchema() pattern in
 * adminRoutes.js for project_mentors, so this route never 500s with a missing relation.
 */
function ensureStartupMentorSchema() {
  if (!startupMentorSchemaReady) {
    startupMentorSchemaReady = pool.query(`
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
      ALTER TABLE journey_stages ADD COLUMN IF NOT EXISTS agent_key VARCHAR(80) NOT NULL DEFAULT '';
      ALTER TABLE journey_phases ADD COLUMN IF NOT EXISTS default_agent_key VARCHAR(80) NOT NULL DEFAULT '';
      UPDATE journey_stages js
      SET mentor_id = sm.id
      FROM project_mentors pm
      INNER JOIN startup_mentors sm ON sm.agent_key = pm.agent_key
      WHERE js.mentor_id = pm.id;
      UPDATE journey_stages
      SET mentor_id = NULL
      WHERE mentor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM startup_mentors sm
          WHERE sm.id = journey_stages.mentor_id
        );
      ALTER TABLE IF EXISTS journey_stages DROP CONSTRAINT IF EXISTS fk_journey_stages_mentor;
      ALTER TABLE IF EXISTS journey_stages
        ADD CONSTRAINT fk_journey_stages_mentor
        FOREIGN KEY (mentor_id)
        REFERENCES startup_mentors(id)
        ON DELETE SET NULL;
    `).catch((error) => {
      startupMentorSchemaReady = null;
      throw error;
    });
  }
  return startupMentorSchemaReady;
}

function ensureProjectMentorSchema() {
  if (!projectMentorSchemaReady) {
    projectMentorSchemaReady = pool.query(`
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
    `).catch((error) => {
      projectMentorSchemaReady = null;
      throw error;
    });
  }
  return projectMentorSchemaReady;
}

async function syncProjectMentorFromStartupMentor(mentor) {
  if (!mentor) return;
  await ensureProjectMentorSchema();
  await pool.query(
    `INSERT INTO project_mentors (
      agent_key, mentor_name, role, goal, backstory, avatar_url, avatar_public_id, is_hidden, output_format
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (agent_key) DO UPDATE SET
      mentor_name = EXCLUDED.mentor_name,
      role = EXCLUDED.role,
      goal = EXCLUDED.goal,
      backstory = EXCLUDED.backstory,
      avatar_url = EXCLUDED.avatar_url,
      avatar_public_id = EXCLUDED.avatar_public_id,
      is_hidden = EXCLUDED.is_hidden,
      output_format = EXCLUDED.output_format`,
    [
      mentor.agent_key,
      mentor.mentor_name,
      mentor.role,
      mentor.goal,
      mentor.backstory,
      mentor.avatar_url || "",
      mentor.avatar_public_id || "",
      Boolean(mentor.is_hidden),
      mentor.output_format || "markdown"
    ]
  );
}

async function deleteProjectMentorByAgentKey(agentKey) {
  const key = String(agentKey || "").trim();
  if (!key) return;
  await ensureProjectMentorSchema();
  await pool.query("DELETE FROM project_mentors WHERE agent_key = $1", [key]);
}

async function indexChunks({ table, idColumn, recordId, text }) {
  const chunks = chunkText(text);
  await pool.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [recordId]);
  if (!chunks.length) return;

  const vectors = await embedTexts(chunks);
  const model = vectors.some(Boolean) ? getEmbeddingModel() : "";
  for (let index = 0; index < chunks.length; index += 1) {
    const vector = vectors[index] || null;
    await pool.query(
      `INSERT INTO ${table} (${idColumn}, chunk_index, chunk_text, token_count, embedding_model, embedding, embedding_dimension)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recordId, index, chunks[index], Math.ceil(chunks[index].length / 4), model, vector, vector?.length || 0]
    );
  }
}

async function indexStageDocument(stageDocumentId, text) {
  if (!text) {
    await pool.query("DELETE FROM stage_document_chunks WHERE stage_document_id = $1", [stageDocumentId]);
    return;
  }
  await indexChunks({ table: "stage_document_chunks", idColumn: "stage_document_id", recordId: stageDocumentId, text });
}

async function indexKnowledgeSource(sourceId, text) {
  if (!text) {
    await pool.query("DELETE FROM knowledge_chunks WHERE source_id = $1", [sourceId]);
    return;
  }
  await indexChunks({ table: "knowledge_chunks", idColumn: "source_id", recordId: sourceId, text });
}

async function retrieveTopChunks({ table, idColumn, joinIds, questionEmbedding, limit }) {
  if (!questionEmbedding || !joinIds.length) return [];
  const { rows } = await pool.query(
    `SELECT ${idColumn} AS record_id, chunk_text, embedding
     FROM ${table}
     WHERE ${idColumn} = ANY($1::bigint[]) AND embedding IS NOT NULL`,
    [joinIds]
  );
  return rows
    .map((row) => ({ recordId: row.record_id, chunkText: row.chunk_text, score: cosineSimilarity(questionEmbedding, row.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function normalizeText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeExt(filename) {
  const match = String(filename || "").toLowerCase().match(/\.[a-z0-9]{1,12}$/);
  return match ? match[0] : "";
}

function parseBoolField(value) {
  if (value === undefined) return undefined;
  return value === "true" || value === "1" || value === true;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item, 120)).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => normalizeText(item, 120))
    .filter(Boolean);
}

function normalizeInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/**
 * created_by is a nullable FK to users(id). When BYPASS_ADMIN_AUTH is on,
 * req.auth.userId is a hardcoded placeholder that doesn't exist in the users
 * table, which would violate the FK — so fall back to NULL in that case.
 */
function resolveCreatedBy(req) {
  return req.auth?.bypassed ? null : req.auth.userId;
}

async function requireAdmin(req) {
  
  if (process.env.BYPASS_ADMIN_AUTH === "true") {
    return { bypassed: true };
  }
  const userId = req.auth?.userId;
  const { rows } = await pool.query(
    `SELECT ac.id
     FROM users u
     INNER JOIN admin_credentials ac ON LOWER(ac.email) = LOWER(u.email)
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

async function fetchPhaseRows() {
  const { rows } = await pool.query(
    `SELECT id, phase_key, phase_order, phase_name, phase_description, phase_objective,
            intended_audience, default_agent_key, is_active, created_by, created_at, updated_at
     FROM journey_phases
     ORDER BY phase_order ASC, id ASC`
  );
  return rows;
}

async function fetchStageRows() {
  const { rows } = await pool.query(
    `SELECT js.id, js.phase_id, js.mentor_id, js.stage_key, js.stage_order, js.stage_name, js.stage_context, js.stage_objective,
            js.expected_outcome, js.readiness_criteria, js.recommended_actions, js.is_active,
            sm.agent_key AS mentor_agent_key,
            sm.mentor_name AS mentor_name,
            js.created_by, js.created_at, js.updated_at
     FROM journey_stages js
     LEFT JOIN startup_mentors sm ON sm.id = js.mentor_id
     ORDER BY js.phase_id ASC, js.stage_order ASC, js.id ASC`
  );
  return rows;
}

/**
 * Resolves which startup_mentors persona should answer a question for a
 * given phase/stage. Order: stage.agent_key -> phase.default_agent_key ->
 * the startup_mentors row marked is_default -> a hardcoded last resort.
 * Never throws — a missing/misconfigured mentor roster should never break
 * the chat flow.
 */
async function resolveMentorForStage({ phase, stage }) {
  await ensureStartupMentorSchema();
  const candidateKeys = [stage?.agent_key, phase?.default_agent_key].map((k) => String(k || "").trim()).filter(Boolean);

  if (candidateKeys.length) {
    const { rows } = await pool.query(
      `SELECT * FROM startup_mentors WHERE agent_key = ANY($1::text[]) ORDER BY array_position($1::text[], agent_key) LIMIT 1`,
      [candidateKeys]
    );
    if (rows[0]) return { mentor: rows[0], resolution: stage?.agent_key ? "stage" : "phase_default" };
  }

  const defaultRow = await pool.query("SELECT * FROM startup_mentors WHERE is_default = TRUE LIMIT 1");
  if (defaultRow.rows[0]) return { mentor: defaultRow.rows[0], resolution: "global_default" };

  return {
    mentor: {
      agent_key: "general_startup_mentor",
      mentor_name: "Startup Mentor",
      role: "Generalist startup coach for early-stage student founders",
      goal: "Help the student make progress on their current phase and stage without doing the work for them",
      backstory: "An experienced startup mentor who has guided many first-time student founders through idea validation, building, and launch.",
      output_format: "markdown"
    },
    resolution: "hardcoded_fallback"
  };
}

function nestJourney(phases, stages) {
  const stagesByPhase = stages.reduce((acc, stage) => {
    const key = String(stage.phase_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(stage);
    return acc;
  }, {});

  return phases.map((phase) => ({
    ...phase,
    stages: stagesByPhase[String(phase.id)] || []
  }));
}

async function loadJourney() {
  const [phases, stages] = await Promise.all([fetchPhaseRows(), fetchStageRows()]);
  return nestJourney(phases, stages);
}

async function getCurrentProfile(userId) {
  const { rows } = await pool.query(
    `SELECT sp.*,
            si.id AS idea_id,
            si.idea_title,
            si.problem_statement,
            si.solution_summary,
            si.target_users,
            si.industry_tags,
            si.idea_status,
            si.is_primary
     FROM student_profiles sp
     LEFT JOIN startup_ideas si
       ON si.profile_id = sp.id
      AND si.is_primary = TRUE
      AND si.is_active = TRUE
     WHERE sp.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getOrCreateSession({ userId, profileId, ideaId, phaseId, stageId, sessionTitle, language }) {
  const latest = await pool.query(
    `SELECT id
     FROM conversation_sessions
     WHERE user_id = $1
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId]
  );

  if (latest.rows[0]?.id) {
    await pool.query(
      `UPDATE conversation_sessions
       SET profile_id = COALESCE($2, profile_id),
           idea_id = COALESCE($3, idea_id),
           phase_id = COALESCE($4, phase_id),
           stage_id = COALESCE($5, stage_id),
           session_title = COALESCE(NULLIF($6, ''), session_title),
           language = COALESCE(NULLIF($7, ''), language),
           updated_at = NOW()
       WHERE id = $1`,
      [latest.rows[0].id, profileId, ideaId, phaseId, stageId, sessionTitle, language]
    );
    return latest.rows[0].id;
  }

  const created = await pool.query(
    `INSERT INTO conversation_sessions
      (user_id, profile_id, idea_id, phase_id, stage_id, session_title, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, profileId, ideaId, phaseId, stageId, sessionTitle || "Startup journey", language || "english"]
  );
  return created.rows[0].id;
}

/** Reranks candidate rows by embedding similarity to the question. Falls back to the original (ILIKE) order untouched when no embedding is available. */
async function rerankByEmbedding({ rows, chunkTable, chunkIdColumn, questionEmbedding, limit }) {
  if (!questionEmbedding || !rows.length) return rows.slice(0, limit);

  const best = await retrieveTopChunks({
    table: chunkTable,
    idColumn: chunkIdColumn,
    joinIds: rows.map((row) => row.id),
    questionEmbedding,
    limit: rows.length
  });
  if (!best.length) return rows.slice(0, limit);

  const bestScoreByRecordId = new Map();
  for (const chunk of best) {
    if (!bestScoreByRecordId.has(chunk.recordId) || chunk.score > bestScoreByRecordId.get(chunk.recordId)) {
      bestScoreByRecordId.set(chunk.recordId, chunk.score);
    }
  }

  return [...rows]
    .sort((a, b) => (bestScoreByRecordId.get(b.id) ?? -1) - (bestScoreByRecordId.get(a.id) ?? -1))
    .slice(0, limit);
}

async function fetchRetrievedContext({ userId, profileId, ideaId, phaseId, stageId, question }) {
  const questionLike = `%${normalizeText(question, 200)}%`;

  const [stageDocsCandidates, knowledgeSourcesCandidates, recentMessages, memoryRows, questionEmbedding] = await Promise.all([
    pool.query(
      `SELECT id, title, document_type, source_type, source_url, storage_url, original_filename, language, tags, content_text, created_at, updated_at
       FROM stage_documents
       WHERE is_active = TRUE
         AND (
           stage_id = $1
           OR phase_id = $2
           OR title ILIKE $3
           OR content_text ILIKE $3
         )
       ORDER BY
         CASE WHEN stage_id = $1 THEN 0 WHEN phase_id = $2 THEN 1 ELSE 2 END,
         updated_at DESC
       LIMIT 20`,
      [stageId, phaseId, questionLike]
    ),
    pool.query(
      `SELECT id, source_scope, source_type, title, source_url, storage_url, original_filename, tags, content_text, metadata, created_at, updated_at
       FROM knowledge_sources
       WHERE is_active = TRUE
         AND (
           user_id = $1
           OR idea_id = $2
           OR stage_id = $3
           OR phase_id = $4
           OR source_scope = 'global'
           OR title ILIKE $5
           OR content_text ILIKE $5
         )
       ORDER BY
         CASE
           WHEN user_id = $1 THEN 0
           WHEN idea_id = $2 THEN 1
           WHEN stage_id = $3 THEN 2
           WHEN phase_id = $4 THEN 3
           ELSE 4
         END,
         updated_at DESC
       LIMIT 20`,
      [userId, ideaId, stageId, phaseId, questionLike]
    ),
    pool.query(
      `SELECT id, role, message_type, content, created_at
       FROM conversation_messages
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 8`,
      [userId]
    ),
    pool.query(
      `SELECT id, memory_scope, summary_text, summary_facts, summary_state, created_at
       FROM memory_summaries
       WHERE user_id = $1
         AND is_active = TRUE
         AND (
           profile_id = $2
           OR idea_id = $3
           OR phase_id = $4
           OR stage_id = $5
           OR memory_scope = 'global'
         )
       ORDER BY updated_at DESC, id DESC
       LIMIT 6`,
      [userId, profileId, ideaId, phaseId, stageId]
    ),
    embedText(question)
  ]);

  const [stageDocuments, knowledgeSources] = await Promise.all([
    rerankByEmbedding({
      rows: stageDocsCandidates.rows,
      chunkTable: "stage_document_chunks",
      chunkIdColumn: "stage_document_id",
      questionEmbedding,
      limit: 8
    }),
    rerankByEmbedding({
      rows: knowledgeSourcesCandidates.rows,
      chunkTable: "knowledge_chunks",
      chunkIdColumn: "source_id",
      questionEmbedding,
      limit: 8
    })
  ]);

  return {
    stage_documents: stageDocuments,
    knowledge_sources: knowledgeSources,
    recent_messages: recentMessages.rows.reverse(),
    memory_summaries: memoryRows.rows,
    retrieval_mode: questionEmbedding ? "embedding_rerank" : "lexical_ilike"
  };
}

const STARTUP_COACHING_GUARDRAIL = `You are an AI startup mentor coaching a student founder inside a structured program.
Rules you always follow:
- Coach step by step. Never hand over a finished business plan, pitch deck, or "do it for them" answer — ask a clarifying question or point to the next small action instead.
- Ground your answer in the provided stage context and retrieved sources when they're relevant; say so briefly when you use them ("Based on the market note you have on file...").
- If web search results are provided, you may cite them briefly, but don't invent facts or sources that weren't given to you.
- Keep answers focused on the student's current phase/stage — redirect gently if the question is far outside scope.
- Warm, encouraging, conversational tone. No corporate boilerplate, no emoji spam.
- If you don't have enough information to answer well, say what's missing and ask for it.`;

function buildMentorSystemPrompt({ mentor, phase, stage, profile, context, webResults, memorySummary }) {
  const sections = [STARTUP_COACHING_GUARDRAIL];

  sections.push(
    [
      `You are "${mentor.mentor_name}".`,
      `Role: ${mentor.role}`,
      `Goal: ${mentor.goal}`,
      `Backstory: ${mentor.backstory}`
    ].join("\n")
  );

  if (phase || stage) {
    sections.push(
      [
        "Current journey position:",
        phase ? `Phase: ${phase.phase_name} — ${phase.phase_objective || phase.phase_description || ""}` : "",
        stage ? `Stage: ${stage.stage_name} — ${stage.stage_objective || stage.stage_context || ""}` : "",
        stage?.expected_outcome ? `Expected outcome for this stage: ${stage.expected_outcome}` : "",
        stage?.readiness_criteria ? `Readiness criteria to move on: ${stage.readiness_criteria}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (profile) {
    sections.push(
      [
        "Student profile:",
        profile.startup_stage ? `Startup stage: ${String(profile.startup_stage).replaceAll("_", " ")}` : "",
        profile.goal_type ? `Goal type: ${profile.goal_type}` : "",
        profile.idea_title ? `Idea: ${profile.idea_title}` : "",
        profile.problem_statement ? `Problem statement: ${profile.problem_statement}` : "",
        profile.preferred_language ? `Preferred language: ${profile.preferred_language}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (context?.stage_documents?.length || context?.knowledge_sources?.length) {
    const docLines = [
      ...(context.stage_documents || []).map((doc) => `- [Stage doc] ${doc.title}: ${String(doc.content_text || "").slice(0, 600)}`),
      ...(context.knowledge_sources || []).map((src) => `- [Knowledge] ${src.title}: ${String(src.content_text || "").slice(0, 600)}`)
    ].filter((line) => line.length > 20);
    if (docLines.length) sections.push(`Retrieved reference material (use if relevant):\n${docLines.slice(0, 10).join("\n")}`);
  }

  if (webResults?.length) {
    sections.push(`Web search results (use if relevant, cite briefly):\n${webResults.map((r) => `- ${r.title} (${r.url}): ${r.snippet}`).join("\n")}`);
  }

  if (memorySummary) {
    sections.push(`Summary of the conversation so far: ${memorySummary}`);
  }

  return sections.join("\n\n");
}

function buildFallbackAnswer({ profile, phase, stage, question, context }) {
  const lines = [];
  const name = profile?.full_name || "there";
  const stageName = stage?.stage_name || "your current stage";
  const phaseName = phase?.phase_name || "your current phase";
  lines.push(`Hi ${name}, I mapped your question to ${phaseName} / ${stageName}.`);
  lines.push(`Question: ${question}`);
  lines.push("I couldn't reach the AI model just now, so here's a placeholder while that's unavailable — please try again shortly.");
  if (context.stage_documents.length) lines.push(`I did find ${context.stage_documents.length} stage documents that can support this answer.`);
  if (context.knowledge_sources.length) lines.push(`I also found ${context.knowledge_sources.length} knowledge sources that may help.`);
  return lines.join("\n\n");
}

/** Real LLM answer generation. Falls back to a templated answer if the LLM call fails for any reason — never a hard error for the student. */
async function generateMentorAnswer({ mentor, profile, phase, stage, question, context, webResults, memorySummary, recentMessages }) {
  const systemPrompt = buildMentorSystemPrompt({ mentor, phase, stage, profile, context, webResults, memorySummary });
  const history = (recentMessages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 2000) }));

  try {
    const { text, model } = await chatComplete({
      systemPrompt,
      messages: [...history, { role: "user", content: question }],
      temperature: 0.5
    });
    return { answer: text, model, usedLlm: true };
  } catch {
    return { answer: buildFallbackAnswer({ profile, phase, stage, question, context }), model: "startup-query-fallback", usedLlm: false };
  }
}

async function upsertSessionMemory({ sessionId, userId, profileId, ideaId, phaseId, stageId, question, answer, context, existingSummary }) {
  const { summary, generatedByLlm } = await summarizeSession({ existingSummary, question, answer });

  await pool.query(
    `UPDATE conversation_sessions
     SET memory_summary = $2,
         memory_state = $3::jsonb,
         last_user_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [sessionId, summary, JSON.stringify({
      last_question: question,
      last_answer_preview: answer.slice(0, 500),
      summary_generated_by_llm: generatedByLlm,
      retrieved_counts: {
        stage_documents: context.stage_documents.length,
        knowledge_sources: context.knowledge_sources.length,
        memory_summaries: context.memory_summaries.length
      }
    })]
  );

  await pool.query(
    `INSERT INTO conversation_messages (session_id, user_id, role, message_type, content, metadata)
     VALUES ($1, $2, 'user', 'chat', $3, $4::jsonb),
            ($1, $2, 'assistant', 'chat', $5, $6::jsonb)`,
    [
      sessionId,
      userId,
      question,
      JSON.stringify({ phase_id: phaseId, stage_id: stageId }),
      answer,
      JSON.stringify({ phase_id: phaseId, stage_id: stageId })
    ]
  );

  await pool.query(
    `INSERT INTO memory_summaries
      (user_id, session_id, profile_id, idea_id, phase_id, stage_id, memory_scope, summary_text, summary_facts, summary_state)
     VALUES ($1, $2, $3, $4, $5, $6, 'session', $7, $8::jsonb, $9::jsonb)`,
    [
      userId,
      sessionId,
      profileId || null,
      ideaId || null,
      phaseId || null,
      stageId || null,
      summary,
      JSON.stringify([question, answer.slice(0, 240)]),
      JSON.stringify({ generated_by_llm: generatedByLlm, context_counts: { stage_documents: context.stage_documents.length, knowledge_sources: context.knowledge_sources.length } })
    ]
  );

  return summary;
}

router.get("/startup/workspace", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const [profile, journey] = await Promise.all([getCurrentProfile(userId), loadJourney()]);
    const activePhase = journey[0] || null;
    const activeStage = activePhase?.stages?.[0] || null;
    const sessionId = await getOrCreateSession({
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: activePhase?.id || null,
      stageId: activeStage?.id || null,
      sessionTitle: `${activePhase?.phase_name || "Startup journey"} / ${activeStage?.stage_name || "Intro"}`,
      language: profile?.preferred_language || "english"
    });
    const context = await fetchRetrievedContext({
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: activePhase?.id || null,
      stageId: activeStage?.id || null,
      question: profile?.current_idea_text || ""
    });

    res.json({
      profile,
      journey,
      active_phase: activePhase,
      active_stage: activeStage,
      session_id: sessionId,
      context
    });
  } catch (error) {
    next(error);
  }
});

router.get("/startup/profile", requireAuth, async (req, res, next) => {
  try {
    const profile = await getCurrentProfile(req.auth.userId);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.post("/startup/profile", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const age = normalizeInteger(req.body?.age, null);
    const educationLevel = normalizeText(req.body?.education_level || req.body?.educationLevel, 80);
    const locationText = normalizeText(req.body?.location_text || req.body?.locationText, 160);
    const country = normalizeText(req.body?.country, 80);
    const stateRegion = normalizeText(req.body?.state_region || req.body?.stateRegion, 120);
    const city = normalizeText(req.body?.city, 120);
    const skills = normalizeText(req.body?.skills, 4000);
    const interests = normalizeText(req.body?.interests, 4000);
    const availableTimeHoursPerWeek = Math.max(0, normalizeInteger(req.body?.available_time_hours_per_week || req.body?.availableTimeHoursPerWeek, 0));
    const availableResources = normalizeText(req.body?.available_resources || req.body?.availableResources, 4000);
    const participationMode = normalizeText(req.body?.participation_mode || req.body?.participationMode, 20) || "individual";
    const currentIdeaText = normalizeText(req.body?.current_idea_text || req.body?.currentIdeaText, 12000);
    const startupStage = normalizeText(req.body?.startup_stage || req.body?.startupStage, 30) || "no_idea";
    const preferredLanguage = normalizeText(req.body?.preferred_language || req.body?.preferredLanguage, 20) || "english";
    const goalType = normalizeText(req.body?.goal_type || req.body?.goalType, 40) || "commercial";
    const profileSummary = normalizeText(req.body?.profile_summary || req.body?.profileSummary, 12000);
    const readinessScore = Math.max(0, Math.min(100, normalizeInteger(req.body?.readiness_score || req.body?.readinessScore, 0)));

    const profileRes = await pool.query(
      `INSERT INTO student_profiles (
        user_id, age, education_level, location_text, country, state_region, city,
        skills, interests, available_time_hours_per_week, available_resources,
        participation_mode, current_idea_text, startup_stage, preferred_language,
        goal_type, profile_summary, readiness_score, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        age = EXCLUDED.age,
        education_level = EXCLUDED.education_level,
        location_text = EXCLUDED.location_text,
        country = EXCLUDED.country,
        state_region = EXCLUDED.state_region,
        city = EXCLUDED.city,
        skills = EXCLUDED.skills,
        interests = EXCLUDED.interests,
        available_time_hours_per_week = EXCLUDED.available_time_hours_per_week,
        available_resources = EXCLUDED.available_resources,
        participation_mode = EXCLUDED.participation_mode,
        current_idea_text = EXCLUDED.current_idea_text,
        startup_stage = EXCLUDED.startup_stage,
        preferred_language = EXCLUDED.preferred_language,
        goal_type = EXCLUDED.goal_type,
        profile_summary = EXCLUDED.profile_summary,
        readiness_score = EXCLUDED.readiness_score,
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        age,
        educationLevel,
        locationText,
        country,
        stateRegion,
        city,
        skills,
        interests,
        availableTimeHoursPerWeek,
        availableResources,
        participationMode,
        currentIdeaText,
        startupStage,
        preferredLanguage,
        goalType,
        profileSummary,
        readinessScore
      ]
    );

    const profile = profileRes.rows[0];
    let idea = null;

    if (normalizeText(req.body?.idea_title || req.body?.ideaTitle, 180) || currentIdeaText) {
      const ideaRes = await pool.query(
      `INSERT INTO startup_ideas (
          user_id, profile_id, idea_title, problem_statement, solution_summary,
          target_users, industry_tags, idea_status, is_primary, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', TRUE, TRUE, NOW())
        ON CONFLICT (user_id)
        WHERE is_primary = TRUE
        DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          idea_title = EXCLUDED.idea_title,
          problem_statement = EXCLUDED.problem_statement,
          solution_summary = EXCLUDED.solution_summary,
          target_users = EXCLUDED.target_users,
          industry_tags = EXCLUDED.industry_tags,
          idea_status = 'active',
          is_active = TRUE,
          updated_at = NOW()
        RETURNING *`,
        [
          userId,
          profile.id,
          normalizeText(req.body?.idea_title || req.body?.ideaTitle, 180) || "My startup idea",
          normalizeText(req.body?.problem_statement || req.body?.problemStatement || currentIdeaText, 12000),
          normalizeText(req.body?.solution_summary || req.body?.solutionSummary, 12000),
          normalizeText(req.body?.target_users || req.body?.targetUsers, 4000),
          normalizeText(req.body?.industry_tags || req.body?.industryTags, 4000)
        ]
      );
      idea = ideaRes.rows[0];
    }

    res.json({ profile, idea });
  } catch (error) {
    next(error);
  }
});

router.post("/startup/query", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const question = normalizeText(req.body?.question, 8000);
    if (!question) {
      return res.status(400).json({ detail: "Question is required." });
    }

    const phaseId = normalizeInteger(req.body?.phase_id || req.body?.phaseId, null);
    const stageId = normalizeInteger(req.body?.stage_id || req.body?.stageId, null);
    const requestedSessionId = normalizeText(req.body?.session_id || req.body?.sessionId, 80);

    const profile = await getCurrentProfile(userId);
    const phase = phaseId
      ? (await pool.query("SELECT * FROM journey_phases WHERE id = $1 LIMIT 1", [phaseId])).rows[0] || null
      : null;
    const stage = stageId
      ? (await pool.query("SELECT * FROM journey_stages WHERE id = $1 LIMIT 1", [stageId])).rows[0] || null
      : null;
    const sessionId = requestedSessionId || await getOrCreateSession({
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: phase?.id || null,
      stageId: stage?.id || null,
      sessionTitle: `${phase?.phase_name || "Startup journey"} / ${stage?.stage_name || "Question"}`,
      language: profile?.preferred_language || "english"
    });

    const [context, existingSessionRow, { mentor, resolution }] = await Promise.all([
      fetchRetrievedContext({
        userId,
        profileId: profile?.id || null,
        ideaId: profile?.idea_id || null,
        phaseId: phase?.id || null,
        stageId: stage?.id || null,
        question
      }),
      pool.query("SELECT memory_summary FROM conversation_sessions WHERE id = $1", [sessionId]),
      resolveMentorForStage({ phase, stage })
    ]);
    const existingSummary = existingSessionRow.rows[0]?.memory_summary || "";
    const recentMessages = [...context.recent_messages];

    const browserSearchQueries = [
      `${phase?.phase_name || profile?.startup_stage || "startup"} ${stage?.stage_name || ""} ${question}`.trim(),
      `${profile?.country || "India"} ${profile?.goal_type || "startup"} market validation ${question}`.trim(),
      `${profile?.interests || ""} ${question}`.trim()
    ].filter(Boolean);

    let webResults = [];
    const shouldSearchWeb = questionNeedsWebSearch(question);
    if (shouldSearchWeb) {
      webResults = await runWebSearchBatch(browserSearchQueries.slice(0, 2));
    }

    const { answer, model, usedLlm } = await generateMentorAnswer({
      mentor,
      profile,
      phase,
      stage,
      question,
      context,
      webResults,
      memorySummary: existingSummary,
      recentMessages
    });

    const newSummary = await upsertSessionMemory({
      sessionId,
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: phase?.id || null,
      stageId: stage?.id || null,
      question,
      answer,
      context,
      existingSummary
    });

    const usedMemory = Boolean(existingSummary);
    const usedWebSearch = webResults.length > 0;

    const agentRun = await pool.query(
      `INSERT INTO agent_runs (
        session_id, user_id, profile_id, idea_id, phase_id, stage_id,
        query_text, router_decision, retrieved_context, final_answer,
        model_name, status, used_web_search, used_memory
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, 'succeeded', $12, $13)
      RETURNING id, status, created_at`,
      [
        sessionId,
        userId,
        profile?.id || null,
        profile?.idea_id || null,
        phase?.id || null,
        stage?.id || null,
        question,
        JSON.stringify({
          agent_key: mentor.agent_key,
          mentor_name: mentor.mentor_name,
          resolution,
          used_llm: usedLlm,
          profile_stage: profile?.startup_stage || "",
          phase_key: phase?.phase_key || "",
          stage_key: stage?.stage_key || "",
          browser_search_queries: browserSearchQueries,
          web_search_triggered: shouldSearchWeb
        }),
        JSON.stringify(context),
        answer,
        model,
        usedWebSearch,
        usedMemory
      ]
    );

    if (webResults.length) {
      await Promise.all(
        webResults.map((result) =>
          pool.query(
            `INSERT INTO web_search_results (agent_run_id, query_text, source_name, result_title, result_url, snippet, rank_position, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              agentRun.rows[0].id,
              question,
              new URL(result.url || "https://unknown").hostname,
              result.title,
              result.url,
              result.snippet,
              result.rank,
              result.published_at
            ]
          ).catch(() => {})
        )
      );
    }

    res.json({
      session_id: sessionId,
      agent_run: agentRun.rows[0],
      profile,
      phase,
      stage,
      mentor: { agent_key: mentor.agent_key, mentor_name: mentor.mentor_name, avatar_url: mentor.avatar_url || "" },
      answer,
      retrieved_context: context,
      browser_search_queries: browserSearchQueries,
      web_results: webResults,
      memory_summary: newSummary,
      next_steps: [
        "Review the stage-specific references above.",
        "If you want, ask a narrower follow-up question.",
        "Add phase/stage-specific documents in the admin journey builder."
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/startup/journeys", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM journeys ORDER BY journey_name ASC, id ASC"
    );

    res.json({ journeys: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/journeys", requireAuth, async (req, res, next) => {
  try {
    const {
      journey_key,
      journey_name,
      journey_description = "",
      journey_objective = "",
      intended_audience = "",
      is_active = true
    } = req.body;

    if (!journey_key?.trim() || !journey_name?.trim()) {
      return res.status(400).json({
        detail: "Journey key and journey name are required."
      });
    }

    const result = await pool.query(
      `INSERT INTO journeys (
        journey_key,
        journey_name,
        journey_description,
        journey_objective,
        intended_audience,
        is_active,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        journey_key.trim(),
        journey_name.trim(),
        journey_description.trim(),
        journey_objective.trim(),
        intended_audience.trim(),
        Boolean(is_active),
        req.auth.userId
      ]
    );

    res.status(201).json({ journey: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/startup/journeys/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE journeys
       SET journey_key = COALESCE(NULLIF($2, ''), journey_key),
           journey_name = COALESCE(NULLIF($3, ''), journey_name),
           journey_description = COALESCE($4, journey_description),
           journey_objective = COALESCE($5, journey_objective),
           intended_audience = COALESCE($6, intended_audience),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        Number(req.params.id),
        String(req.body.journey_key || "").trim(),
        String(req.body.journey_name || "").trim(),
        String(req.body.journey_description || "").trim(),
        String(req.body.journey_objective || "").trim(),
        String(req.body.intended_audience || "").trim(),
        req.body.is_active === undefined ? null : Boolean(req.body.is_active)
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ detail: "Journey not found." });
    }

    res.json({ journey: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/startup/journeys/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM journeys WHERE id = $1 RETURNING id",
      [Number(req.params.id)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ detail: "Journey not found." });
    }

    res.json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/startup/journey", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const journey = await loadJourney();
    res.json({ journey });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/phases", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const phaseKey = normalizeText(req.body?.phase_key || req.body?.phaseKey, 80);
    const phaseName = normalizeText(req.body?.phase_name || req.body?.phaseName, 160);
    if (!phaseKey || !phaseName) {
      return res.status(400).json({ detail: "Phase key and phase name are required." });
    }

    const result = await pool.query(
      `INSERT INTO journey_phases (
        phase_key, phase_order, phase_name, phase_description, phase_objective,
        intended_audience, default_agent_key, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE), $9)
      RETURNING *`,
      [
        phaseKey,
        normalizeInteger(req.body?.phase_order || req.body?.phaseOrder, 0),
        phaseName,
        normalizeText(req.body?.phase_description || req.body?.phaseDescription, 12000),
        normalizeText(req.body?.phase_objective || req.body?.phaseObjective, 12000),
        normalizeText(req.body?.intended_audience || req.body?.intendedAudience, 4000),
        normalizeText(req.body?.default_agent_key || req.body?.defaultAgentKey, 80),
        typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined,
        resolveCreatedBy(req)
      ]
    );
    res.status(201).json({ phase: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/startup/phases/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query(
      `UPDATE journey_phases
       SET phase_key = COALESCE(NULLIF($2, ''), phase_key),
           phase_order = COALESCE($3, phase_order),
           phase_name = COALESCE(NULLIF($4, ''), phase_name),
           phase_description = COALESCE($5, phase_description),
           phase_objective = COALESCE($6, phase_objective),
           intended_audience = COALESCE($7, intended_audience),
           default_agent_key = COALESCE($8, default_agent_key),
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        normalizeText(req.body?.phase_key || req.body?.phaseKey, 80),
        normalizeInteger(req.body?.phase_order || req.body?.phaseOrder, null),
        normalizeText(req.body?.phase_name || req.body?.phaseName, 160),
        normalizeText(req.body?.phase_description || req.body?.phaseDescription, 12000),
        normalizeText(req.body?.phase_objective || req.body?.phaseObjective, 12000),
        normalizeText(req.body?.intended_audience || req.body?.intendedAudience, 4000),
        req.body?.default_agent_key !== undefined || req.body?.defaultAgentKey !== undefined
          ? normalizeText(req.body?.default_agent_key || req.body?.defaultAgentKey, 80)
          : null,
        typeof req.body?.is_active === "boolean" ? req.body.is_active : null
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ detail: "Phase not found." });
    res.json({ phase: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/startup/phases/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query("DELETE FROM journey_phases WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ detail: "Phase not found." });
    res.json({ message: "Phase deleted.", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/stages", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const phaseId = normalizeInteger(req.body?.phase_id || req.body?.phaseId, null);
    const stageKey = normalizeText(req.body?.stage_key || req.body?.stageKey, 80);
    const stageName = normalizeText(req.body?.stage_name || req.body?.stageName, 160);
    if (!phaseId || !stageKey || !stageName) {
      return res.status(400).json({ detail: "Phase id, stage key, and stage name are required." });
    }

   const result = await pool.query(
  `INSERT INTO journey_stages (
    phase_id, mentor_id, stage_key, stage_order, stage_name, stage_context,
    stage_objective, expected_outcome, readiness_criteria, recommended_actions,
    is_active, created_by
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, TRUE), $12)
  RETURNING *`,
  [
    phaseId,
    normalizeInteger(req.body?.mentor_id || req.body?.mentorId, null),
    stageKey,
    normalizeInteger(req.body?.stage_order || req.body?.stageOrder, 0),
    stageName,
    normalizeText(req.body?.stage_context || req.body?.stageContext, 12000),
    normalizeText(req.body?.stage_objective || req.body?.stageObjective, 12000),
    normalizeText(req.body?.expected_outcome || req.body?.expectedOutcome, 12000),
    normalizeText(req.body?.readiness_criteria || req.body?.readinessCriteria, 12000),
    normalizeText(req.body?.recommended_actions || req.body?.recommendedActions, 12000),
    typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined,
    req.auth.userId
  ]
);
    res.status(201).json({ stage: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/startup/stages/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query(
  `UPDATE journey_stages
   SET phase_id = COALESCE($2, phase_id),
       mentor_id = $3,
       stage_key = COALESCE(NULLIF($4, ''), stage_key),
       stage_order = COALESCE($5, stage_order),
       stage_name = COALESCE(NULLIF($6, ''), stage_name),
       stage_context = COALESCE($7, stage_context),
       stage_objective = COALESCE($8, stage_objective),
       expected_outcome = COALESCE($9, expected_outcome),
       readiness_criteria = COALESCE($10, readiness_criteria),
       recommended_actions = COALESCE($11, recommended_actions),
       is_active = COALESCE($12, is_active),
       updated_at = NOW()
   WHERE id = $1
   RETURNING *`,
  [
    id,
    normalizeInteger(req.body?.phase_id || req.body?.phaseId, null),
    normalizeInteger(req.body?.mentor_id || req.body?.mentorId, null),
    normalizeText(req.body?.stage_key || req.body?.stageKey, 80),
    normalizeInteger(req.body?.stage_order || req.body?.stageOrder, null),
    normalizeText(req.body?.stage_name || req.body?.stageName, 160),
    normalizeText(req.body?.stage_context || req.body?.stageContext, 12000),
    normalizeText(req.body?.stage_objective || req.body?.stageObjective, 12000),
    normalizeText(req.body?.expected_outcome || req.body?.expectedOutcome, 12000),
    normalizeText(req.body?.readiness_criteria || req.body?.readinessCriteria, 12000),
    normalizeText(req.body?.recommended_actions || req.body?.recommendedActions, 12000),
    typeof req.body?.is_active === "boolean" ? req.body.is_active : null
  ]
);
    if (!result.rows[0]) return res.status(404).json({ detail: "Stage not found." });
    res.json({ stage: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/startup/stages/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query("DELETE FROM journey_stages WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ detail: "Stage not found." });
    res.json({ message: "Stage deleted.", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/startup/mentors", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const { rows } = await pool.query("SELECT * FROM startup_mentors ORDER BY is_default DESC, mentor_name ASC");
    await Promise.all(rows.map((mentor) => syncProjectMentorFromStartupMentor(mentor)));
    res.json({ mentors: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/mentors", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const agentKey = normalizeText(req.body?.agent_key || req.body?.agentKey, 80);
    const mentorName = normalizeText(req.body?.mentor_name || req.body?.mentorName, 120);
    const role = normalizeText(req.body?.role, 4000);
    const goal = normalizeText(req.body?.goal, 4000);
    const backstory = normalizeText(req.body?.backstory, 12000);
    if (!agentKey || !mentorName || !role || !goal || !backstory) {
      return res.status(400).json({ detail: "agent_key, mentor_name, role, goal, and backstory are all required." });
    }

    const isDefault = req.body?.is_default === true || req.body?.isDefault === true;
    if (isDefault) {
      await pool.query("UPDATE startup_mentors SET is_default = FALSE WHERE is_default = TRUE");
    }

    const result = await pool.query(
      `INSERT INTO startup_mentors (
        agent_key, mentor_name, role, goal, backstory, avatar_url, output_format, is_default, is_hidden, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE(NULLIF($7, ''), 'markdown'), $8, $9, $10)
      RETURNING *`,
      [
        agentKey,
        mentorName,
        role,
        goal,
        backstory,
        normalizeText(req.body?.avatar_url || req.body?.avatarUrl, 2000),
        normalizeText(req.body?.output_format || req.body?.outputFormat, 20),
        isDefault,
        Boolean(req.body?.is_hidden === true || req.body?.isHidden === true),
        req.auth.userId
      ]
    );
    await syncProjectMentorFromStartupMentor(result.rows[0]);
    res.status(201).json({ mentor: result.rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ detail: "A mentor with that agent key already exists." });
    }
    next(error);
  }
});

router.put("/admin/startup/mentors/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const id = normalizeInteger(req.params.id, null);
    const existingLookup = await pool.query("SELECT agent_key FROM startup_mentors WHERE id = $1 LIMIT 1", [id]);
    const isDefaultProvided = req.body?.is_default !== undefined || req.body?.isDefault !== undefined;
    const isDefault = req.body?.is_default === true || req.body?.isDefault === true;
    if (isDefaultProvided && isDefault) {
      await pool.query("UPDATE startup_mentors SET is_default = FALSE WHERE is_default = TRUE AND id != $1", [id]);
    }

    const result = await pool.query(
      `UPDATE startup_mentors
       SET agent_key = COALESCE(NULLIF($2, ''), agent_key),
           mentor_name = COALESCE(NULLIF($3, ''), mentor_name),
           role = COALESCE(NULLIF($4, ''), role),
           goal = COALESCE(NULLIF($5, ''), goal),
           backstory = COALESCE(NULLIF($6, ''), backstory),
           avatar_url = COALESCE($7, avatar_url),
           output_format = COALESCE(NULLIF($8, ''), output_format),
           is_default = COALESCE($9, is_default),
           is_hidden = COALESCE($10, is_hidden),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        normalizeText(req.body?.agent_key || req.body?.agentKey, 80),
        normalizeText(req.body?.mentor_name || req.body?.mentorName, 120),
        normalizeText(req.body?.role, 4000),
        normalizeText(req.body?.goal, 4000),
        normalizeText(req.body?.backstory, 12000),
        req.body?.avatar_url !== undefined || req.body?.avatarUrl !== undefined
          ? normalizeText(req.body?.avatar_url || req.body?.avatarUrl, 2000)
          : null,
        normalizeText(req.body?.output_format || req.body?.outputFormat, 20),
        isDefaultProvided ? isDefault : null,
        typeof req.body?.is_hidden === "boolean" ? req.body.is_hidden : typeof req.body?.isHidden === "boolean" ? req.body.isHidden : null
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ detail: "Mentor not found." });
    const existingAgentKey = String(existingLookup.rows[0]?.agent_key || "").trim();
    const nextAgentKey = String(result.rows[0]?.agent_key || "").trim();
    if (existingAgentKey && existingAgentKey !== nextAgentKey) {
      await deleteProjectMentorByAgentKey(existingAgentKey);
    }
    await syncProjectMentorFromStartupMentor(result.rows[0]);
    res.json({ mentor: result.rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ detail: "A mentor with that agent key already exists." });
    }
    next(error);
  }
});

router.delete("/admin/startup/mentors/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    await ensureStartupMentorSchema();
    const id = normalizeInteger(req.params.id, null);
    const mentorLookup = await pool.query("SELECT agent_key FROM startup_mentors WHERE id = $1 LIMIT 1", [id]);
    const result = await pool.query("DELETE FROM startup_mentors WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ detail: "Mentor not found." });
    await deleteProjectMentorByAgentKey(mentorLookup.rows[0]?.agent_key);
    res.json({ message: "Mentor deleted.", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

const STAGE_DOCUMENT_TYPES = ["reference", "policy", "prompt", "example", "research", "template"];
const STAGE_DOCUMENT_SOURCE_TYPES = ["manual", "upload", "url", "seed", "web"];

router.get("/admin/startup/stage-documents", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const stageId = normalizeInteger(req.query?.stage_id, null);
    const phaseId = normalizeInteger(req.query?.phase_id, null);
    const { rows } = await pool.query(
      `SELECT sd.id, sd.phase_id, sd.stage_id, sd.title, sd.document_type, sd.source_type, sd.source_url,
              sd.storage_url, sd.original_filename, sd.content_text, sd.tags, sd.language, sd.is_active,
              sd.created_by, sd.created_at, sd.updated_at,
              js.stage_name, jp.phase_name
       FROM stage_documents sd
       LEFT JOIN journey_stages js ON js.id = sd.stage_id
       LEFT JOIN journey_phases jp ON jp.id = COALESCE(sd.phase_id, js.phase_id)
       WHERE ($1::INTEGER IS NULL OR sd.stage_id = $1)
         AND ($2::INTEGER IS NULL OR sd.phase_id = $2 OR js.phase_id = $2)
       ORDER BY sd.updated_at DESC, sd.id DESC`,
      [stageId, phaseId]
    );
    res.json({ documents: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/stage-documents", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const stageId = normalizeInteger(req.body?.stage_id || req.body?.stageId, null);
    const title = normalizeText(req.body?.title, 240);
    if (!stageId) {
      return res.status(400).json({ detail: "Stage is required." });
    }
    if (!title) {
      return res.status(400).json({ detail: "Document title is required." });
    }

    const documentType = STAGE_DOCUMENT_TYPES.includes(req.body?.document_type) ? req.body.document_type : "reference";
    const sourceType = STAGE_DOCUMENT_SOURCE_TYPES.includes(req.body?.source_type) ? req.body.source_type : "manual";
    const sourceUrl = normalizeText(req.body?.source_url || req.body?.sourceUrl, 2000);
    let contentText = normalizeText(req.body?.content_text || req.body?.contentText, 40000);

    if (sourceType === "url" && !sourceUrl) {
      return res.status(400).json({ detail: "Source URL is required for a URL document." });
    }
    if (sourceType === "manual" && !contentText) {
      return res.status(400).json({ detail: "Content text is required for a manual document." });
    }
    if (sourceType === "url") {
      contentText = (await extractTextFromUrl(sourceUrl)) || contentText;
    }

    const phaseIdRow = await pool.query("SELECT phase_id FROM journey_stages WHERE id = $1 LIMIT 1", [stageId]);
    if (!phaseIdRow.rows.length) {
      return res.status(404).json({ detail: "Stage not found." });
    }

    const result = await pool.query(
      `INSERT INTO stage_documents (
        phase_id, stage_id, title, document_type, source_type, source_url,
        content_text, tags, language, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE(NULLIF($9, ''), 'english'), COALESCE($10, TRUE), $11)
      RETURNING *`,
      [
        phaseIdRow.rows[0].phase_id,
        stageId,
        title,
        documentType,
        sourceType,
        sourceUrl,
        contentText,
        normalizeList(req.body?.tags),
        normalizeText(req.body?.language, 20),
        typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined,
        req.auth.userId
      ]
    );
    const document = result.rows[0];
    await indexStageDocument(document.id, contentText);
    res.status(201).json({ document });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/admin/startup/stage-documents/upload",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  async (req, res, next) => {
    try {
      await requireAdmin(req);
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

      const stageId = normalizeInteger(parsed.fields?.stage_id, null);
      const title = normalizeText(parsed.fields?.title, 240);
      const file = parsed.files?.file;
      if (!stageId) return res.status(400).json({ detail: "Stage is required." });
      if (!title) return res.status(400).json({ detail: "Document title is required." });
      if (!file?.buffer?.length) return res.status(400).json({ detail: "A file is required." });

      const phaseIdRow = await pool.query("SELECT phase_id FROM journey_stages WHERE id = $1 LIMIT 1", [stageId]);
      if (!phaseIdRow.rows.length) return res.status(404).json({ detail: "Stage not found." });

      const documentType = STAGE_DOCUMENT_TYPES.includes(parsed.fields?.document_type) ? parsed.fields.document_type : "reference";
      const publicId = `stage_doc_${crypto.randomBytes(8).toString("hex")}`;
      const [uploaded, extractedText] = await Promise.all([
        uploadToS3({
          buffer: file.buffer,
          filename: `${publicId}${safeExt(file.filename)}`,
          folder: "internlabs/startup/stage-documents",
          contentType: file.contentType,
          publicId
        }),
        extractTextFromFile({ buffer: file.buffer, filename: file.filename, contentType: file.contentType })
      ]);

      const result = await pool.query(
        `INSERT INTO stage_documents (
          phase_id, stage_id, title, document_type, source_type, storage_url,
          storage_public_id, original_filename, content_text, tags, language, is_active, created_by
        )
        VALUES ($1, $2, $3, $4, 'upload', $5, $6, $7, $8, $9, COALESCE(NULLIF($10, ''), 'english'), COALESCE($11, TRUE), $12)
        RETURNING *`,
        [
          phaseIdRow.rows[0].phase_id,
          stageId,
          title,
          documentType,
          uploaded.url,
          uploaded.public_id,
          normalizeText(file.filename, 255),
          extractedText,
          normalizeList(parsed.fields?.tags),
          normalizeText(parsed.fields?.language, 20),
          parseBoolField(parsed.fields?.is_active),
          req.auth.userId
        ]
      );
      const document = result.rows[0];
      await indexStageDocument(document.id, extractedText);
      res.status(201).json({ document });
    } catch (error) {
      next(error);
    }
  }
);

router.put("/admin/startup/stage-documents/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const documentType = STAGE_DOCUMENT_TYPES.includes(req.body?.document_type) ? req.body.document_type : null;
    const sourceType = STAGE_DOCUMENT_SOURCE_TYPES.includes(req.body?.source_type) ? req.body.source_type : null;
    const stageId = normalizeInteger(req.body?.stage_id || req.body?.stageId, null);

    let phaseId = null;
    if (stageId) {
      const phaseIdRow = await pool.query("SELECT phase_id FROM journey_stages WHERE id = $1 LIMIT 1", [stageId]);
      if (!phaseIdRow.rows.length) return res.status(404).json({ detail: "Stage not found." });
      phaseId = phaseIdRow.rows[0].phase_id;
    }

    const result = await pool.query(
      `UPDATE stage_documents
       SET stage_id = COALESCE($2, stage_id),
           phase_id = COALESCE($3, phase_id),
           title = COALESCE(NULLIF($4, ''), title),
           document_type = COALESCE($5, document_type),
           source_type = COALESCE($6, source_type),
           source_url = COALESCE($7, source_url),
           content_text = COALESCE($8, content_text),
           tags = COALESCE($9, tags),
           language = COALESCE(NULLIF($10, ''), language),
           is_active = COALESCE($11, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        stageId,
        phaseId,
        normalizeText(req.body?.title, 240),
        documentType,
        sourceType,
        req.body?.source_url !== undefined ? normalizeText(req.body.source_url, 2000) : null,
        req.body?.content_text !== undefined ? normalizeText(req.body.content_text, 40000) : null,
        Array.isArray(req.body?.tags) || typeof req.body?.tags === "string" ? normalizeList(req.body.tags) : null,
        normalizeText(req.body?.language, 20),
        typeof req.body?.is_active === "boolean" ? req.body.is_active : null
      ]
    );
    const document = result.rows[0];
    if (!document) return res.status(404).json({ detail: "Document not found." });
    if (req.body?.content_text !== undefined) {
      await indexStageDocument(document.id, document.content_text);
    }
    res.json({ document });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/startup/stage-documents/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query("DELETE FROM stage_documents WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ detail: "Document not found." });
    res.json({ message: "Document deleted.", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

const KNOWLEDGE_SOURCE_TYPES = ["manual", "upload", "url", "seed", "web"];

router.get("/admin/startup/global-sources", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { rows } = await pool.query(
      `SELECT ks.id, ks.source_scope, ks.source_type, ks.title, ks.source_url, ks.content_text,
              ks.storage_url, ks.storage_public_id, ks.original_filename,
              ks.tags, ks.is_active, ks.indexed_at, ks.created_at, ks.updated_at
       FROM knowledge_sources ks
       WHERE ks.source_scope = 'global'
       ORDER BY ks.updated_at DESC, ks.id DESC`
    );
    res.json({ sources: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/startup/global-sources", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const title = normalizeText(req.body?.title, 240);
    if (!title) {
      return res.status(400).json({ detail: "Title is required." });
    }

    const sourceType = KNOWLEDGE_SOURCE_TYPES.includes(req.body?.source_type) ? req.body.source_type : "manual";
    const sourceUrl = normalizeText(req.body?.source_url || req.body?.sourceUrl, 2000);
    let contentText = normalizeText(req.body?.content_text || req.body?.contentText, 40000);

    if (sourceType === "url" && !sourceUrl) {
      return res.status(400).json({ detail: "Source URL is required for a URL source." });
    }
    if (sourceType === "manual" && !contentText) {
      return res.status(400).json({ detail: "Content text is required for a manual source." });
    }
    if (sourceType === "url") {
      contentText = (await extractTextFromUrl(sourceUrl)) || contentText;
    }

    const result = await pool.query(
      `INSERT INTO knowledge_sources (
        source_scope, source_type, title, source_url, content_text, tags, is_active
      )
      VALUES ('global', $1, $2, $3, $4, $5, COALESCE($6, TRUE))
      RETURNING *`,
      [
        sourceType,
        title,
        sourceUrl,
        contentText,
        normalizeList(req.body?.tags),
        typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined
      ]
    );
    const source = result.rows[0];
    await indexKnowledgeSource(source.id, contentText);
    res.status(201).json({ source });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/admin/startup/global-sources/upload",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "25mb" }),
  async (req, res, next) => {
    try {
      await requireAdmin(req);
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

      const title = normalizeText(parsed.fields?.title, 240);
      const file = parsed.files?.file;
      if (!title) return res.status(400).json({ detail: "Title is required." });
      if (!file?.buffer?.length) return res.status(400).json({ detail: "A file is required." });

      const publicId = `global_source_${crypto.randomBytes(8).toString("hex")}`;
      const [uploaded, extractedText] = await Promise.all([
        uploadToS3({
          buffer: file.buffer,
          filename: `${publicId}${safeExt(file.filename)}`,
          folder: "internlabs/startup/global-sources",
          contentType: file.contentType,
          publicId
        }),
        extractTextFromFile({ buffer: file.buffer, filename: file.filename, contentType: file.contentType })
      ]);

      const result = await pool.query(
        `INSERT INTO knowledge_sources (
          source_scope, source_type, title, storage_url, storage_public_id, original_filename, content_text, tags, is_active
        )
        VALUES ('global', 'upload', $1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
        RETURNING *`,
        [
          title,
          uploaded.url,
          uploaded.public_id,
          normalizeText(file.filename, 255),
          extractedText,
          normalizeList(parsed.fields?.tags),
          parseBoolField(parsed.fields?.is_active)
        ]
      );
      const source = result.rows[0];
      await indexKnowledgeSource(source.id, extractedText);
      res.status(201).json({ source });
    } catch (error) {
      next(error);
    }
  }
);

router.put("/admin/startup/global-sources/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const sourceType = KNOWLEDGE_SOURCE_TYPES.includes(req.body?.source_type) ? req.body.source_type : null;

    const result = await pool.query(
      `UPDATE knowledge_sources
       SET title = COALESCE(NULLIF($2, ''), title),
           source_type = COALESCE($3, source_type),
           source_url = COALESCE($4, source_url),
           content_text = COALESCE($5, content_text),
           tags = COALESCE($6, tags),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $1 AND source_scope = 'global'
       RETURNING *`,
      [
        id,
        normalizeText(req.body?.title, 240),
        sourceType,
        req.body?.source_url !== undefined ? normalizeText(req.body.source_url, 2000) : null,
        req.body?.content_text !== undefined ? normalizeText(req.body.content_text, 40000) : null,
        Array.isArray(req.body?.tags) || typeof req.body?.tags === "string" ? normalizeList(req.body.tags) : null,
        typeof req.body?.is_active === "boolean" ? req.body.is_active : null
      ]
    );
    const source = result.rows[0];
    if (!source) return res.status(404).json({ detail: "Global source not found." });
    if (req.body?.content_text !== undefined) {
      await indexKnowledgeSource(source.id, source.content_text);
    }
    res.json({ source });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/startup/global-sources/:id", requireAuth, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query(
      "DELETE FROM knowledge_sources WHERE id = $1 AND source_scope = 'global' RETURNING id",
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ detail: "Global source not found." });
    res.json({ message: "Global source deleted.", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

export default router;
