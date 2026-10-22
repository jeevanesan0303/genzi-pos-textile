const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

async function request(path, method = "GET", body) {
  const token = sessionStorage.getItem("genzi_api_token");

  if (!token) throw new Error("Please sign in.");

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
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60000)
    });
  } catch {
    throw new Error(
      "Server response unavailable. The save result is uncertain. Close the form and refresh before retrying."
    );
  }

  if (
    response.status === 401 &&
    token === sessionStorage.getItem("genzi_api_token")
  ) {
    sessionStorage.removeItem("genzi_api_token");
    window.dispatchEvent(new Event("genzi-session-expired"));
  }

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message || `Request failed (${response.status}).`
    );
  }

  if (!result) throw new Error("Invalid response. Refresh before retrying.");

  return result;
}

export async function getStaff() {
  const result = await request("/users");

  if (!Array.isArray(result.users)) {
    throw new Error("Invalid staff response.");
  }

  return result.users;
}

export async function saveStaff(body, id) {
  const result = await request(
    id ? `/users/${encodeURIComponent(id)}` : "/users",
    id ? "PUT" : "POST",
    body
  );

  if (!result.user?.id) {
    throw new Error("Invalid save response. Refresh before retrying.");
  }

  return result;
}

export function deleteStaff(id, version) {
  return request(
    `/users/${encodeURIComponent(id)}`,
    "DELETE",
    { version }
  );
}