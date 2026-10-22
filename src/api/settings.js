import {
  isOfflineSession,
  offlineResource,
  cacheOfflineResource,
} from "../offline/access";
const BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "/api"
).replace(/\/+$/, "");

async function request(options = {}) {
  const token = sessionStorage.getItem("genzi_api_token");

  let response;
  try {
    response = await fetch(`${BASE}/settings`, {
      ...options,
      cache: "no-store",
      signal: options.signal || AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const failure = new Error("Settings server unavailable.");
    failure.network = true;
    throw failure;
  }

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem("genzi_api_token");
    window.dispatchEvent(new Event("genzi-session-expired"));
  }

  if (!response.ok) {
    const error = new Error(
      result.message || "Unable to access store settings.",
    );
    error.status = response.status;
    throw error;
  }

  if (!result.settings || !Number.isInteger(result.version)) {
    throw new Error("Invalid settings response.");
  }

  return result;
}

export async function getSettings(signal) {
  if (isOfflineSession() || navigator.onLine === false)
    return offlineResource("settings");
  let result;
  try {
    result = await request({ signal });
  } catch (error) {
    if (!signal?.aborted && (error.network || error.status >= 500))
      return offlineResource("settings");
    throw error;
  }
  await cacheOfflineResource("settings", result).catch(() => {});
  return result;
}

export function saveSettings(settings, version) {
  return request({
    method: "PUT",
    body: JSON.stringify({ settings, version }),
  });
}
