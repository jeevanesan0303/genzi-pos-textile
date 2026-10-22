const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

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
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {})
      },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      cache: "no-store"
    });
  } catch {
    throw new Error("Cannot connect to the POS server.");
  }

  if (response.status === 401) {
    sessionStorage.removeItem("genzi_api_token");
    window.dispatchEvent(new Event("genzi-session-expired"));
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message || `Request failed (${response.status}).`
    );
  }

  return result;
}

export function updateMyPassword(currentPassword, newPassword) {
  return request("/account/password", "PUT", {
    currentPassword,
    newPassword
  });
}