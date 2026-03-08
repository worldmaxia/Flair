// ═══════════════════════════════════════════════════════════
//  FLARE LAUNCHER — Service Worker
//  Strategia: Cache First per assets, Network First per HTML
//  Versione cache: aggiorna CACHE_VERSION ad ogni release
// ═══════════════════════════════════════════════════════════

var CACHE_VERSION = 'flare-v18';
var CACHE_STATIC  = CACHE_VERSION + '-static';

// File da mettere subito in cache all'installazione
var PRECACHE_URLS = [
  './launcher-v18.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── INSTALL — precache degli asset fondamentali ────────────
self.addEventListener('install', function(event) {
  console.log('[Flare SW] Install — cache:', CACHE_STATIC);
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      // Prendi controllo immediatamente senza aspettare reload
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE — pulisci cache vecchie ──────────────────────
self.addEventListener('activate', function(event) {
  console.log('[Flare SW] Activate — pulizia cache vecchie');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) {
            // Elimina tutte le cache flare- tranne quella attuale
            return name.startsWith('flare-') && name !== CACHE_STATIC;
          })
          .map(function(name) {
            console.log('[Flare SW] Elimino cache obsoleta:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Prendi controllo di tutte le tab aperte
      return self.clients.claim();
    })
  );
});

// ── FETCH — strategia per tipo di risorsa ─────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Ignora richieste non-GET e chiamate esterne (API, CDN, cloud)
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML principale — Network First (prende aggiornamenti)
  // Se offline, serve dalla cache
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  // Tutto il resto (icone, manifest) — Cache First
  event.respondWith(cacheFirstThenNetwork(event.request));
});

// ── Network First: prova rete, fallback cache ──────────────
function networkFirstThenCache(request) {
  return fetch(request)
    .then(function(networkResponse) {
      // Salva la risposta fresca in cache
      if (networkResponse && networkResponse.status === 200) {
        var responseClone = networkResponse.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    })
    .catch(function() {
      // Rete non disponibile — servi dalla cache
      console.log('[Flare SW] Offline — servo dalla cache:', request.url);
      return caches.match(request).then(function(cached) {
        return cached || offlineFallback();
      });
    });
}

// ── Cache First: prova cache, fallback rete ───────────────
function cacheFirstThenNetwork(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(networkResponse) {
      if (networkResponse && networkResponse.status === 200) {
        var responseClone = networkResponse.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    });
  });
}

// ── Fallback offline minimale ─────────────────────────────
function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flare — Offline</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#070b16;color:#e9eef7;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;}' +
    '.wrap{max-width:300px;}.ico{font-size:3.5rem;margin-bottom:18px;opacity:.5;}h1{font-size:1.3rem;font-weight:800;margin-bottom:8px;}.sub{font-size:.75rem;color:#aab4c5;line-height:1.8;margin-bottom:24px;}' +
    'button{padding:12px 24px;border-radius:10px;border:1px solid rgba(96,165,250,.4);background:rgba(96,165,250,.1);color:#60a5fa;font-size:.85rem;font-weight:700;cursor:pointer;}</style></head>' +
    '<body><div class="wrap"><div class="ico">📡</div><h1>Sei offline</h1>' +
    '<p class="sub">Flare non riesce a connettersi.<br>Le tue app salvate sono comunque accessibili — ricarica quando torni online.</p>' +
    '<button onclick="location.reload()">↻ Riprova</button></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── Messaggi dal client (es. forza aggiornamento) ─────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
