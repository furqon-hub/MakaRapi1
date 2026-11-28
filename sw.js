/* ==========================================================================
   MakaRapi — Service Worker (PWA Offline Cache)
   Strategi:
   - /api/*  : Network-only (tidak pernah di-cache agar data & unggahan selalu segar)
   - AppShell: Network-first dengan fallback cache lokal agar tetap jalan saat offline
   - CDN     : Stale-while-revalidate agar font/Tailwind/Mammoth tetap tersedia offline
   ========================================================================== */

const CACHE_VERSION = 'makarapi-shell-v8';
const APP_SHELL_URLS = [
  '/',
  '/home.html',
  '/index.html',
  '/manifest.webmanifest',
  '/css/style.css',
  '/js/tailwind-config.js',
  '/js/supabase-config.js',
  '/js/supabase-client.js',
  '/js/api-client.js',
  '/js/docx-exporter.js',
  '/js/home.js',
  '/js/app.js',
  '/js/pwa.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Jangan pernah cache endpoint API
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Origin sama (App Shell): Network-first, fallback cache bila offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/home.html'))
        )
    );
    return;
  }

  // 3. Aset CDN eksternal (Tailwind, Fonts, Mammoth, PDF.js): Stale-while-revalidate
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('tailwindcss.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && (res.status === 200 || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
