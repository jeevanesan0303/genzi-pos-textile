import {
  isOfflineSession,
  offlineResource,
  cacheOfflineResource,
} from "../offline/access";
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function request(path, method = "GET", body) {
  const token = sessionStorage.getItem("genzi_api_token");

  if (!token) {
    throw new Error("Please sign in again.");
  }

  let response;

  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    const error = new Error("Cannot connect to the POS server.");
    error.network = true;
    throw error;
  }

  if (response.status === 401) {
    sessionStorage.removeItem("genzi_api_token");
    window.dispatchEvent(new Event("genzi-session-expired"));
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      result?.message || `Request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }

  return result;
}

export async function getMyPermissions() {
  if (isOfflineSession() || navigator.onLine === false)
    return offlineResource("permissions");
  let result;
  try {
    result = await request("/permissions/me");
  } catch (error) {
    if (error.network || error.status >= 500)
      return offlineResource("permissions");
    throw error;
  }
  await cacheOfflineResource("permissions", result).catch(() => {});
  return result;
}

export function getPermissionModules() {
  return request("/permissions/modules");
}

export function getPermissionUsers() {
  return request("/permissions/users");
}

export function getUserPermissions(id) {
  return request(`/permissions/users/${encodeURIComponent(id)}`);
}

export function updateUserPermissions(id, permissions) {
  return request(`/permissions/users/${encodeURIComponent(id)}`, "PUT", {
    permissions,
  });
}
