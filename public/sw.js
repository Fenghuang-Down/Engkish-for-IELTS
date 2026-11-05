// Offline shell: pages and icons come from cache when there is no internet. Data and AI always go to the network.
const CACHE = "ielts-v1";
const SHELL = ["/", "/boot.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/") || u.hostname.endsWith("supabase.co")) return;
  // network first, cache as fallback (so updates arrive immediately)
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || u.hostname.includes("jsdelivr") || u.hostname.includes("cdnjs") || u.hostname.includes("fonts."))) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("/") : undefined))));
});
