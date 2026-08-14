import axios from "axios";

function resolveDefaultBaseUrl(defaultValue) {
  const configured = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "development" ? defaultValue : "/";
}

// Default to the gateway service in this repo.
export const API_BASE_URL = resolveDefaultBaseUrl("http://127.0.0.1:8001");
export const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8001" : "/");
export const AUTH_SERVICE_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_API_BASE_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:5000/api/auth" : "/api/auth");
export const AUTH_SERVICE_FALLBACK_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_FALLBACK_API_BASE_URL || "http://127.0.0.1:5000/api/auth";
export const PROFILE_API_BASE_URL =
  process.env.NEXT_PUBLIC_PROFILE_API || `${AUTH_API_BASE_URL.replace(/\/+$/, "")}/api/profile`;
export const DASHBOARD_API_BASE_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/dashboard`;
export const PAYMENT_API_BASE_URL =
  process.env.NEXT_PUBLIC_PAYMENT_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/payment`;
export const ADMIN_API_BASE_URL =
  process.env.NEXT_PUBLIC_ADMIN_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/admin`;
export const STARTUP_API_BASE_URL =
  process.env.NEXT_PUBLIC_STARTUP_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/startup`;
export const INVOICE_API_BASE_URL =
  process.env.NEXT_PUBLIC_INVOICE_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/invoices`;
export const CONTACT_API_BASE_URL =
  process.env.NEXT_PUBLIC_CONTACT_API || `${API_BASE_URL.replace(/\/+$/, "")}/api/contact`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const authApi = axios.create({
  baseURL: AUTH_API_BASE_URL,
});

export const authServiceApi = axios.create({
  baseURL: AUTH_SERVICE_API_BASE_URL,
});

export const profileApi = axios.create({
  baseURL: PROFILE_API_BASE_URL,
});

export const dashboardApi = axios.create({
  baseURL: DASHBOARD_API_BASE_URL,
});

export const paymentApi = axios.create({
  baseURL: PAYMENT_API_BASE_URL,
});

export const adminApi = axios.create({
  baseURL: ADMIN_API_BASE_URL,
});

export const startupApi = axios.create({
  baseURL: STARTUP_API_BASE_URL,
});

export function resolveAdminAssetUrl(urlPath) {
  const raw = String(urlPath || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const adminBase = String(ADMIN_API_BASE_URL || "").replace(/\/+$/, "");
  const apiRoot = adminBase.replace(/\/api\/admin$/i, "");
  if (raw.startsWith("/api/admin/")) return `${apiRoot}${raw}`;
  if (raw.startsWith("/")) return `${adminBase}${raw}`;
  return raw;
}

export const invoiceApi = axios.create({
  baseURL: INVOICE_API_BASE_URL,
});

export const contactApi = axios.create({
  baseURL: CONTACT_API_BASE_URL,
});

let isRefreshing = false;
let refreshPromise = null;

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

authApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

authServiceApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

profileApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

dashboardApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

paymentApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

adminApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

startupApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

invoiceApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

contactApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("internlabs_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

authServiceApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error?.config;
    const primaryUrl = String(AUTH_SERVICE_API_BASE_URL || "").replace(/\/+$/, "");
    const fallbackUrl = String(AUTH_SERVICE_FALLBACK_API_BASE_URL || "").replace(/\/+$/, "");

    if (
      originalRequest &&
      !error?.response &&
      fallbackUrl &&
      fallbackUrl !== primaryUrl &&
      !originalRequest._authFallbackRetry
    ) {
      return authServiceApi.request({
        ...originalRequest,
        baseURL: fallbackUrl,
        _authFallbackRetry: true,
      });
    }

    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    if (!originalRequest || error?.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (typeof window === "undefined") {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("internlabs_refresh_token");
    if (!refreshToken) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = authServiceApi
        .post("/refresh", { refresh_token: refreshToken })
        .then(({ data }) => {
          localStorage.setItem("internlabs_token", data.access_token);
          if (data.refresh_token) {
            localStorage.setItem("internlabs_refresh_token", data.refresh_token);
          }
          return data.access_token;
        })
        .catch((refreshError) => {
          localStorage.removeItem("internlabs_token");
          localStorage.removeItem("internlabs_refresh_token");
          localStorage.removeItem("internlabs_user");
          throw refreshError;
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    const newAccessToken = await refreshPromise;
    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
    return api(originalRequest);
  }
);

export default api;
