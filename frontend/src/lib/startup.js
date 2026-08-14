import { adminApi, startupApi } from "@/lib/api";

export async function getStartupWorkspace() {
  const { data } = await startupApi.get("/workspace");
  return data;
}

export async function getStartupProfile() {
  const { data } = await startupApi.get("/profile");
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
