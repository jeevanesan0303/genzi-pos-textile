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
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    throw new Error(
      "Server response unavailable. A write may have completed. Refresh the product list before retrying."
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

export async function getProducts() {
  const result = await request("/products");

  if (!Array.isArray(result.products)) {
    throw new Error("Invalid product list response.");
  }

  return result.products;
}

export async function getProduct(id) {
  const result = await request(
    `/products/${encodeURIComponent(id)}`
  );

  if (!result.product?.id) {
    throw new Error("Invalid product response.");
  }

  return result.product;
}

export async function saveProduct(product, id) {
  const result = await request(
    id ? `/products/${encodeURIComponent(id)}` : "/products",
    {
      method: id ? "PUT" : "POST",
      body: product
    }
  );

  if (!result.product?.id) {
    throw new Error(
      "Save response could not be verified. Refresh the list."
    );
  }

  window.dispatchEvent(new Event("genzi-products-changed"));

return result.product;
}

export async function deleteProduct(id) {
  await request(`/products/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  window.dispatchEvent(new Event("genzi-products-changed"));
}