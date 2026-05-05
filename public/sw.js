const CACHE = 'obiVatan-v3';
const STATIC = [
  '/style.css',
  '/script.js',
  '/admin.css',
  '/admin.js',
  '/icon-app-192.png',
  '/icon-app-512.png',
  '/icon-admin-192.png',
  '/icon-admin-512.png',
  '/logo.png',
  '/manifest.json',
  '/admin-manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API — всегда из сети
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('offline', { status: 503 }))
    );
    return;
  }

  // Видео — не кэшируем
  if (url.pathname.startsWith('/media/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML страницы — сначала сеть, потом кэш (чтобы обновления приходили сразу)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // CSS/JS/картинки — кэш первый, но обновляем в фоне
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
      return cached || networkFetch;
    })
  );
});
