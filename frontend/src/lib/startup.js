import { adminApi, startupApi } from "@/lib/api";

// ======================================================
// ADMIN - MENTORS
// ======================================================

export async function listAdminMentors() {
  const { data } = await adminApi.get("/mentors");
  return data;
}

// ======================================================
// STUDENT - STARTUP WORKSPACE
// ======================================================
//
// IMPORTANT:
// journeyId is optional.
//
// If provided, it is sent as:
// GET /api/startup/workspace?journey_id=<id>
//
// This allows the workspace to load the exact journey
// selected from the Products page instead of depending
// only on student_profiles.journey_id.
// ======================================================

export async function getStartupWorkspace(journeyId = "") {
  const normalizedJourneyId = String(journeyId || "").trim();

  const { data } = await startupApi.get("/workspace", {
    params: normalizedJourneyId
      ? {
          journey_id: normalizedJourneyId
        }
      : undefined
  });

  return data;
}

// ======================================================
// STUDENT - LIST JOURNEYS
// ======================================================

export async function listStartupJourneys() {
  const { data } = await startupApi.get("/journeys");
  return data;
}

// ======================================================
// STUDENT - MARK JOURNEY STAGE COMPLETE
// ======================================================
//
// Persists completion to student_stage_progress so the workspace resumes from
// the right stage on the next visit. Idempotent.

export async function markStartupStageComplete(stageId) {
  const normalizedStageId = Number(stageId);

  if (!Number.isFinite(normalizedStageId) || normalizedStageId <= 0) {
    throw new Error("Invalid stage id.");
  }

  const { data } = await startupApi.post(
    `/stages/${normalizedStageId}/complete`
  );

  return data;
}

// ======================================================
// STUDENT - SELECT JOURNEY
// ======================================================

export async function selectStartupJourney(journeyId) {
  const normalizedJourneyId = Number(journeyId);

  if (!Number.isFinite(normalizedJourneyId) || normalizedJourneyId <= 0) {
    throw new Error("Invalid journey ID.");
  }

  const { data } = await startupApi.post("/journey/select", {
    journey_id: normalizedJourneyId
  });

  return data;
}

// ======================================================
// STARTUP MENTORS
// ======================================================

export async function getStartupMentors() {
  const { data } = await adminApi.get("/startup/mentors");
  return data;
}

// ======================================================
// STARTUP PROFILE
// ======================================================

export async function getStartupProfile() {
  const { data } = await startupApi.get("/profile");
  return data;
}

// ======================================================
// ADMIN - JOURNEYS
// ======================================================

export async function listAdminJourneys() {
  const { data } = await adminApi.get("/startup/journeys");
  return data;
}

export async function createAdminJourney(payload) {
  const { data } = await adminApi.post(
    "/startup/journeys",
    payload
  );

  return data;
}

export async function updateAdminJourney(id, payload) {
  const { data } = await adminApi.put(
    `/startup/journeys/${id}`,
    payload
  );

  return data;
}

export async function deleteAdminJourney(id) {
  const { data } = await adminApi.delete(
    `/startup/journeys/${id}`
  );

  return data;
}

// ======================================================
// STARTUP PROFILE SAVE
// ======================================================

export async function saveStartupProfile(payload) {
  const { data } = await startupApi.post(
    "/profile",
    payload
  );

  return data;
}

// ======================================================
// STARTUP QUERY
// ======================================================

export async function submitStartupQuery(payload) {
  const { data } = await startupApi.post(
    "/query",
    payload
  );

  return data;
}

// ======================================================
// ADMIN - SINGLE JOURNEY
// ======================================================

export async function listAdminJourney(journeyId) {
  const { data } = await adminApi.get(
    "/startup/journey",
    {
      params:
        journeyId !== undefined &&
        journeyId !== null &&
        String(journeyId).trim() !== ""
          ? {
              journey_id: journeyId
            }
          : undefined
    }
  );

  return data;
}

// ======================================================
// ADMIN - PHASES
// ======================================================

export async function createAdminJourneyPhase(payload) {
  const { data } = await adminApi.post(
    "/startup/phases",
    payload
  );

  return data;
}

export async function updateAdminJourneyPhase(
  phaseId,
  payload
) {
  const { data } = await adminApi.put(
    `/startup/phases/${phaseId}`,
    payload
  );

  return data;
}

export async function deleteAdminJourneyPhase(phaseId) {
  const { data } = await adminApi.delete(
    `/startup/phases/${phaseId}`
  );

  return data;
}

// ======================================================
// ADMIN - STAGES
// ======================================================

export async function createAdminJourneyStage(payload) {
  const { data } = await adminApi.post(
    "/startup/stages",
    payload
  );

  return data;
}

export async function updateAdminJourneyStage(
  stageId,
  payload
) {
  const { data } = await adminApi.put(
    `/startup/stages/${stageId}`,
    payload
  );

  return data;
}

export async function deleteAdminJourneyStage(stageId) {
  const { data } = await adminApi.delete(
    `/startup/stages/${stageId}`
  );

  return data;
}

// ======================================================
// ADMIN - STAGE DOCUMENTS
// ======================================================

export async function listAdminStageDocuments(
  params = {}
) {
  const { data } = await adminApi.get(
    "/startup/stage-documents",
    {
      params
    }
  );

  return data;
}

export async function createAdminStageDocument(
  payload
) {
  const { data } = await adminApi.post(
    "/startup/stage-documents",
    payload
  );

  return data;
}

export async function updateAdminStageDocument(
  documentId,
  payload
) {
  const { data } = await adminApi.put(
    `/startup/stage-documents/${documentId}`,
    payload
  );

  return data;
}

export async function deleteAdminStageDocument(
  documentId
) {
  const { data } = await adminApi.delete(
    `/startup/stage-documents/${documentId}`
  );

  return data;
}

export async function uploadAdminStageDocument(
  formData
) {
  const { data } = await adminApi.post(
    "/startup/stage-documents/upload",
    formData
  );

  return data;
}

// ======================================================
// ADMIN - GLOBAL SOURCES
// ======================================================

export async function listAdminGlobalSources() {
  const { data } = await adminApi.get(
    "/startup/global-sources"
  );

  return data;
}

export async function createAdminGlobalSource(
  payload
) {
  const { data } = await adminApi.post(
    "/startup/global-sources",
    payload
  );

  return data;
}

export async function updateAdminGlobalSource(
  sourceId,
  payload
) {
  const { data } = await adminApi.put(
    `/startup/global-sources/${sourceId}`,
    payload
  );

  return data;
}

export async function deleteAdminGlobalSource(
  sourceId
) {
  const { data } = await adminApi.delete(
    `/startup/global-sources/${sourceId}`
  );

  return data;
}

export async function uploadAdminGlobalSource(
  formData
) {
  const { data } = await adminApi.post(
    "/startup/global-sources/upload",
    formData
  );

  return data;
}

// ======================================================
// ADMIN - STARTUP MENTORS
// ======================================================

export async function listAdminStartupMentors() {
  const { data } = await adminApi.get(
    "/startup/mentors"
  );

  return data;
}

export async function createAdminStartupMentor(
  payload
) {
  const { data } = await adminApi.post(
    "/startup/mentors",
    payload
  );

  return data;
}

export async function updateAdminStartupMentor(
  mentorId,
  payload
) {
  const { data } = await adminApi.put(
    `/startup/mentors/${mentorId}`,
    payload
  );

  return data;
}

export async function deleteAdminStartupMentor(
  mentorId
) {
  const { data } = await adminApi.delete(
    `/startup/mentors/${mentorId}`
  );

  return data;
}