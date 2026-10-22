import {
  rememberOnlineLogin,
  offlineLogin,
  resumeOfflineUser,
  resumePreparedSession,
  isOfflineSession,
  clearDeviceSession,
} from "../offline/access";
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  let response;

  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const error = new Error("POS server unavailable.");
    error.offlineAvailable = true;
    throw error;
  }

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      token === sessionStorage.getItem(TOKEN_KEY)
    ) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }

    const error = new Error(
      result?.message || `Request failed (${response.status}).`,
    );
    // Vite can return an empty/non-JSON 500 when its API tunnel is disconnected.
    error.offlineAvailable =
      [502, 503, 504].includes(response.status) ||
      (response.status === 500 && !result);
    throw error;
  }

  if (!result) throw new Error("Invalid server response.");

  return result;
}

export async function loginAdmin(credentials) {
  if (!navigator.onLine) return offlineLogin(credentials);
  let result;
  try {
    result = await request("/auth/login", {
      method: "POST",
      body: credentials,
    });
  } catch (error) {
    if (error.offlineAvailable) return offlineLogin(credentials);
    throw error; // Never bypass a real 400/401/403 credential rejection.
  }
  if (!result.token || !result.user?.name)
    throw new Error("Invalid login response.");
  sessionStorage.setItem(TOKEN_KEY, result.token);
  try {
    await rememberOnlineLogin(credentials, result.user);
  } catch {
    sessionStorage.setItem(
      "genzi-offline-setup-error",
      "Offline device access could not be prepared. Enable browser storage.",
    );
  }
  return result.user;
}

export async function getCurrentUser() {
  if (isOfflineSession()) return resumeOfflineUser();
  if (navigator.onLine === false) return resumePreparedSession();
  try {
    return (await request("/auth/me")).user;
  } catch (error) {
    if (error.offlineAvailable) return resumePreparedSession();
    throw error;
  }
}

export async function logoutAdmin() {
  if (isOfflineSession()) {
    sessionStorage.removeItem(TOKEN_KEY);
    clearDeviceSession();
    return;
  }
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    clearDeviceSession();
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export async function getCategories() {
  const result = await request("/categories");

  if (!Array.isArray(result.categories)) {
    throw new Error("Invalid category response.");
  }

  return result.categories;
}

export async function saveCategory(category, editing) {
  const path = editing
    ? `/categories/${encodeURIComponent(category.id)}`
    : "/categories";

  const result = await request(path, {
    method: editing ? "PUT" : "POST",
    body: {
      name: category.name,
      description: category.description || "",
    },
  });

  if (!result.category?.id) {
    throw new Error("Invalid category save response.");
  }

  return result.category;
}

export function deleteCategory(id) {
  return request(`/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
