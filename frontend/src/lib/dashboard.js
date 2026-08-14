import api, { dashboardApi, paymentApi } from "@/lib/api";
import { getStoredUser } from "@/lib/authStorage";

const GITHUB_STAGE_EVENT_FAILURE = "internlabs_github_stage_event_failed";

async function triggerGithubStageEvent(payload) {
  const user = getStoredUser();
  const userId = Number(user?.id || user?.user_id || 0);
  const projectName = String(payload?.project_name || "").trim();
  const stepNumber = Number(payload?.step_number || 0);
  const stageIndex = Number(payload?.stage_index || 0);
  const status = String(payload?.status || "").trim().toLowerCase();

  if (!userId || !projectName || stepNumber < 1 || stageIndex < 0) return;
  if (status !== "working") return;

  await api.post("/github/stage-event", {
    user_id: userId,
    project_name: projectName,
    step_number: stepNumber,
    stage_index: stageIndex,
    event_type: "stage_entered",
    actor: "student",
    previous_status: "undone",
    current_status: "working",
    source_payload: {
      source: "workspace_stage_progress",
      status,
      understood: Boolean(payload?.understood)
    }
  });
}

export async function getDashboardStats() {
  const { data } = await dashboardApi.get("/stats");
  return data;
}

export async function getDashboardProjects() {
  const { data } = await dashboardApi.get("/projects");
  return data;
}

export async function getDashboardMentors() {
  const { data } = await dashboardApi.get("/mentors");
  return data;
}

export async function getPopularProjects() {
  const { data } = await dashboardApi.get("/popular-projects");
  return data;
}

export async function getRecommendedProjects({ offset = 0 } = {}) {
  const { data } = await dashboardApi.get("/recommendations", { params: { offset } });
  return data;
}

export async function getCatalogProject({ title }) {
  const { data } = await dashboardApi.get("/catalog-project", { params: { title } });
  return data;
}

export async function startDashboardProject(payload) {
  const { data } = await dashboardApi.post("/projects/start", payload);
  return data;
}

export async function getProjectAssignStatus() {
  const { data } = await dashboardApi.get("/project-assign/status");
  return data;
}

export async function getDashboardProgress() {
  const { data } = await dashboardApi.get("/progress");
  return data;
}

export async function getWorkspaceStatus() {
  const { data } = await dashboardApi.get("/workspace-status");
  return data;
}

export async function sendPresenceHeartbeat() {
  const { data } = await dashboardApi.post("/presence/heartbeat");
  return data;
}

export async function completeDashboardTask(payload) {
  const { data } = await dashboardApi.post("/tasks/complete", payload);
  return data;
}

export async function updateDashboardProgress(payload) {
  const { data } = await dashboardApi.post("/progress", payload);
  return data;
}

export async function getDashboardStageProgress({ project_name }) {
  const { data } = await dashboardApi.get("/stage-progress", { params: { project_name } });
  return data;
}

export async function updateDashboardStageProgress(payload) {
  const { data } = await api.post("/api/dashboard/stage-progress", payload);
  triggerGithubStageEvent(payload).catch((error) => {
    const detail = {
      message: String(error?.response?.data?.detail || error?.message || "Failed to start GitHub review automatically."),
      status: Number(error?.response?.status || 0),
      project_name: String(payload?.project_name || "").trim(),
      step_number: Number(payload?.step_number || 0),
      stage_index: Number(payload?.stage_index || 0)
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(GITHUB_STAGE_EVENT_FAILURE, { detail }));
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("stage_event_trigger_failed", detail);
    }
  });
  return data;
}

export async function uploadDashboardStageDocument({ project_name, step_number, stage_index, file, files }) {
  const form = new FormData();
  form.set("project_name", project_name);
  form.set("step_number", String(step_number));
  form.set("stage_index", String(stage_index));
  const uploadFiles = Array.isArray(files) && files.length ? files : file ? [file] : [];
  uploadFiles.forEach((item, index) => {
    form.append("documents", item);
    if (index === 0) form.set("document", item);
  });
  const { data } = await dashboardApi.post("/stage-progress/document", form);
  return data;
}

export async function markDashboardStageDocumentReviewFailed(payload) {
  const { data } = await dashboardApi.post("/stage-progress/document/review-failed", payload);
  return data;
}

export async function requestProjectAssignment(payload = {}) {
  const { data } = await dashboardApi.post("/project-assign/request", payload);
  return data;
}

export async function markDashboardPaymentSuccess(payload = {}) {
  const { data } = await paymentApi.post("/mock-success", payload);
  return data;
}

export async function getCoinBalance() {
  const { data } = await api.get("/api/dashboard/payments/coins");
  return data;
}

export async function getRecentTransactions({ limit = 50 } = {}) {
  const { data } = await api.get("/api/dashboard/payments/recent", { params: { limit } });
  return data;
}

export async function createRazorpayOrder(payload = {}) {
  const { data } = await api.post("/api/dashboard/payments/razorpay/order", payload);
  return data;
}

export async function getCouponQuote(payload = {}) {
  const { data } = await api.post("/api/dashboard/payments/coupon/quote", payload);
  return data;
}

export async function verifyRazorpayPayment(payload) {
  const { data } = await api.post("/api/dashboard/payments/razorpay/verify", payload);
  return data;
}

export async function submitCertificateRequest(formData) {
  const { data } = await dashboardApi.post("/certificate-requests", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}
