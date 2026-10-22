const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in first.");
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
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error(
      "The server response was unavailable. A write may have completed. " +
      "Refresh the supplier list before retrying."
    );
  }

  if (response.status === 401) {
    if (token === sessionStorage.getItem(TOKEN_KEY)) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }

    throw new Error("Your session expired. Please sign in again.");
  }

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message || `Request failed (${response.status}).`
    );
  }

  if (!result) {
    throw new Error("Invalid server response. Refresh the list.");
  }

  return result;
}

export async function getSuppliers() {
  const result = await request("/suppliers");

  if (!Array.isArray(result.suppliers)) {
    throw new Error("Invalid supplier list response.");
  }

  return result.suppliers;
}

export async function getSupplier(id) {
  const result = await request(
    `/suppliers/${encodeURIComponent(id)}`
  );

  if (!result.supplier?.id) {
    throw new Error("Invalid supplier response.");
  }

  return result.supplier;
}

export async function saveSupplier(supplier, id) {
  const result = await request(
    id ? `/suppliers/${encodeURIComponent(id)}` : "/suppliers",
    {
      method: id ? "PUT" : "POST",
      body: supplier
    }
  );

  if (!result.supplier?.id) {
    throw new Error(
      "Save response could not be verified. Refresh the list."
    );
  }

  return result.supplier;
}

export function deleteSupplier(id) {
  return request(`/suppliers/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}