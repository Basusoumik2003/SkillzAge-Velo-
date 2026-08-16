import { AUTH_API_BASE_URL, PROFILE_API_BASE_URL, profileApi } from "@/lib/api";

const PROFILE_ENDPOINT = String(PROFILE_API_BASE_URL || "").replace(/\/+$/, "");

export function resolveAuthAssetUrl(urlPath) {
  const raw = String(urlPath || "");
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${AUTH_API_BASE_URL}${raw}`;
  return raw;
}

export async function getProfile() {
  const { data } = await profileApi.get(PROFILE_ENDPOINT);
  return data;
}

export async function updateProfile(formData) {
  const { data } = await profileApi.put(PROFILE_ENDPOINT, formData);
  return data;
}

export async function deleteProfile({ filesOnly = false } = {}) {
  const { data } = await profileApi.delete(PROFILE_ENDPOINT, {
    params: filesOnly ? { files_only: "1" } : undefined
  });
  return data;
}

export async function getLatestSelfIntro() {
  const { data } = await profileApi.get(`${PROFILE_ENDPOINT}/self-intro/latest`);
  return data;
}

export async function uploadSelfIntroVideo({ file, durationSeconds }) {
  const form = new FormData();
  form.append("video", file);
  form.append("duration_seconds", String(durationSeconds));

  const { data } = await profileApi.post(`${PROFILE_ENDPOINT}/self-intro/video`, form);
  return data;
}

export async function retrySelfIntroAnalysis(submissionId) {
  const { data } = await profileApi.post(`${PROFILE_ENDPOINT}/self-intro/${submissionId}/retry`);
  return data;
}

export async function getSelfIntroVideoBlob(submissionId) {
  const { data } = await profileApi.get(`${PROFILE_ENDPOINT}/self-intro/${submissionId}/video`, {
    responseType: "blob"
  });
  return data;
}

