const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in before managing expenses.");
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
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error(
      "Server response unavailable. If you were saving, the result is uncertain. Close the form and refresh the list before retrying."
    );
  }

  if (response.status === 401) {
    if (token === sessionStorage.getItem(TOKEN_KEY)) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("genzi-session-expired"));
    }
  }

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message || `Request failed (${response.status}).`
    );
  }

  if (!result) {
    throw new Error("Invalid server response. Refresh before retrying.");
  }

  return result;
}

export async function getExpenses() {
  const result = await request("/expenses");

  if (!Array.isArray(result.expenses)) {
    throw new Error("Invalid expense list response.");
  }

  return result.expenses;
}

export async function getExpense(id) {
  const result = await request(
    `/expenses/${encodeURIComponent(id)}`
  );

  if (!result.expense?.id) {
    throw new Error("Invalid expense response.");
  }

  return result.expense;
}

export async function saveExpense(expense, id) {
  const result = await request(
    id ? `/expenses/${encodeURIComponent(id)}` : "/expenses",
    {
      method: id ? "PUT" : "POST",
      body: {
        name: expense.name,
        date: expense.date,
        category: expense.category,
        amount: expense.amount
      }
    }
  );

  if (!result.expense?.id) {
    throw new Error(
      "Invalid save response. Refresh the list before retrying."
    );
  }

  window.dispatchEvent(new Event("genzi-expenses-changed"));

  return result.expense;
}

export async function deleteExpense(id) {
  await request(`/expenses/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  window.dispatchEvent(new Event("genzi-expenses-changed"));
}