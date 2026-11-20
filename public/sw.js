// Service worker: guarda la pantalla de Vika (HTML, estilos y código) para que abra aunque no haya internet.
// NUNCA guarda respuestas de la API: los datos de pacientes no se copian al navegador.
const V = 'vika-v2', BASE = ['/', '/index.html', '/css/style.css', '/js/cola.js', '/js/app.js', '/js/ajustes.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Con internet siempre la versión más nueva; sin internet, la guardada
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
