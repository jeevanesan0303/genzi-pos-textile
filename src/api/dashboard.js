const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, { signal } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  let response;

  try {
    response = await fetch(`${BASE}/dashboard${path}`, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;

    throw new Error(
      "Cannot reach the dashboard server. Check the backend and SSH tunnel."
    );
  }

  if (!response.ok) {
    const result = await response.json().catch(() => null);

    if (
      response.status === 401 &&
      token === sessionStorage.getItem(TOKEN_KEY)
    ) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }

    throw new Error(
      result?.message ||
      `Dashboard request failed (${response.status}).`
    );
  }

  return response;
}

export async function getDashboard(period, { signal } = {}) {
  const response = await request(
    `?period=${encodeURIComponent(period)}`,
    { signal }
  );

  const result = await response.json();

  if (
    !result?.totals ||
    !result?.stock ||
    !Array.isArray(result.days) ||
    !Array.isArray(result.recentSales)
  ) {
    throw new Error("Invalid dashboard response.");
  }

  return result;
}

export async function downloadDashboardSales(period) {
  const response = await request(
    `/sales.csv?period=${encodeURIComponent(period)}`
  );

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `genzi-sales-${period}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}