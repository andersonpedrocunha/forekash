// Forekash · Service Worker
// Servido como arquivo fixo (não mais blob:) pra que o navegador consiga
// comparar bytes e atualizar sozinho a cada deploy. A linha CACHE abaixo é
// reescrita pelo script de deploy — é ela que dispara a atualização.
const CACHE = 'forekash-v1786649245';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);

  // HTML sempre da rede — nunca serve página velha
  const isHtml = u.pathname === '/' || u.pathname.endsWith('.html') || e.request.mode === 'navigate';
  if (isHtml) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Demais assets: rede primeiro, cache como rede de segurança (offline)
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok && r.type === 'basic') {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
