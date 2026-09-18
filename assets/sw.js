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
  if (/^\/api\/(auth|admin|push|on-call)(\/|$)/.test(url.pathname)) return false;
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

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Use a generic notification for malformed data. */ }
  const text = (value, fallback, limit) => typeof value === "string" ? value.slice(0, limit) : fallback;
  event.waitUntil(self.registration.showNotification(text(data.title, "MakeReadyOS", 100), {
    body: text(data.body, "New work alert. Tap to view details.", 220),
    icon: "/icons/pwa/makereadyos.svg", tag: text(data.tag, "mros-work", 100),
    data: { notificationId: text(data.notificationId, "", 100), itemId: text(data.itemId, "", 100) },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = event.notification.data || {};
    const url = new URL("/?notifications=1", self.location.origin);
    for (const key of ["notificationId", "itemId"]) if (typeof target[key] === "string" && target[key]) url.searchParams.set(key, target[key].slice(0, 100));
    const existing = windows.find(client => { const location = new URL(client.url); return location.origin === self.location.origin && location.pathname === "/"; });
    if (existing) {
      try {
        await existing.focus();
        const handled = await new Promise(resolve => {
          const channel = new MessageChannel();
          const finish = value => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value); };
          const timer = setTimeout(() => finish(false), 1200);
          channel.port1.onmessage = event => finish(event.data === "NOTIFICATION_OPENED");
          existing.postMessage({ type: "OPEN_NOTIFICATIONS", notificationId: target.notificationId, itemId: target.itemId }, [channel.port2]);
        });
        if (handled) return;
      } catch { /* Open a routed window if a suspended or old client cannot handle the tap. */ }
    }
    const opened = await self.clients.openWindow(url.pathname + url.search);
    if (opened?.focus) await opened.focus();
  })());
});
