/* D Shop offline shell: the app files are cached so it opens quickly and works as an installed app.
   Data always comes live from Firebase. Bump VERSION when app files change. */
const VERSION = "dshop-v1";
const SHELL = ["./", "./index.html", "./app.js?v=1", "../firebase-config.js?v=2", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;   // Firebase, fonts: straight to the network
  // network first, so updates show at once; cached copy when offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
});
