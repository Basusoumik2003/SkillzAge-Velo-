import { AUTH_SERVICE_API_BASE_URL, profileApi } from "@/lib/api";

export function resolveAuthAssetUrl(urlPath) {
  const raw = String(urlPath || "");
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const authBase = String(AUTH_SERVICE_API_BASE_URL || "").replace(/\/+$/, "");
  if (raw.startsWith("/api/auth/")) return raw;
  if (raw.startsWith("/")) return `${authBase}${raw}`;
  return raw;
}

export async function getProfile() {
  const { data } = await profileApi.get("/");
  return data;
}

export async function updateProfile(formData) {
  const { data } = await profileApi.put("/", formData);
  return data;
}

export async function deleteProfile({ filesOnly = false } = {}) {
  const { data } = await profileApi.delete("/", {
    params: filesOnly ? { files_only: "1" } : undefined
  });
  return data;
}

export async function getLatestSelfIntro() {
  const { data } = await profileApi.get("/self-intro/latest");
  return data;
}

export async function uploadSelfIntroVideo({ file, durationSeconds }) {
  const form = new FormData();
  form.append("video", file);
  form.append("duration_seconds", String(durationSeconds));

  const { data } = await profileApi.post("/self-intro/video", form);
  return data;
}

export async function retrySelfIntroAnalysis(submissionId) {
  const { data } = await profileApi.post(`/self-intro/${submissionId}/retry`);
  return data;
}

export async function getSelfIntroVideoBlob(submissionId) {
  const { data } = await profileApi.get(`/self-intro/${submissionId}/video`, {
    responseType: "blob"
  });
  return data;
}

