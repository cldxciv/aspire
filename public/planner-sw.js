/*
 * Aspire study planner: offline support (owner: A4-PLANNER).
 *
 * Registered only by the planner page (src/components/planner/PlannerApp.tsx), in production builds,
 * with the scope /tools/planner or /hi/tools/planner, so it never controls any other page.
 *
 * - Planner pages: network first; the last good copy is served when offline.
 * - Static build files, fonts and images (/_next/static, /_next/image, /images, /assets): cache first.
 * - /api/* (the student's own data, the leaderboard): never cached, always the network.
 * Personal planner data lives in the page's localStorage, not in this worker's caches.
 */
const VERSION = "v1";
const PAGES = `aspire-planner-pages-${VERSION}`;
const ASSETS = `aspire-planner-assets-${VERSION}`;
const MAX_ASSETS = 150;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Aspire Study Planner</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px 16px;line-height:1.5}main{max-width:560px;margin:auto;background:#fff;border:1px solid #e2eaf3;border-radius:18px;padding:24px}h1{color:#0b2d5b;font-size:1.4rem}</style></head><body><main><h1>You are offline</h1><p>Open the study planner once while online, and it will work offline after that.</p><p lang="hi">आप ऑफ़लाइन हैं। स्टडी प्लानर को एक बार ऑनलाइन खोलें, उसके बाद यह ऑफ़लाइन भी चलेगा।</p></main></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("aspire-planner-") && key !== PAGES && key !== ASSETS).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/assets/")
  );
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i += 1) await cache.delete(keys[i]);
}

async function pageNetworkFirst(request, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(pageNetworkFirst(request, url));
  } else if (isAsset(url)) {
    event.respondWith(assetCacheFirst(request));
  }
});

// Reminders shown by the open planner (registration.showNotification): a tap opens the planner.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = new URL(self.registration.scope).pathname;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith(scope) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
