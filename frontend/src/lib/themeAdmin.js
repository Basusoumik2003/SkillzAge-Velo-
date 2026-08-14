import axios from "axios";
import { API_BASE_URL } from "./api";

const THEMES_BASE_PATH = "/api/themes";
const ADMIN_THEMES_BASE_PATH = "/api/admin/themes";
const GATEWAY_BASE_URL = API_BASE_URL.replace(/\/+$/, "");

function buildThemeUrl(path, adminAlias = false) {
  if (adminAlias && path.startsWith(THEMES_BASE_PATH)) {
    return `${GATEWAY_BASE_URL}${ADMIN_THEMES_BASE_PATH}${path.slice(THEMES_BASE_PATH.length)}`;
  }
  return `${GATEWAY_BASE_URL}${path}`;
}

function getAuthHeaders() {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("internlabs_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requestTheme(method, path, config = {}) {
  const { headers, ...rest } = config;
  const requestConfig = {
    method,
    url: buildThemeUrl(path),
    headers: { ...getAuthHeaders(), ...(headers || {}) },
    ...rest,
  };
  try {
    return await axios.request(requestConfig);
  } catch (error) {
    if (error?.response?.status === 404 && path.startsWith(THEMES_BASE_PATH)) {
      return axios.request({ ...requestConfig, url: buildThemeUrl(path, true) });
    }
    throw error;
  }
}

export async function listAdminThemes() { const { data } = await requestTheme("get", THEMES_BASE_PATH); return data; }
export async function createAdminTheme(formData) { const { data } = await requestTheme("post", THEMES_BASE_PATH, { data: formData, headers: { "Content-Type": "multipart/form-data" } }); return data; }
export async function publishAdminTheme(id) { const { data } = await requestTheme("post", `${THEMES_BASE_PATH}/${id}/publish`); return data; }
export async function archiveAdminTheme(id) { const { data } = await requestTheme("post", `${THEMES_BASE_PATH}/${id}/archive`); return data; }
export async function duplicateAdminTheme(id) { const { data } = await requestTheme("post", `${THEMES_BASE_PATH}/${id}/duplicate`); return data; }
export async function deleteAdminTheme(id) { const { data } = await requestTheme("delete", `${THEMES_BASE_PATH}/${id}`); return data; }
