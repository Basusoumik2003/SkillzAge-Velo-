import axios from "axios";

export const API_BASE_URL = "";

export const AUTH_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_API_BASE_URL || "";

export const AUTH_SERVICE_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_API_BASE_URL ||
  "/api/auth";

export const AUTH_SERVICE_FALLBACK_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_FALLBACK_API_BASE_URL ||
  "";

export const PROFILE_API_BASE_URL =
  process.env.NEXT_PUBLIC_PROFILE_API ||
  "/api/profile";

export const DASHBOARD_API_BASE_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_API ||
  "/api/dashboard";

export const PAYMENT_API_BASE_URL =
  process.env.NEXT_PUBLIC_PAYMENT_API ||
  "/api/payment";

export const ADMIN_API_BASE_URL =
  process.env.NEXT_PUBLIC_ADMIN_API ||
  "/api/admin";

export const STARTUP_API_BASE_URL =
  process.env.NEXT_PUBLIC_STARTUP_API ||
  "/api/startup";

export const INVOICE_API_BASE_URL =
  process.env.NEXT_PUBLIC_INVOICE_API ||
  "/api/invoices";

export const CONTACT_API_BASE_URL =
  process.env.NEXT_PUBLIC_CONTACT_API ||
  "/api/contact";


// ======================================================
// AXIOS INSTANCES
// ======================================================

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


// ======================================================
// ADMIN ASSET URL
// ======================================================

export function resolveAdminAssetUrl(urlPath) {
  const raw = String(urlPath || "").trim();

  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://")
  ) {
    return raw;
  }

  const adminBase = String(
    ADMIN_API_BASE_URL || ""
  ).replace(/\/+$/, "");

  const apiRoot = adminBase.replace(
    /\/api\/admin$/i,
    ""
  );

  if (raw.startsWith("/api/admin/")) {
    return `${apiRoot}${raw}`;
  }

  if (raw.startsWith("/")) {
    return `${adminBase}${raw}`;
  }

  return raw;
}


export const invoiceApi = axios.create({
  baseURL: INVOICE_API_BASE_URL,
});

export const contactApi = axios.create({
  baseURL: CONTACT_API_BASE_URL,
});


// ======================================================
// REFRESH STATE
// ======================================================

let isRefreshing = false;
let refreshPromise = null;

function getRefreshedAccessToken() {
  if (!isRefreshing) {
    isRefreshing = true;

    const refreshToken = localStorage.getItem(
      "internlabs_refresh_token"
    );

    refreshPromise = authServiceApi
      .post("/refresh", {
        refresh_token: refreshToken,
      })

      .then(({ data }) => {
        localStorage.setItem(
          "internlabs_token",
          data.access_token
        );

        if (data.refresh_token) {
          localStorage.setItem(
            "internlabs_refresh_token",
            data.refresh_token
          );
        }

        return data.access_token;
      })

      .catch((refreshError) => {
        localStorage.removeItem("internlabs_token");
        localStorage.removeItem(
          "internlabs_refresh_token"
        );
        localStorage.removeItem("internlabs_user");

        throw refreshError;
      })

      .finally(() => {
        isRefreshing = false;
      });
  }

  return refreshPromise;
}

// Attaches the same "expired access token -> refresh -> retry once" flow
// used by `api` to any other axios instance that authenticates with
// internlabs_token. Without this, an expired token surfaces as a bare 401
// instead of transparently refreshing.
function attachTokenRefresh(instance) {
  instance.interceptors.response.use(
    (response) => response,

    async (error) => {
      const originalRequest = error?.config;

      if (
        !originalRequest ||
        error?.response?.status !== 401 ||
        originalRequest._retry ||
        typeof window === "undefined"
      ) {
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem(
        "internlabs_refresh_token"
      );

      if (!refreshToken) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const newAccessToken = await getRefreshedAccessToken();

        originalRequest.headers.Authorization =
          `Bearer ${newAccessToken}`;

        return instance(originalRequest);
      } catch (refreshError) {
        return Promise.reject(error);
      }
    }
  );
}


// ======================================================
// NORMAL USER API
// ======================================================

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// AUTH API
// ======================================================

authApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// AUTH SERVICE API
// ======================================================

authServiceApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// PROFILE API
// ======================================================

profileApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// DASHBOARD API
// ======================================================

dashboardApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// PAYMENT API
// ======================================================

paymentApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// ADMIN API
// ======================================================
// IMPORTANT:
// Admin uses ONLY:
// skillzage_admin_token
//
// It does NOT use:
// internlabs_token
// internlabs_admin_token
// internlabs_refresh_token
// ======================================================

adminApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const adminToken = localStorage.getItem(
      "skillzage_admin_token"
    );

    if (adminToken) {
      config.headers.Authorization =
        `Bearer ${adminToken}`;
    }
  }

  return config;
});


// ======================================================
// STARTUP API
// ======================================================
// Normal startup/user authentication remains unchanged.

startupApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// INVOICE API
// ======================================================

invoiceApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// CONTACT API
// ======================================================

contactApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(
      "internlabs_token"
    );

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }
  }

  return config;
});


// ======================================================
// AUTH SERVICE FALLBACK
// ======================================================

authServiceApi.interceptors.response.use(
  (response) => response,

  (error) => {
    const originalRequest = error?.config;

    const primaryUrl = String(
      AUTH_SERVICE_API_BASE_URL || ""
    ).replace(/\/+$/, "");

    const fallbackUrl = String(
      AUTH_SERVICE_FALLBACK_API_BASE_URL || ""
    ).replace(/\/+$/, "");

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


// ======================================================
// NORMAL API TOKEN REFRESH
// ======================================================
// This is ONLY for internlabs_token.
// Admin authentication does NOT use this refresh flow.
//
// Every instance below authenticates with internlabs_token, so an expired
// access token should transparently refresh-and-retry rather than surface
// as a bare 401 (previously only `api` had this wired up).

[
  api,
  profileApi,
  dashboardApi,
  paymentApi,
  startupApi,
  invoiceApi,
  contactApi,
].forEach(attachTokenRefresh);


export default api;