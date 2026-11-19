// Forekash · Service Worker
// Servido como arquivo fixo (não mais blob:) pra que o navegador consiga
// comparar bytes e atualizar sozinho a cada deploy. A linha CACHE abaixo é
// reescrita pelo script de deploy — é ela que dispara a atualização.
const CACHE = 'forekash-v1795114751';
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

  // HTML sempre validado na rede — nunca serve página velha.
  //
  // 'no-cache' e não 'no-store': os dois obrigam a perguntar ao servidor, mas
  // 'no-store' ignora o cache do navegador e baixa os 9 MB de novo em toda
  // abertura. 'no-cache' manda a pergunta com o etag e, se nada mudou, o
  // servidor responde 304 sem corpo — página idêntica, download zero. Página
  // velha continua impossível: a resposta só é reaproveitada quando o próprio
  // servidor diz que o arquivo é o mesmo.
  const isHtml = u.pathname === '/' || u.pathname.endsWith('.html') || e.request.mode === 'navigate';
  if (isHtml) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
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
