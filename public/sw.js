const CACHE = 'obiVatan-v8';

self.addEventListener('install', e => {
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

  // API и медиа — только сеть
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
    return;
  }

  // Всё остальное — сначала сеть, кэш только если офлайн
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
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
    data:    { url: data.url || '/admin' }
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
