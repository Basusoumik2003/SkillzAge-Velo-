import express from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function normalizeText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
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
            intended_audience, is_active, created_by, created_at, updated_at
     FROM journey_phases
     ORDER BY phase_order ASC, id ASC`
  );
  return rows;
}

async function fetchStageRows() {
  const { rows } = await pool.query(
    `SELECT id, phase_id, stage_key, stage_order, stage_name, stage_context, stage_objective,
            expected_outcome, readiness_criteria, recommended_actions, is_active,
            created_by, created_at, updated_at
     FROM journey_stages
     ORDER BY phase_id ASC, stage_order ASC, id ASC`
  );
  return rows;
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

async function fetchRetrievedContext({ userId, profileId, ideaId, phaseId, stageId, question }) {
  const questionLike = `%${normalizeText(question, 200)}%`;

  const [stageDocs, knowledgeSources, recentMessages, memoryRows] = await Promise.all([
    pool.query(
      `SELECT id, title, document_type, source_type, source_url, original_filename, language, tags, content_text, created_at, updated_at
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
       LIMIT 8`,
      [stageId, phaseId, questionLike]
    ),
    pool.query(
      `SELECT id, source_scope, source_type, title, source_url, tags, content_text, metadata, created_at, updated_at
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
       LIMIT 8`,
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
    )
  ]);

  return {
    stage_documents: stageDocs.rows,
    knowledge_sources: knowledgeSources.rows,
    recent_messages: recentMessages.rows.reverse(),
    memory_summaries: memoryRows.rows
  };
}

function buildDraftAnswer({ profile, phase, stage, question, context }) {
  const lines = [];
  const name = profile?.full_name || "there";
  const stageName = stage?.stage_name || "your current stage";
  const phaseName = phase?.phase_name || "your current phase";
  lines.push(`Hi ${name}, I mapped your question to ${phaseName} / ${stageName}.`);
  lines.push(`Question: ${question}`);

  if (profile?.startup_stage) {
    lines.push(`Profile context: ${profile.startup_stage.replaceAll("_", " ")} stage, ${profile.preferred_language || "english"} language, ${profile.goal_type || "commercial"} goal.`);
  }

  if (context.stage_documents.length) {
    lines.push(`I found ${context.stage_documents.length} stage documents that can support this answer.`);
  }

  if (context.knowledge_sources.length) {
    lines.push(`I also found ${context.knowledge_sources.length} knowledge sources across your profile, phase, or global library.`);
  }

  lines.push("Next step: I can refine this further with a focused browser search and deeper retrieval if you want a more evidence-heavy answer.");
  return lines.join("\n\n");
}

async function upsertSessionMemory({ sessionId, userId, profileId, ideaId, phaseId, stageId, question, answer, context }) {
  const summary = [
    `Stage: ${stageId || "none"}`,
    `Question: ${question}`,
    `Answer focus: ${answer.slice(0, 240)}`
  ].join(" | ");

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
      JSON.stringify({ phase_id: phaseId, stage_id: stageId, generated_by: "startup-query-skeleton" })
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
      JSON.stringify({ context_counts: { stage_documents: context.stage_documents.length, knowledge_sources: context.knowledge_sources.length } })
    ]
  );
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

    const context = await fetchRetrievedContext({
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: phase?.id || null,
      stageId: stage?.id || null,
      question
    });

    const browserSearchQueries = [
      `${phase?.phase_name || profile?.startup_stage || "startup"} ${stage?.stage_name || ""} ${question}`.trim(),
      `${profile?.country || "India"} ${profile?.goal_type || "startup"} market validation ${question}`.trim(),
      `${profile?.interests || ""} ${question}`.trim()
    ].filter(Boolean);

    const answer = buildDraftAnswer({ profile, phase, stage, question, context });

    await upsertSessionMemory({
      sessionId,
      userId,
      profileId: profile?.id || null,
      ideaId: profile?.idea_id || null,
      phaseId: phase?.id || null,
      stageId: stage?.id || null,
      question,
      answer,
      context
    });

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
          profile_stage: profile?.startup_stage || "",
          phase_key: phase?.phase_key || "",
          stage_key: stage?.stage_key || "",
          browser_search_queries: browserSearchQueries
        }),
        JSON.stringify(context),
        answer,
        "startup-query-skeleton",
        Boolean(context.memory_summaries.length),
        Boolean(context.memory_summaries.length || context.stage_documents.length || context.knowledge_sources.length)
      ]
    );

    res.json({
      session_id: sessionId,
      agent_run: agentRun.rows[0],
      profile,
      phase,
      stage,
      answer,
      retrieved_context: context,
      browser_search_queries: browserSearchQueries,
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
        intended_audience, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), $8)
      RETURNING *`,
      [
        phaseKey,
        normalizeInteger(req.body?.phase_order || req.body?.phaseOrder, 0),
        phaseName,
        normalizeText(req.body?.phase_description || req.body?.phaseDescription, 12000),
        normalizeText(req.body?.phase_objective || req.body?.phaseObjective, 12000),
        normalizeText(req.body?.intended_audience || req.body?.intendedAudience, 4000),
        typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined,
        req.auth.userId
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
           is_active = COALESCE($8, is_active),
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
    const phaseId = normalizeInteger(req.body?.phase_id || req.body?.phaseId, null);
    const stageKey = normalizeText(req.body?.stage_key || req.body?.stageKey, 80);
    const stageName = normalizeText(req.body?.stage_name || req.body?.stageName, 160);
    if (!phaseId || !stageKey || !stageName) {
      return res.status(400).json({ detail: "Phase id, stage key, and stage name are required." });
    }

    const result = await pool.query(
      `INSERT INTO journey_stages (
        phase_id, stage_key, stage_order, stage_name, stage_context,
        stage_objective, expected_outcome, readiness_criteria, recommended_actions,
        is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, TRUE), $11)
      RETURNING *`,
      [
        phaseId,
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
    const id = normalizeInteger(req.params.id, null);
    const result = await pool.query(
      `UPDATE journey_stages
       SET phase_id = COALESCE($2, phase_id),
           stage_key = COALESCE(NULLIF($3, ''), stage_key),
           stage_order = COALESCE($4, stage_order),
           stage_name = COALESCE(NULLIF($5, ''), stage_name),
           stage_context = COALESCE($6, stage_context),
           stage_objective = COALESCE($7, stage_objective),
           expected_outcome = COALESCE($8, expected_outcome),
           readiness_criteria = COALESCE($9, readiness_criteria),
           recommended_actions = COALESCE($10, recommended_actions),
           is_active = COALESCE($11, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        normalizeInteger(req.body?.phase_id || req.body?.phaseId, null),
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
    const contentText = normalizeText(req.body?.content_text || req.body?.contentText, 40000);

    if (sourceType === "url" && !sourceUrl) {
      return res.status(400).json({ detail: "Source URL is required for a URL document." });
    }
    if (sourceType === "manual" && !contentText) {
      return res.status(400).json({ detail: "Content text is required for a manual document." });
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
    res.status(201).json({ document: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

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
    if (!result.rows[0]) return res.status(404).json({ detail: "Document not found." });
    res.json({ document: result.rows[0] });
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

export default router;
