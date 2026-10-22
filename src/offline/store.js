import { offlineResource, isOfflineSession } from "./access.js";
import {
  cents,
  decimal,
  calculate,
  payment,
  readLines,
} from "../../backend/src/posRules.js";
const DB = "genzi-offline-v1";
const event = () => window.dispatchEvent(new Event("genzi-offline-changed"));
let opening;
function database() {
  return (opening ||= new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      opening = undefined;
      reject(
        new Error(
          "Offline database did not open. Close other POS tabs and retry; do not clear browser data.",
        ),
      );
    }, 5000);
    const r = indexedDB.open(DB, 1);
    r.onblocked = () => {
      clearTimeout(timer);
      opening = undefined;
      reject(
        new Error(
          "Offline database is blocked by another POS tab. Close that tab and retry.",
        ),
      );
    };
    r.onupgradeneeded = () => {
      r.result.createObjectStore("cache");
      r.result.createObjectStore("queue", { keyPath: "key" });
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      resolve(r.result);
    };
    r.onerror = () => {
      clearTimeout(timer);
      opening = undefined;
      reject(new Error("Offline storage unavailable. Bill was not saved."));
    };
  }));
}
async function transact(stores, mode, work) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () =>
      reject(
        tx.error || new Error("Offline storage failed. Keep this bill open."),
      );
    work(tx, (v) => {
      value = v;
    });
  });
}
const get = (store, key) =>
  transact([store], "readonly", (tx, done) => {
    tx.objectStore(store).get(key).onsuccess = (e) => done(e.target.result);
  });
const put = (store, value, key) =>
  transact([store], "readwrite", (tx) =>
    tx.objectStore(store).put(value, ...(key === undefined ? [] : [key])),
  );
const drop = (key) =>
  transact(["queue"], "readwrite", (tx) => tx.objectStore("queue").delete(key));
async function acknowledge(q, result) {
  await transact(["cache", "queue"], "readwrite", (tx) => {
    const cache = tx.objectStore("cache");
    cache.put(
      { offlineNumber: q.order.number, order: result.order },
      "receipt:" + q.key,
    );
    cache.get(q.actor).onsuccess = (e) => {
      const c = e.target.result;
      if (c)
        cache.put(
          {
            ...c,
            products: c.products.map((p) => ({
              ...p,
              stock: Math.max(
                0,
                Number(p.stock) -
                  q.body.items
                    .filter((i) => i.productId === p.id)
                    .reduce((n, i) => n + i.quantity, 0),
              ),
            })),
          },
          q.actor,
        );
    };
    tx.objectStore("queue").delete(q.key);
  });
}
export const allQueued = () =>
  transact(["queue"], "readonly", (tx, done) => {
    tx.objectStore("queue").getAll().onsuccess = (e) => done(e.target.result);
  });
const actor = () => sessionStorage.getItem("genzi-offline-actor");
const lock = (work) => {
  if (!navigator.locks)
    throw new Error(
      "Offline checkout requires a browser with Web Locks (current Chrome or Edge).",
    );
  return navigator.locks.request("genzi-checkout-sync", work);
};
function active(key, token) {
  if (
    actor() !== key ||
    sessionStorage.getItem("genzi-offline-binding") !== token ||
    !token ||
    token !== sessionStorage.getItem("genzi_api_token")
  )
    throw new Error("Session changed. Sign in again before continuing.");
}
function applyPending(result, pending) {
  return {
    ...result,
    products: result.products.map((p) => ({
      ...p,
      stock: Math.max(
        0,
        Number(p.stock) -
          pending.reduce(
            (n, q) =>
              n +
              q.body.items
                .filter((i) => i.productId === p.id)
                .reduce((a, i) => a + i.quantity, 0),
            0,
          ),
      ),
    })),
  };
}
export async function readCachedPOS() {
  const key = actor(),
    token = sessionStorage.getItem("genzi_api_token");
  active(key, token);
  if (isOfflineSession()) await offlineResource("catalogue");
  let result = await get("cache", key);
  if (!result) {
    // Recover the prepared catalogue if an earlier version wrote only the login profile.
    result = { ...(await offlineResource("catalogue")), cachedAt: Date.now() };
    if (result.actor?.key !== key)
      throw new Error(
        "Cached cashier does not match this session. Sign in again.",
      );
    await put("cache", result, key);
  }
  if (
    !Array.isArray(result.products) ||
    result.actor?.key !== key ||
    Date.now() - result.cachedAt > 12 * 60 * 60 * 1000
  )
    throw new Error(
      "Offline catalogue missing or expired. Open POS online first.",
    );
  const pending = (await allQueued()).filter((q) => q.actor === key);
  return { ...applyPending(result, pending), offline: true };
}
export async function offlineBootstrap(fetchCatalogue) {
  // A known disconnected browser must never wait for the VPS request to time out.
  if (navigator.onLine === false) return readCachedPOS();
  let result;
  try {
    result = await fetchCatalogue();
  } catch (error) {
    if (error.network) return readCachedPOS();
    throw error;
  }
  if (!result?.actor?.key || !Array.isArray(result.products))
    throw new Error("Invalid catalogue response.");
  sessionStorage.setItem("genzi-offline-actor", result.actor.key);
  sessionStorage.setItem(
    "genzi-offline-binding",
    sessionStorage.getItem("genzi_api_token"),
  );
  await put("cache", { ...result, cachedAt: Date.now() }, result.actor.key);
  navigator.storage?.persist?.().catch(() => {});
  return {
    ...applyPending(
      result,
      (await allQueued()).filter((q) => q.actor === result.actor.key),
    ),
    offline: false,
  };
}
export function cachedCustomer(catalogue, phone) {
  const value = String(phone || "");
  if (!value) return null;
  if (!/^0[2-9]\d{8}$/.test(value))
    throw new Error("Enter a valid 10-digit Sri Lankan phone number.");
  const matches = (catalogue.customers || []).filter(
    (c) => String(c.phonenumber ?? c.phone ?? "").trim() === value,
  );
  if (matches.length > 1)
    throw new Error(
      "Duplicate customer phone number. Ask your manager to correct the records online.",
    );
  return matches[0] ? { ...matches[0], phonenumber: value } : null;
}
export async function findOfflineCustomer(phone) {
  const catalogue = await readCachedPOS();
  return { customer: cachedCustomer(catalogue, phone), offline: true };
}
export async function rememberCustomer(phone, customer) {
  const key = actor(),
    token = sessionStorage.getItem("genzi_api_token");
  active(key, token);
  await transact(["cache"], "readwrite", (tx) => {
    const cache = tx.objectStore("cache");
    cache.get(key).onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return;
      const customers = (c.customers || []).filter(
        (item) => String(item.phonenumber ?? item.phone ?? "").trim() !== phone,
      );
      if (customer) customers.push({ ...customer, phonenumber: phone });
      cache.put({ ...c, customers }, key);
    };
  });
}

