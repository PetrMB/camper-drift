/* Service worker: offline shell + cache mapových dlaždic (LRU-ish) */
const SHELL = "slapy-shell-v1";
const TILES = "slapy-tiles-v1";
const SHELL_FILES = [
  "./", "index.html", "css/app.css",
  "js/app.js", "js/gps.js", "js/panels.js", "js/riverkm.js", "js/weather.js",
  "js/data/pois.js", "js/data/river.js", "js/data/zones.js", "js/data/rules.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "manifest.webmanifest", "icons/icon.svg",
];
const TILE_HOSTS = ["ags.cuzk.gov.cz", "tile.openstreetmap.org", "tiles.openseamap.org"];
const TILE_LIMIT = 1200;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > TILE_LIMIT) {
    for (const k of keys.slice(0, keys.length - TILE_LIMIT)) await c.delete(k);
  }
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // dlaždice: cache-first (offline plavba po již navštívené oblasti)
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(TILES).then(async c => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // aplikace: cache-first se síťovou aktualizací na pozadí
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit => {
        const net = fetch(e.request).then(res => {
          if (res.ok) caches.open(SHELL).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
