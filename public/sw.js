/* Fee Free Ordering — minimal service worker
 *
 * Strategy: network-first for everything (ordering and kitchen are inherently
 * live data — stale menus would be worse than a brief failure screen). The SW
 * gives us three things:
 *
 *   1. PWA installability (browsers require an active service worker
 *      registration to qualify for "Add to Home Screen" prompts on Android /
 *      desktop Chrome / Edge).
 *   2. A tiny offline fallback shell so a temporary network blip while a
 *      cashier is mid-order doesn't immediately show the browser's default
 *      "no internet" screen.
 *   3. A foundation for future push notifications and background sync.
 *
 * Deliberately tiny — we are NOT precaching the whole app. Next.js already
 * fingerprints its build output and HTTP caching handles asset-level caching
 * adequately. Trying to manage that here would just fight Next on cache
 * invalidation.
 */

const CACHE_VERSION = "feefree-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  // Activate the new SW immediately on first install so first visit gets the
  // full PWA experience without requiring a second reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Only intercept same-origin navigations and HTML — let everything else
  // (API calls, scripts, images) go straight to the network so we don't
  // accidentally serve stale data.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const accept = req.headers.get("accept") || "";
  if (req.mode !== "navigate" && !accept.includes("text/html")) return;

  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(CACHE_VERSION);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    })
  );
});
