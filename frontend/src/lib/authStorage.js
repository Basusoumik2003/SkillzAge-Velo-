export function getStoredToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("internlabs_token") || "";
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("internlabs_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredProfile() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("internlabs_profile");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthSession({ token, refreshToken, user }) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("internlabs_token", token);
  if (refreshToken) localStorage.setItem("internlabs_refresh_token", refreshToken);
  if (user) localStorage.setItem("internlabs_user", JSON.stringify(user));
}

export function setStoredProfile(profile) {
  if (typeof window === "undefined") return;
  if (!profile) return;
  localStorage.setItem("internlabs_profile", JSON.stringify(profile));
  try {
    window.dispatchEvent(new Event("internlabs_profile_updated"));
  } catch {
    // ignore
  }
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("internlabs_token");
  localStorage.removeItem("internlabs_refresh_token");
  localStorage.removeItem("internlabs_user");
  localStorage.removeItem("internlabs_profile");
  localStorage.removeItem("internlabs_project");
}
