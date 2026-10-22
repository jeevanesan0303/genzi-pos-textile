const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

async function request(path, method = "GET", body) {
  const token = sessionStorage.getItem("genzi_api_token");

  if (!token) throw new Error("Please sign in first.");

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
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new Error(
      "Server response unavailable. A write may have completed. " +
      "Close the form and refresh the list before retrying."
    );
  }

  if (response.status === 401) {
    if (token === sessionStorage.getItem("genzi_api_token")) {
      sessionStorage.removeItem("genzi_api_token");
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

  if (!result) throw new Error("Invalid server response.");

  return result;
}

export async function getPurchases() {
  const result = await request("/purchases");

  if (!Array.isArray(result.purchases)) {
    throw new Error("Invalid purchase list.");
  }

  return result.purchases;
}

export async function getPurchase(id) {
  const result = await request(
    `/purchases/${encodeURIComponent(id)}`
  );

  if (!result.purchase?.id || !Array.isArray(result.purchase.items)) {
    throw new Error("Invalid purchase details.");
  }

  return result.purchase;
}

export async function savePurchase(body, id) {
  const result = await request(
    id ? `/purchases/${encodeURIComponent(id)}` : "/purchases",
    id ? "PUT" : "POST",
    body
  );

  if (!result.purchase?.id) {
    throw new Error("Save response could not be verified. Refresh the list.");
  }

  return result.purchase;
}

export function deletePurchase(id, version) {
  return request(
    `/purchases/${encodeURIComponent(id)}`,
    "DELETE",
    { version }
  );
}