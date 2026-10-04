// Service Worker: офлайн-оболонка застосунку.
// Збільште VERSION при релізі, щоб користувачі побачили кнопку «Оновити».
const VERSION = 'v3';
const CACHE = `renowise-${VERSION}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/actions.js', 'js/calc.js', 'js/cropper.js', 'js/db.js', 'js/demo.js', 'js/derived.js', 'js/icons.js',
  'js/identity.js', 'js/media.js', 'js/model.js', 'js/morph.js', 'js/planner.js', 'js/prefs.js', 'js/sheets.js', 'js/store.js',
  'js/sync.js', 'js/ui.js', 'js/util.js',
  'js/views/dashboard.js', 'js/views/plan.js', 'js/views/settings.js', 'js/views/shop.js', 'js/views/spaces.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('renotrack-') || k.startsWith('renowise-')) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (own || sdk) e.respondWith(staleWhileRevalidate(e));
  // Усе інше (RTDB, зображення магазинів, API) — напряму в мережу.
});

// На localhost (розробка) спершу мережа, щоб правки одразу було видно; кеш — лише як запасний.
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

async function staleWhileRevalidate(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  if (DEV) {
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch { if (hit) return hit; }
  }
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
  return Response.error();
}