export function provisional(body, catalogue) {
  if (body.action !== "complete" || body.id || body.payment?.method !== "Cash")
    throw new Error(
      "Offline mode supports new cash bills for walk-in or downloaded customers. Held bills and card payments require connection.",
    );
  const customer = cachedCustomer(catalogue, body.customerPhone);
  if (body.customerPhone && !customer)
    throw new Error(
      "This customer is not downloaded on this device. Connect online to register/download, or leave the phone blank for walk-in.",
    );
  const lines = readLines(body.items);
  const items = lines.map((i) => {
    const p = catalogue.products.find((p) => p.id === i.productId);
    if (
      !p ||
      cents(p.price) !== i.expectedPrice ||
      Number(p.stock) < i.quantity
    )
      throw new Error(
        "Cached price or stock is unavailable. Refresh online or reduce quantity.",
      );
    return {
      ...p,
      productId: i.productId,
      quantity: i.quantity,
      price: decimal(i.expectedPrice),
      lineTotal: decimal(i.expectedPrice * i.quantity),
    };
  });
  const totals = calculate(
    lines.map((i) => ({ price: i.expectedPrice, quantity: i.quantity })),
    cents(body.discount),
  );
  const paid = payment(totals.total, body.payment);
  return {
    id: body.requestKey,
    number: "OFF-" + body.requestKey,
    status: "Completed",
    offline: true,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    items,
    customerName: customer?.name || null,
    customerPhone: body.customerPhone || null,
    settings: body.settings,
    subtotal: decimal(totals.subtotal),
    discount: decimal(cents(body.discount)),
    total: decimal(totals.total),
    paymentMethod: paid.method,
    cashPaid: decimal(paid.cashPaid),
    cardPaid: decimal(paid.cardPaid),
    cashReceived: decimal(paid.cashReceived),
    changeDue: decimal(paid.changeDue),
  };
}
export async function offlineSubmit(body, send) {
  // Preserve existing online held/customer/card flows; never pretend a card was approved offline.
  const eligible =
    body.action === "complete" && !body.id && body.payment?.method === "Cash";
  if (!eligible) return send(body);
  return lock(async () => {
    const key = actor(),
      token = sessionStorage.getItem("genzi_api_token");
    active(key, token);
    const old = await get("queue", body.requestKey);
    if (old) {
      if (
        old.actor !== key ||
        JSON.stringify(old.body) !== JSON.stringify(body)
      )
        throw new Error("Request identity mismatch.");
      return { order: old.order };
    }
    const catalogue = await offlineBootstrap(async () => {
      const e = new Error();
      e.network = true;
      throw e;
    });
    const order = provisional(body, catalogue);
    active(key, token);
    await put("queue", {
      key: body.requestKey,
      actor: key,
      body,
      order,
      createdAt: Date.now(),
      error: "",
    });
    event();
    try {
      const result = await send(body);
      if (!result?.order?.id) {
        const error = new Error(
          "Missing server confirmation; bill remains queued.",
        );
        error.uncertain = true;
        throw error;
      }
      await acknowledge(
        { actor: key, key: body.requestKey, body, order },
        result,
      );
      event();
      return result;
    } catch (error) {
      if (error.status >= 400 && error.status < 500) {
        await drop(body.requestKey);
        event();
        throw error;
      }
      if (!error.network && !error.uncertain) throw error;
      return { order }; // Original immutable payload/key is retained, including uncertain writes.
    }
  });
}
export const myQueue = async () =>
  (await allQueued()).filter((q) => q.actor === actor());
export async function replayQueue(send) {
  return lock(async () => {
    const key = actor(),
      token = sessionStorage.getItem("genzi_api_token");
    active(key, token);
    let accepted = 0;
    for (const q of await myQueue()) {
      active(key, token);
      try {
        const result = await send(q.body);
        if (!result?.order?.id) throw new Error("Missing server confirmation.");
        // Keep the server receipt and original offline reference for reconciliation/reprinting.
        await acknowledge(q, result);
        accepted++;
      } catch (error) {
        await put("queue", { ...q, error: error.message });
        event();
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.network ||
          error.uncertain
        )
          break;
      }
    }
    event();
    window.dispatchEvent(new Event("genzi-products-changed"));
    window.dispatchEvent(new Event("genzi-sales-changed"));
    return accepted;
  });
}
export async function exportOfflineBackup() {
  const rows = await myQueue();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "genzi-offline-v1",
          exportedAt: new Date().toISOString(),
          queue: rows,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "genzi-offline-backup-" + Date.now() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
