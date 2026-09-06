const CACHE_NAME = "makereadyos-static-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/pwa/makereadyos.svg"];
const NETWORK_ONLY_PREFIXES = ["/api/", "/uploads/"];
const API_CACHE_NAME = "makereadyos-api-v2";
let apiCacheEpoch = 0;
let activeUserId;
let apiCacheUsable = true;

async function clearApiCache() {
  apiCacheEpoch++;
  try {
    await caches.delete(API_CACHE_NAME);
    apiCacheUsable = true;
  } catch {
    // Do not block sign-out if storage fails, but stop serving unverified caches.
    apiCacheUsable = false;
  }
}

async function authenticationRequest(request, url) {
  if (request.method !== "GET") {
    activeUserId = undefined;
    await clearApiCache();
  }
  const epoch = apiCacheEpoch;
  const response = await fetch(request);
  if (url.pathname === "/api/auth/me") {
    if (epoch !== apiCacheEpoch) return Response.error();
    if (response.ok) {
      const userId = (await response.clone().json()).user?.id ?? null;
      if (epoch !== apiCacheEpoch) return Response.error();
      if (userId !== activeUserId) {
        activeUserId = userId;
        await clearApiCache();
      }
    } else if (response.status === 401 || response.status === 403) {
      activeUserId = null;
      await clearApiCache();
    }
  }
  return response;
}

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
  if (/^\/api\/(auth|admin)(\/|$)/.test(url.pathname)) return false;
  if (/\.(csv|xls|xlsx|pdf|html)$/.test(url.pathname) || /\/(download|export[^/]*|reports?|backup)(\/|$)/.test(url.pathname)) return false;
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json") || accept.includes("*/*");
}

async function networkFirstApi(request) {
  const epoch = apiCacheEpoch;
  const cache = apiCacheUsable ? await caches.open(API_CACHE_NAME).catch(() => null) : null;
  let response;
  try {
    response = await fetch(request);
  } catch {
    if (epoch !== apiCacheEpoch) return Response.error();
    return (await cache?.match(request)) || Response.error();
  }
  if (epoch !== apiCacheEpoch) return Response.error();
  if (response.status === 401 || response.status === 403 || /no-store/i.test(response.headers.get("cache-control") || "")) {
    await clearApiCache();
    return response;
  }
  if (cache && response.ok) {
    // A quota failure must not replace a successful server response with stale data.
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/auth/")) {
    event.respondWith(authenticationRequest(request, url));
    return;
  }
  if (request.method !== "GET") return;

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
