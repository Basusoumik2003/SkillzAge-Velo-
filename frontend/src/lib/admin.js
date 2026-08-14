import { adminApi, authApi, resolveAdminAssetUrl } from "@/lib/api";

export async function listAdminProjects() {
  const { data } = await adminApi.get("/projects");
  return data;
}

export async function listAdminCompanies() {
  const { data } = await adminApi.get("/companies");
  return data;
}

export async function createAdminCompany(payload) {
  const { data } = await adminApi.post("/companies", payload);
  return data;
}

export async function listAdminProjectDocuments(projectId) {
  const { data } = await adminApi.get(`/projects/${projectId}/documents`);
  return data;
}

export async function createAdminProjectDocument(projectId, payload) {
  const { data } = await adminApi.post(
    `/projects/${projectId}/documents`,
    payload,
  );
  return data;
}

export async function getAdminProjectAgentDocumentAccess(projectId) {
  const { data } = await adminApi.get(
    `/projects/${projectId}/agent-document-access`,
  );
  return data;
}

export async function updateAdminProjectAgentDocumentAccess(projectId, payload) {
  const { data } = await adminApi.put(
    `/projects/${projectId}/agent-document-access`,
    payload,
  );
  return data;
}

export async function archiveAdminProjectDocument(documentId) {
  const { data } = await adminApi.post(`/project-documents/${documentId}/archive`);
  return data;
}

export async function deleteAdminProjectDocument(documentId) {
  const { data } = await adminApi.delete(`/project-documents/${documentId}`);
  return data;
}

export async function listAdminGlobalDocuments(params = {}) {
  const { data } = await adminApi.get("/global-documents", { params });
  return data;
}

export async function createAdminGlobalDocument(payload) {
  const { data } = await adminApi.post("/global-documents", payload);
  return data;
}

export async function getAdminGlobalDocumentAccess() {
  const { data } = await adminApi.get("/global-document-access");
  return data;
}

export async function updateAdminGlobalDocumentAccess(payload) {
  const { data } = await adminApi.put("/global-document-access", payload);
  return data;
}

export async function reindexAdminGlobalDocument(documentId) {
  const { data } = await adminApi.post(`/global-documents/${documentId}/reindex`);
  return data;
}

export async function archiveAdminGlobalDocument(documentId) {
  const { data } = await adminApi.post(`/global-documents/${documentId}/archive`);
  return data;
}

export async function deleteAdminGlobalDocument(documentId) {
  const { data } = await adminApi.delete(`/global-documents/${documentId}`);
  return data;
}

export async function getAdminGlobalDocumentPreviewUrl(documentId) {
  const { data } = await adminApi.get(`/global-documents/${documentId}/preview-url`);
  return data;
}

export async function getAdminProjectDocumentPreviewUrl(documentId) {
  const { data } = await adminApi.get(`/project-documents/${documentId}/preview-url`);
  return data;
}

export async function getAdminSettings() {
  const { data } = await adminApi.get("/settings");
  return data;
}

export async function updateAdminSettings(payload) {
  const { data } = await adminApi.put("/settings", payload);
  return data;
}

export async function listAdminCategoryIcons() {
  const { data } = await adminApi.get("/category-icons");
  return data;
}

