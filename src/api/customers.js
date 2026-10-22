const BASE = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");

const TOKEN_KEY = "genzi_api_token";

async function request(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in before managing customers.");
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
      "Server response unavailable. If you were saving, close the form and refresh the list before retrying."
    );
  }

  if (
    response.status === 401 &&
    token === sessionStorage.getItem(TOKEN_KEY)
  ) {
    sessionStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("genzi-session-expired"));
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

export async function getCustomers() {
  const result = await request("/customers");

  if (!Array.isArray(result.customers)) {
    throw new Error("Invalid customer list response.");
  }

  return result.customers;
}

export async function getCustomer(id) {
  const result = await request(
    `/customers/${encodeURIComponent(id)}`
  );

  if (!result.customer?.id) {
    throw new Error("Invalid customer response.");
  }

  return result.customer;
}

export async function saveCustomer(customer, id) {
  const result = await request(
    id ? `/customers/${encodeURIComponent(id)}` : "/customers",
    {
      method: id ? "PUT" : "POST",
      body: {
        name: customer.name,
        phonenumber: customer.phonenumber
      }
    }
  );

  if (!result.customer?.id) {
    throw new Error(
      "Invalid save response. Refresh the list before retrying."
    );
  }

  window.dispatchEvent(new Event("genzi-customers-changed"));

  return result.customer;
}

export async function deleteCustomer(id) {
  await request(`/customers/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  window.dispatchEvent(new Event("genzi-customers-changed"));
}