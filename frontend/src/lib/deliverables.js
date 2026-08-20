import api from "@/lib/api";

// ---------------------------------------------------------------------------
// Admin: deliverable configuration (Backend/app/routes/deliverables.py)
// ---------------------------------------------------------------------------

export async function listStageDeliverables(stageId) {
  const { data } = await api.get(`/deliverables/admin/stages/${stageId}/deliverables`);
  return data;
}

export async function createStageDeliverable(payload) {
  const { data } = await api.post("/deliverables/admin/deliverables", payload);
  return data;
}

export async function updateStageDeliverable(deliverableId, payload) {
  const { data } = await api.put(`/deliverables/admin/deliverables/${deliverableId}`, payload);
  return data;
}

export async function deleteStageDeliverable(deliverableId) {
  await api.delete(`/deliverables/admin/deliverables/${deliverableId}`);
}

export async function reorderStageDeliverables(stageId, items) {
  const { data } = await api.post("/deliverables/admin/deliverables/reorder", {
    stage_id: stageId,
    items
  });
  return data;
}

// ---------------------------------------------------------------------------
// Student: reading deliverables + submitting
// ---------------------------------------------------------------------------

export async function getCurrentStageDeliverables() {
  const { data } = await api.get("/deliverables/student/current-stage");
  return data;
}

export async function getStageDeliverablesForStudent(stageId) {
  const { data } = await api.get(`/deliverables/student/stages/${stageId}`);
  return data;
}

export async function submitDeliverable(payload) {
  const { data } = await api.post("/deliverables/student/submissions", payload);
  return data;
}

export async function resubmitDeliverable(deliverableId, payload) {
  const { data } = await api.post(`/deliverables/student/deliverables/${deliverableId}/resubmit`, payload);
  return data;
}

export async function presignSubmissionFile(submissionId, payload) {
  const { data } = await api.post(`/deliverables/student/submissions/${submissionId}/files/presign`, payload);
  return data;
}

export async function attachSubmissionFile(submissionId, payload) {
  const { data } = await api.post(`/deliverables/student/submissions/${submissionId}/files`, payload);
  return data;
}

// Uploads the raw file straight to S3 using a presigned URL obtained from
// the backend, then attaches the resulting S3 key/url to the submission.
// The file bytes never pass through our own servers.
export async function uploadDeliverableFile(submissionId, file) {
  const presign = await presignSubmissionFile(submissionId, {
    file_name: file.name,
    file_type: file.type || "application/octet-stream",
    file_size: file.size || 0
  });

  await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`File upload to storage failed (${response.status}).`);
    }
  });

  return attachSubmissionFile(submissionId, {
    file_name: file.name,
    file_type: file.type || "",
    file_size: file.size || 0,
    s3_key: presign.s3_key,
    s3_url: presign.s3_url
  });
}

export async function getSubmissionStatus(submissionId) {
  const { data } = await api.get(`/deliverables/student/submissions/${submissionId}`);
  return data;
}

export async function getReviewFeedback(submissionId) {
  const { data } = await api.get(`/deliverables/student/submissions/${submissionId}/reviews`);
  return data;
}

// ---------------------------------------------------------------------------
// Review (admin/mentor)
// ---------------------------------------------------------------------------

export async function createAiReview(submissionId) {
  const { data } = await api.post(`/deliverables/reviews/ai/${submissionId}`);
  return data;
}

export async function createMentorReview(submissionId, payload) {
  const { data } = await api.post(`/deliverables/reviews/mentor/${submissionId}`, payload);
  return data;
}

export async function approveSubmission(submissionId, payload = {}) {
  const { data } = await api.post(`/deliverables/reviews/${submissionId}/approve`, payload);
  return data;
}

export async function rejectSubmission(submissionId, payload = {}) {
  const { data } = await api.post(`/deliverables/reviews/${submissionId}/reject`, payload);
  return data;
}

export async function requestResubmission(submissionId, payload = {}) {
  const { data } = await api.post(`/deliverables/reviews/${submissionId}/request-resubmission`, payload);
  return data;
}
