const CACHE_NAME = "makereadyos-static-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/pwa/makereadyos.svg"];
const NETWORK_ONLY_PREFIXES = ["/api/", "/uploads/"];
const API_CACHE_NAME = "makereadyos-api-v1";
const API_CACHE_EXACT = new Set([
  "/api/auth/csrf",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableApiRequest(request, url) {
  if (!url.pathname.startsWith("/api/")) return false;
  if (API_CACHE_EXACT.has(url.pathname)) return false;
  if (url.pathname.endsWith(".csv") || url.pathname.endsWith(".xls") || url.pathname.endsWith(".pdf") || url.pathname.endsWith("/download")) return false;
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json") || accept.includes("*/*");
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isCacheableApiRequest(request, url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/") || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
