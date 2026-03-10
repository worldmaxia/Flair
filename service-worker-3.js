// ══════════════════════════════════════════════════════════
//  FLARE LAUNCHER — Service Worker
//  Strategia: Cache-first per asset locali, network-first per il resto
// ══════════════════════════════════════════════════════════

const CACHE_NAME    = 'flare-v1';
const CACHE_TIMEOUT = 4000; // ms prima di fallire su cache

// File da mettere in cache al momento dell'installazione
const PRECACHE_URLS = [
  './index.html',
  './seed_generator.html',
  './manifest.webmanifest'
];

// ── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Precache silenzioso: se un file manca non blocca l'install
      return Promise.allSettled(
        PRECACHE_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[Flare SW] Precache fallito per:', url, err);
          });
        })
      );
    }).then(function() {
      console.log('[Flare SW] Installato — cache:', CACHE_NAME);
      return self.skipWaiting(); // Attiva subito senza aspettare reload
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[Flare SW] Vecchia cache rimossa:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      console.log('[Flare SW] Attivo');
      return self.clients.claim(); // Prende controllo di tutte le tab aperte
    })
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Ignora richieste non-GET e cross-origin (es. iframe di app utente)
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin)  return;

  // Strategia: Cache-first con fallback network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve dalla cache e aggiorna in background (stale-while-revalidate)
        _revalidateInBackground(event.request);
        return cached;
      }

      // Non in cache: vai in rete e salva il risultato
      return _fetchAndCache(event.request);
    })
  );
});

// ── HELPERS ──────────────────────────────────────────────
function _fetchAndCache(request) {
  return fetch(request).then(function(response) {
    // Salva in cache solo risposte valide e non opaque
    if (response && response.status === 200 && response.type === 'basic') {
      var toCache = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, toCache);
      });
    }
    return response;
  }).catch(function() {
    // Offline e non in cache: restituisce pagina offline generica
    return new Response(
      '<html><body style="font-family:sans-serif;background:#070b16;color:#e9eef7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;">'
      + '<div style="font-size:2.5rem;">✦</div>'
      + '<div style="font-size:1.1rem;font-weight:800;">Flare — Offline</div>'
      + '<div style="font-size:.75rem;color:#aab4c5;">Apri Flare con connessione attiva almeno una volta per usarlo offline.</div>'
      + '</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  });
}

function _revalidateInBackground(request) {
  fetch(request).then(function(response) {
    if (response && response.status === 200 && response.type === 'basic') {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, response);
      });
    }
  }).catch(function() { /* silenzioso */ });
}

// ── MESSAGGI DAL CLIENT ───────────────────────────────────
self.addEventListener('message', function(event) {
  // Permette al Launcher di forzare un aggiornamento della cache
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Svuota tutta la cache (utile per debug)
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(function() {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