export async function uploadAdminCategoryIcon(category, formData) {
  const { data } = await adminApi.post("/category-icons/" + category, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadAdminCategoryBackground(category, formData) {
  const { data } = await adminApi.post("/category-icons/" + category + "/background", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
export async function listAdminDemoDocuments() {
  const { data } = await adminApi.get("/demo-documents");
  return data;
}

export async function createAdminDemoDocument(formData) {
  const { data } = await adminApi.post("/demo-documents", formData);
  return data;
}

export async function updateAdminDemoDocument(documentId, payload) {
  const { data } = await adminApi.patch(`/demo-documents/${documentId}`, payload);
  return data;
}

export async function getAdminDemoDocumentPreviewUrl(documentId) {
  const { data } = await adminApi.get(`/demo-documents/${documentId}/preview-url`);
  return data;
}

export async function getAdminGithubSettings() {
  const { data } = await adminApi.get("/github-settings");
  return data;
}

export async function updateAdminGithubSettings(payload) {
  const { data } = await adminApi.put("/github-settings", payload);
  return data;
}

export async function getAdminCredential() {
  const { data } = await adminApi.get("/admin-credential");
  return data;
}

export async function updateAdminCredential(payload) {
  const { data } = await adminApi.put("/admin-credential", payload);
  return data;
}

export async function uploadAdminRecommendationProjectFile(formData) {
  const { data } = await adminApi.post(
    "/recommendation-project-file",
    formData,
  );
  return data;
}

export async function listAdminRecommendationLogs() {
  const { data } = await adminApi.get("/recommendation-logs");
  return data;
}

export async function createAdminProject(payload) {
  const { data } = await adminApi.post("/projects", payload);
  return data;
}

export async function bulkUploadAdminProjects(formData, onUploadProgress) {
  const { data } = await adminApi.post("/projects/bulk-upload", formData, {
    onUploadProgress,
  });
  return data;
}

export async function getAdminProjectDraft() {
  const { data } = await adminApi.get("/project-draft");
  return data;
}

export async function saveAdminProjectDraft(payload, signal) {
  const config = signal ? { signal } : undefined;
  const { data } = await adminApi.put(
    "/project-draft",
    { draft: payload },
    config,
  );
  return data;
}

export async function deleteAdminProjectDraft() {
  const { data } = await adminApi.delete("/project-draft");
  return data;
}

export async function setAdminProjectActive(projectId, isActive) {
  const { data } = await adminApi.patch(`/projects/${projectId}`, {
    is_active: isActive,
  });
  return data;
}

export async function getAdminOverview() {
  const { data } = await adminApi.get("/overview");
  return data;
}

export async function getAdminTokenUsage() {
  const { data } = await adminApi.get("/token-usage");
  return data;
}

export async function getAdminRagMonitoring(params = {}) {
  const { data } = await adminApi.get("/rag-monitoring", { params });
  return data;
}

export async function getAdminStageDocumentReviews(params = {}) {
  const { data } = await adminApi.get("/stage-document-reviews", { params });
  return data;
}

export async function getAdminProject(projectId) {
  const { data } = await adminApi.get(`/projects/${projectId}`);
  return data;
}

export async function updateAdminProject(projectId, payload) {
  const { data } = await adminApi.put(`/projects/${projectId}`, payload);
  return data;
}

export async function deleteAdminProject(projectId) {
  const { data } = await adminApi.delete(`/projects/${projectId}`);
  return data;
}

export async function listProjectAssignRequests() {
  const { data } = await adminApi.get("/project-assign/requests");
  return data;
}

export async function listAssignedProjects() {
  const { data } = await adminApi.get("/project-assign/assigned");
  return data;
}

export async function getAssignedProjectChats(progressId, assignment = {}) {
  const { data } = await adminApi.get(
    `/project-assign/assigned/${progressId}/chats`,
    {
      params: {
        user_id: assignment.user_id || undefined,
        project_name: assignment.project_name || undefined,
      },
    },
  );
  return data;
}

export async function searchAdminUsers(query) {
  const { data } = await authApi.get("/api/admin/users", {
    params: { q: query },
  });
  return data;
}

export async function listAdminUsers(params = {}) {
  const { data } = await adminApi.get("/users", {
    params: {
      mode: "management",
      ...params,
    },
  });
  return data;
}

export async function updateAdminUserStatus(userId, isActive) {
  const { data } = await adminApi.patch(`/users/${userId}/status`, {
    is_active: isActive,
  });
  return data;
}

export async function deleteAdminUser(userId) {
  const { data } = await adminApi.delete(`/users/${userId}`);
  return data;
}

export async function listAdminS3Objects(params = {}) {
  const { data } = await adminApi.get("/s3-objects", { params });
  return data;
}

export async function getAdminS3ObjectPreviewUrl(key) {
  const { data } = await adminApi.get("/s3-objects/preview-url", {
    params: { key },
  });
  return data;
}

export async function deleteAdminS3Object(key) {
  const { data } = await adminApi.delete("/s3-objects", {
    data: { key },
  });
  return data;
}

export async function assignProjectToUser(payload) {
  const { data } = await adminApi.post("/project-assign", payload);
  return data;
}

export async function updateAssignedProject(progressId, payload) {
  const { data } = await adminApi.put(
    `/project-assign/assigned/${progressId}`,
    payload,
  );
  return data;
}

export async function abandonAssignedProject(progressId) {
  const { data } = await adminApi.post(
    `/project-assign/assigned/${progressId}/abandon`,
  );
  return data;
}

export async function revertAbandonedAssignedProject(userId, payload = {}) {
  const { data } = await adminApi.post(
    `/project-assign/users/${userId}/revert-abandoned`,
    payload,
  );
  return data;
}

export async function listAdminMentors() {
  const { data } = await authApi.get("/api/admin/mentors");
  return data;
}

export async function createAdminMentor(formData) {
  const { data } = await authApi.post("/api/admin/mentors", formData);
  return data;
}

export async function updateAdminMentor(mentorId, formData) {
  const { data } = await authApi.put(
    `/api/admin/mentors/${mentorId}`,
    formData,
  );
  return data;
}

export async function deleteAdminMentor(mentorId) {
  const { data } = await authApi.delete(`/api/admin/mentors/${mentorId}`);
  return data;
}

export async function listAdminTestimonials() {
  const { data } = await adminApi.get("/testimonials");
  return data;
}

function normalizeAdminHomeCertificate(certificate) {
  return {
    ...(certificate || {}),
    image_url: resolveAdminAssetUrl(certificate?.image_url)
  };
}

export async function listAdminHomeCertificates() {
  const { data } = await adminApi.get("/home-certificates");
  return {
    ...data,
    certificates: Array.isArray(data?.certificates) ? data.certificates.map(normalizeAdminHomeCertificate) : []
  };
}

export async function createAdminHomeCertificate(payload) {
  const { data } = await adminApi.post("/home-certificates", payload);
  return data;
}

export async function updateAdminHomeCertificate(certificateId, payload) {
  const { data } = await adminApi.put(`/home-certificates/${certificateId}`, payload);
  return data;
}

export async function deleteAdminHomeCertificate(certificateId) {
  const { data } = await adminApi.delete(`/home-certificates/${certificateId}`);
  return data;
}

export async function createAdminTestimonial(formData) {
  const { data } = await adminApi.post("/testimonials", formData);
  return data;
}

export async function updateAdminTestimonial(testimonialId, formData) {
  const { data } = await adminApi.put(
    `/testimonials/${testimonialId}`,
    formData,
  );
  return data;
}

export async function deleteAdminTestimonial(testimonialId) {
  const { data } = await adminApi.delete(`/testimonials/${testimonialId}`);
  return data;
}

export async function listAdminCertificateRequests() {
  const { data } = await adminApi.get("/certificate-requests");
  return data;
}

export async function issueAdminCertificate(requestId, file) {
  const formData = new FormData();
  formData.append("certificate", file);
  const { data } = await adminApi.post(
    `/certificate-requests/${requestId}/certificate`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function listAdminContactMessages() {
  const { data } = await adminApi.get("/contact-messages");
  return data;
}


export async function listNewsletterSubscribers() {
  const { data } = await adminApi.get("/newsletter/subscribers");
  return data;
}

export async function listAdminNewsletters() {
  const { data } = await adminApi.get("/newsletters");
  return data;
}

export async function createAdminNewsletter(formData) {
  const { data } = await adminApi.post("/newsletters", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function updateAdminNewsletter(newsletterId, formData) {
  const { data } = await adminApi.put(`/newsletters/${newsletterId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function sendAdminNewsletter(newsletterId, scope = "all") {
  const { data } = await adminApi.post(`/newsletters/${newsletterId}/send`, { scope });
  return data;
}

export async function deleteAdminNewsletter(newsletterId) {
  const { data } = await adminApi.delete(`/newsletters/${newsletterId}`);
  return data;
}
export async function getAdminVideoAnalytics() {
  const { data } = await adminApi.get("/video-analytics");
  return data;
}

export async function getAdminSubmissionVideoUrl(submissionId) {
  const { data } = await adminApi.get(`/video-analytics/submission/${submissionId}/video-url`);
  return data;
}


