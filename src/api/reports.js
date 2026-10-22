const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

export async function getReport(
  type,
  { from = "", to = "", signal } = {}
) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  let response;

  try {
    response = await fetch(
      `${BASE}/reports/${encodeURIComponent(type)}?${params}`,
      {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
        cache: "no-store",
        signal,
      }
    );
  } catch (error) {
    if (error.name === "AbortError") throw error;

    throw new Error(
      "Cannot reach the reports server. Check the backend and SSH tunnel."
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
      result?.message ||
      `Report request failed (${response.status}).`
    );
  }

  if (
    !result ||
    !Array.isArray(result.columns) ||
    !Array.isArray(result.rows)
  ) {
    throw new Error("Invalid report response.");
  }

  return result;
}