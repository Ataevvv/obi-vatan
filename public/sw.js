const CACHE = 'obiVatan-v2';
const ASSETS = [
  '/',
  '/style.css',
  '/script.js',
  '/logo.png',
  '/manifest.json',
  '/icon-app-192.png',
  '/icon-app-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
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
  // API запросы — всегда из сети
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
    return;
  }
  // Видео — не кэшируем (большой файл)
  if (e.request.url.includes('/media/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Остальное — сначала кэш, потом сеть
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
