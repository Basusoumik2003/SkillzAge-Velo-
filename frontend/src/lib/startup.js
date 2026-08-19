import { adminApi, startupApi } from "@/lib/api";

export async function listAdminMentors() {
  const { data } = await adminApi.get("/mentors");
  return data;
}
export async function getStartupWorkspace() {
  const { data } = await startupApi.get("/workspace");
  return data;
}

export async function getStartupMentors() {
  const { data } = await adminApi.get("/startup/mentors");
  return data;
}

export async function getStartupProfile() {
  const { data } = await startupApi.get("/profile");
  return data;
}
export async function listAdminJourneys() {
  const { data } = await adminApi.get("/startup/journeys");
  return data;
}

export async function createAdminJourney(payload) {
  const { data } = await adminApi.post("/startup/journeys", payload);
  return data;
}

export async function updateAdminJourney(id, payload) {
  const { data } = await adminApi.put(`/startup/journeys/${id}`, payload);
  return data;
}

export async function deleteAdminJourney(id) {
  const { data } = await adminApi.delete(`/startup/journeys/${id}`);
  return data;
}
export async function saveStartupProfile(payload) {
  const { data } = await startupApi.post("/profile", payload);
  return data;
}

export async function submitStartupQuery(payload) {
  const { data } = await startupApi.post("/query", payload);
  return data;
}

export async function listAdminJourney() {
  const { data } = await adminApi.get("/startup/journey");
  return data;
}

export async function createAdminJourneyPhase(payload) {
  const { data } = await adminApi.post("/startup/phases", payload);
  return data;
}

export async function updateAdminJourneyPhase(phaseId, payload) {
  const { data } = await adminApi.put(`/startup/phases/${phaseId}`, payload);
  return data;
}

export async function deleteAdminJourneyPhase(phaseId) {
  const { data } = await adminApi.delete(`/startup/phases/${phaseId}`);
  return data;
}

export async function createAdminJourneyStage(payload) {
  const { data } = await adminApi.post("/startup/stages", payload);
  return data;
}

export async function updateAdminJourneyStage(stageId, payload) {
  const { data } = await adminApi.put(`/startup/stages/${stageId}`, payload);
  return data;
}

export async function deleteAdminJourneyStage(stageId) {
  const { data } = await adminApi.delete(`/startup/stages/${stageId}`);
  return data;
}

export async function listAdminStageDocuments(params = {}) {
  const { data } = await adminApi.get("/startup/stage-documents", { params });
  return data;
}

export async function createAdminStageDocument(payload) {
  const { data } = await adminApi.post("/startup/stage-documents", payload);
  return data;
}

export async function updateAdminStageDocument(documentId, payload) {
  const { data } = await adminApi.put(`/startup/stage-documents/${documentId}`, payload);
  return data;
}

export async function deleteAdminStageDocument(documentId) {
  const { data } = await adminApi.delete(`/startup/stage-documents/${documentId}`);
  return data;
}

export async function uploadAdminStageDocument(formData) {
  const { data } = await adminApi.post("/startup/stage-documents/upload", formData);
  return data;
}

export async function listAdminGlobalSources() {
  const { data } = await adminApi.get("/startup/global-sources");
  return data;
}

export async function createAdminGlobalSource(payload) {
  const { data } = await adminApi.post("/startup/global-sources", payload);
  return data;
}

export async function updateAdminGlobalSource(sourceId, payload) {
  const { data } = await adminApi.put(`/startup/global-sources/${sourceId}`, payload);
  return data;
}

export async function deleteAdminGlobalSource(sourceId) {
  const { data } = await adminApi.delete(`/startup/global-sources/${sourceId}`);
  return data;
}

export async function uploadAdminGlobalSource(formData) {
  const { data } = await adminApi.post("/startup/global-sources/upload", formData);
  return data;
}

export async function listAdminStartupMentors() {
  const { data } = await adminApi.get("/startup/mentors");
  return data;
}

export async function createAdminStartupMentor(payload) {
  const { data } = await adminApi.post("/startup/mentors", payload);
  return data;
}

export async function updateAdminStartupMentor(mentorId, payload) {
  const { data } = await adminApi.put(`/startup/mentors/${mentorId}`, payload);
  return data;
}

export async function deleteAdminStartupMentor(mentorId) {
  const { data } = await adminApi.delete(`/startup/mentors/${mentorId}`);
  return data;
}


export async function getAdminStartupDocumentAccess() {
  const { data } = await adminApi.get("/startup/document-access");
  return data;
}

export async function updateAdminStartupDocumentAccess(rules) {
  const { data } = await adminApi.put(
    "/startup/document-access",
    { rules }
  );

  return data;
}