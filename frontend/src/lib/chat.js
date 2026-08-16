import api from "@/lib/api";

export async function uploadResume(file) {
  const formData = new FormData();
  formData.append("resume", file);
  const { data } = await api.post("/project/resume", formData);
  return data;
}

export async function getRecommendations() {
  const { data } = await api.get("/project/recommendations");
  return data;
}

export async function selectProject(projectName) {
  const { data } = await api.post("/project/select", { project_name: projectName });
  return data;
}

export async function sendMentorMessage(payload) {
  const { data } = await api.post("/chat/", payload);
  return data;
}

export async function saveLocalChatMessage(payload) {
  const { data } = await api.post("/chat/local-message", payload);
  return data;
}

export async function getMentorChatHistory(projectName, options = {}) {
  const params = { project_name: projectName };
  if (options.stage_key) params.stage_key = options.stage_key;
  if (Number.isInteger(options.step_number)) params.step_number = options.step_number;
  if (Number.isInteger(options.stage_index)) params.stage_index = options.stage_index;
  const { data } = await api.get("/chat/history", { params });
  return data;
}

export async function reviewStageDocument(payload) {
  const { data } = await api.post("/chat/stage-document-review", payload);
  return data;
}

export async function getMentorBootstrap(projectName) {
  const { data } = await api.post("/chat/bootstrap", { project_name: projectName });
  return data;
}
