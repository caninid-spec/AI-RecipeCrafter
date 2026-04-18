/* ════════════════════════════════════════
sw.js — La Cucina Service Worker
Strategia: Cache-First per asset statici,
Network-First per le API/Font
════════════════════════════════════════ */
const CACHE_NAME = 'la-cucina-v1';

// Asset statici da pre-cachare all'installazione
// ⚠️ worker.js è stato rimosso perché gira su Cloudflare, non su GitHub Pages
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// ── Install: pre-cache gli asset core ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: rimuove cache vecchie ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// ── Fetch: strategia ibrida ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAPI = 
    url.hostname.includes('openai.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('workers.dev') ||
    (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/')) ||
    event.request.method !== 'GET';

  // API e richieste non GET → lascia passare al network
  if (isAPI) return;

  // Google Fonts → Network-First con fallback cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Asset statici locali → Cache-First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback per navigazione offline
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});