import { isOfflineSession, cacheOfflineResource } from "../offline/access";
import {
  offlineBootstrap,
  offlineSubmit,
  replayQueue,
  findOfflineCustomer,
  rememberCustomer,
} from "../offline/store";
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function request(path, { method = "GET", body, signal } = {}) {
  if (navigator.onLine === false || isOfflineSession()) {
    const error = new Error(
      "Offline cash billing is active. This action requires online sign-in.",
    );
    error.network = true;
    error.uncertain = false;
    throw error;
  }
  const token = sessionStorage.getItem("genzi_api_token");

  if (!token) {
    const error = new Error("Please sign in again.");
    error.status = 401;
    throw error;
  }

  let response;

  try {
    response = await fetch(`${BASE}/pos${path}`, {
      method,

      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },

      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: signal || AbortSignal.timeout(20000),
    });
  } catch {
    const error = new Error(
      "Connection interrupted. The result is not confirmed. Use Recover / Retry; do not create the sale again.",
    );

    error.network = true;
    error.uncertain = method !== "GET";
    throw error;
  }

  if (
    response.status === 401 &&
    token === sessionStorage.getItem("genzi_api_token")
  ) {
    sessionStorage.removeItem("genzi_api_token");

    window.dispatchEvent(new Event("genzi-session-expired"));
  }

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    const error = new Error(
      result?.message || `Invalid server response (${response.status}).`,
    );

    error.status = response.status;
    if (method === "GET" && response.status >= 500) error.network = true;

    error.uncertain =
      method !== "GET" && (response.status >= 500 || response.ok || !result);

    throw error;
  }

  return result;
}

export const loadPOS = () =>
  offlineBootstrap(async () => {
    const result = await request("/bootstrap", {
      signal: AbortSignal.timeout(5000),
    });
    await cacheOfflineResource("catalogue", result).catch(() => {});
    return result;
  });

export async function findCustomer(phone) {
  if (navigator.onLine === false || isOfflineSession())
    return findOfflineCustomer(phone);
  try {
    const result = await request(
      `/customer?phone=${encodeURIComponent(phone)}`,
    );
    await rememberCustomer(phone, result.customer).catch(() => {});
    return { ...result, offline: false };
  } catch (error) {
    if (error.network) return findOfflineCustomer(phone);
    throw error;
  }
}

export const listOrders = (status) =>
  request(`/orders?status=${encodeURIComponent(status)}`);

export const getOrder = (id) => request(`/orders/${encodeURIComponent(id)}`);

export const recoverRequest = (key) =>
  request(`/requests/${encodeURIComponent(key)}`);

export const submitOrder = (body) =>
  offlineSubmit(body, (value) =>
    request("/orders", { method: "POST", body: value }),
  );
export const syncOfflineOrders = () => {
  if (isOfflineSession())
    return Promise.reject(
      new Error(
        "Offline bills are saved. When connection returns, sign out and sign in online as the same cashier to sync.",
      ),
    );
  return replayQueue((value) =>
    request("/orders", { method: "POST", body: value }),
  );
};
