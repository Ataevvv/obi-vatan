const CACHE = 'obiVatan-v5';
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
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
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

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; });
      return cached || net;
    })
  );
});

// ─── Push уведомления ───
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}

  const title   = data.title || 'Оби Ватан';
  const options = {
    body:    data.body  || 'Новое уведомление',
    icon:    '/icon-app-192.png',
    badge:   '/icon-app-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag:     data.orderId || 'obi-push',
    renotify: true,
    data:    { url: data.url || '/driver' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/driver';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
