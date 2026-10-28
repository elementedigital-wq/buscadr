/* buscaDR · Service worker v4. Corrige el problema de la v0.3 (caché primero con nombre fijo, que dejaba
 * a los usuarios con app.js viejo tras cada despliegue):
 * - Las páginas van SIEMPRE a la red (con página sin conexión como respaldo).
 * - Solo se cachean recursos inmutables: /assets/* (con versión de este archivo) y /assets de Vite con hash.
 * - Nunca se cachea /api ni páginas con datos personales. */
const VERSION = "buscadr-v1-2026-10-28";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll([OFFLINE, "/assets/buscadr-logo.png", "/assets/buscadr-isotipo.png"]))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
