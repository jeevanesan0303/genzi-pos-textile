// Local device access is limited to previously authenticated cashiers and cash billing.
// Never persist plaintext passwords or backend bearer tokens.
const NAME = "genzi-device-access-v1";
const TTL = 12 * 60 * 60 * 1000;
let opening;
async function db() {
  return (opening ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("profiles", { keyPath: "email" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new Error("Enable browser storage to prepare offline access."));
  }));
}
async function profile(email, change) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      "profiles",
      change ? "readwrite" : "readonly",
    );
    const store = tx.objectStore("profiles");
    let result;
    store.get(email).onsuccess = (e) => {
      result = e.target.result;
      if (change) {
        result = change(result);
        if (result) store.put(result);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () =>
      reject(tx.error || new Error("Offline access storage failed."));
  });
}
const address = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
const currentEmail = () => sessionStorage.getItem("genzi-device-email");
export const isOfflineSession = () =>
  sessionStorage.getItem("genzi-device-offline") === "yes";
async function verifier(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new Uint8Array(salt),
          iterations: 210000,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a[i] ^ b[i];
  return n === 0;
}
export function clearDeviceSession() {
  for (const key of [
    "genzi-device-email",
    "genzi-device-offline",
    "genzi-device-until",
    "genzi-offline-actor",
    "genzi-offline-binding",
  ])
    sessionStorage.removeItem(key);
}
export async function rememberOnlineLogin(credentials, user) {
  clearDeviceSession();
  const email = address(credentials.email);
  sessionStorage.setItem("genzi-device-email", email);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await verifier(credentials.password, salt);
  await profile(email, () => ({
    email,
    user,
    salt,
    hash,
    expiresAt: Date.now() + TTL,
    resources: {},
    failures: 0,
    blockedUntil: 0,
  }));
  navigator.storage?.persist?.().catch(() => {});
}
function permission(value) {
  return (
    value?.view === true ||
    value?.view === 1 ||
    value?.can_view === true ||
    value?.can_view === 1
  );
}
function ready(p) {
  return (
    p &&
    p.expiresAt > Date.now() &&
    p.resources?.catalogue?.actor?.key &&
    p.resources?.settings?.settings &&
    permission(p.resources?.permissions?.permissions?.pos)
  );
}
export async function cacheOfflineResource(name, value) {
  const email = currentEmail();
  if (!email || isOfflineSession()) return;
  await profile(email, (p) =>
    p ? { ...p, resources: { ...p.resources, [name]: value } } : p,
  );
}
export async function offlineLogin(credentials) {
  const email = address(credentials.email);
  const p = await profile(email);
  if (!ready(p))
    throw new Error(
      "Offline access is not ready on this device. Connect once, sign in, and open POS to download your catalogue and permissions. Access must be renewed online every 12 hours.",
    );
  if (p.blockedUntil > Date.now())
    throw new Error(
      "Offline login temporarily locked. Try again in 15 minutes or sign in online.",
    );
  if (!equal(await verifier(credentials.password, p.salt), p.hash)) {
    await profile(email, (current) => {
      const failures = (current.failures || 0) + 1;
      return {
        ...current,
        failures,
        blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
      };
    });
    throw new Error("Incorrect offline email or password.");
  }
  await profile(email, (current) => ({
    ...current,
    failures: 0,
    blockedUntil: 0,
  }));
  const token = "offline:" + crypto.randomUUID();
  sessionStorage.setItem("genzi-device-email", email);
  sessionStorage.setItem("genzi-device-offline", "yes");
  sessionStorage.setItem("genzi-device-until", String(p.expiresAt));
  sessionStorage.setItem("genzi_api_token", token);
  sessionStorage.setItem(
    "genzi-offline-actor",
    p.resources.catalogue.actor.key,
  );
  sessionStorage.setItem("genzi-offline-binding", token);
  return { ...p.user, offline: true };
}
export async function offlineResource(name) {
  const p = await profile(currentEmail());
  if (!ready(p))
    throw new Error(
      "Cached offline access expired or incomplete. Sign in online and open POS again.",
    );
  if (
    isOfflineSession() &&
    Number(sessionStorage.getItem("genzi-device-until")) <= Date.now()
  )
    throw new Error("Offline session expired. Sign in online.");
  if (name === "permissions")
    return {
      permissions: {
        pos: { ...p.resources.permissions.permissions.pos, view: true },
        offline_sync: { view: true },
      },
    };
  const result = p.resources[name];
  if (!result)
    throw new Error(
      "This information has not been downloaded for offline use.",
    );
  return name === "settings" ? { ...result, canEdit: false } : result;
}
export async function resumeOfflineUser() {
  if (
    !isOfflineSession() ||
    !sessionStorage.getItem("genzi_api_token")?.startsWith("offline:")
  )
    throw new Error("Sign in to continue.");
  await offlineResource("settings");
  return (await profile(currentEmail())).user;
}

// Restore only an already authenticated, same-tab server session.
export async function resumePreparedSession() {
  if (isOfflineSession()) return resumeOfflineUser();
  const token = sessionStorage.getItem("genzi_api_token");
  const actor = sessionStorage.getItem("genzi-offline-actor");
  if (
    !token ||
    token.startsWith("offline:") ||
    !actor ||
    sessionStorage.getItem("genzi-offline-binding") !== token
  )
    throw new Error("Sign in online once and prepare POS on this device.");
  await offlineResource("catalogue");
  const p = await profile(currentEmail());
  if (p.resources.catalogue.actor.key !== actor)
    throw new Error("Cached account mismatch. Sign in again.");
  return p.user;
}
