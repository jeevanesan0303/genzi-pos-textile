const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  let response;

  try {
    response = await fetch(`${BASE}/sales${path}`, {
      method: options.method || "GET",
      headers: {
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(
      "Server response unavailable. If you saved or deleted a bill, close the editor and refresh before retrying; the change may already have completed."
    );
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    if (
      response.status === 401 &&
      token === sessionStorage.getItem(TOKEN_KEY)
    ) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }

    throw new Error(
      result?.message || `Request failed (${response.status}).`
    );
  }

  if (!result) throw new Error("Invalid sales server response.");

  return result;
}

export function getSales() {
  return request("");
}

export async function getSale(id) {
  const result = await request(`/${encodeURIComponent(id)}`);
  return result.order;
}

export async function getSaleProducts() {
  const result = await request("/products");
  return result.products;
}

export async function updateSale(id, body) {
  const result = await request(`/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });

  return result.order;
}

export async function deleteSale(id, version, reason) {
  const result = await request(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: { version, reason },
  });

  return result.order;
}