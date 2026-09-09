const CACHE_NAME = "student-portal-v2"; // bumped on purpose: forces every client to wipe its old (possibly stale) cache
const urlsToCache = [
  "login.html",
  "dashboard.html",
  "admin.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isGet = req.method === "GET";

  // ============================================================
  // THE FIX: only same-origin GET requests (the app's own static
  // files) are ever allowed to touch the cache. Everything else —
  // every Supabase call (check-ins, reads, dues, notices, all of
  // it) and any non-GET request — goes straight to the network
  // with NO caching and NO stale fallback. This is what was
  // causing check-ins to silently "revert": a Supabase read that
  // hit even a brief network hiccup was falling back to an old
  // cached response instead of surfacing an error.
  // ============================================================
  if (!isSameOrigin || !isGet) {
    event.respondWith(fetch(req));
    return;
  }

  // App shell only (HTML/CSS/JS/icons on our own origin): network
  // first so updates show immediately, cache only as an offline backup.
  event.respondWith(
    fetch(req)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(req))
  );
});

/* =========================================================
   WEB PUSH – shows notification when admin posts a notice
   ========================================================= */
self.addEventListener("push", (event) => {
  let data = {
    title: "Champion Library",
    body: "New notice from the library",
    url: "dashboard.html"
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || "New notice from the library",
    icon: "icon-192.png",
    badge: "icon-192.png",
    vibrate: [120, 60, 120],
    tag: "library-notice",
    renotify: true,
    data: {
      url: data.url || "dashboard.html"
    },
    actions: [
      { action: "open", title: "View Notice" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "📢 Library Notice", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "dashboard.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
