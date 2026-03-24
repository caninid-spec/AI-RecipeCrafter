/* ════════════════════════════════════════
   sw.js — La Cucina Service Worker
   Strategia: Cache-First per asset statici,
   Network-First per le API calls
════════════════════════════════════════ */

const CACHE_NAME = 'la-cucina-v1';

// Asset statici da pre-cachare all'installazione
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './worker.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Font Google (vengono serviti dalla rete, ma si cachano alla prima visita)
];

// ── Install: pre-cache gli asset core ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Attiva subito senza aspettare la chiusura delle vecchie tab
  self.skipWaiting();
});

// ── Activate: rimuove cache vecchie ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Prende controllo di tutte le tab aperte immediatamente
  self.clients.claim();
});

// ── Fetch: strategia ibrida ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls (OpenAI, ecc.) → solo Network, mai cache
  if (
    url.hostname.includes('openai.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/ai/') ||
    event.request.method !== 'GET'
  ) {
    return; // lascia passare senza intercettare
  }

  // Google Fonts → Network con fallback cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // Asset statici locali → Cache-First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cacha solo risposte valide
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback: restituisce la shell dell'app
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
