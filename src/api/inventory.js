const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

export async function updateProductStock(id, stock, expectedStock) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in first.");
  }

  let response;

  try {
    response = await fetch(
      `${BASE}/inventory/${encodeURIComponent(id)}/stock`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          stock,
          expectedStock
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000)
      }
    );
  } catch {
    throw new Error(
      "The server response was unavailable. The update may have completed. " +
      "Cancel this popup and refresh the list before retrying."
    );
  }

  const result = await response.json().catch(() => null);

  if (response.status === 401) {
    if (token === sessionStorage.getItem(TOKEN_KEY)) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }

    throw new Error("Your session expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(
      result?.message || `Stock update failed (${response.status}).`
    );
  }

  if (
    result?.product?.id !== id ||
    !Number.isSafeInteger(result.product.stock)
  ) {
    throw new Error(
      "The save response could not be verified. Refresh the list."
    );
  }

  window.dispatchEvent(new Event("genzi-products-changed"));

return result.product;
}