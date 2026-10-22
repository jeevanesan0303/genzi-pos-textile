const CACHE = "genzi-retail-v11";
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "/",
          "/assets/logo.png",
          "/assets/login-boutique.png",
          "/assets/instagram-qr.png",
          ...Array.from(
            { length: 8 },
            (_, i) => "/assets/dress-" + i + (i === 0 ? ".jpeg" : ".jpg"),
          ),
        ]),
      ),
  );
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("genzi-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.headers.has("Authorization") ||
    new URL(e.request.url).pathname.startsWith("/api/")
  )
    return;
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (r) =>
              r ||
              (e.request.mode === "navigate"
                ? caches.match("/")
                : Response.error()),
          ),
      ),
  );
});
