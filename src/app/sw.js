// Wavelength app service worker: the app shell opens offline. API calls always go to the network.
const VERSION = '__V__';
const SHELL = ['/app/', '/app/app.css?v=__V__', '/app/theme.js?v=__V__', '/app/config.js?v=__V__', '/app/zip.js?v=__V__', '/app/progress.js?v=__V__', '/app/forms.js?v=__V__', '/app/verified.js?v=__V__', '/app/native.js?v=__V__', '/app/app.js?v=__V__', '/app/icon-192.png', '/assets/fonts/dm-sans-latin-400-normal.woff2', '/assets/fonts/dm-sans-latin-500-normal.woff2', '/assets/fonts/dm-sans-latin-600-normal.woff2', '/assets/fonts/cormorant-garamond-latin-500-normal.woff2', '/assets/logo-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open('wl-' + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('wl-') && k !== 'wl-' + VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate' && u.pathname.startsWith('/app')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/app/')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (u.pathname.startsWith('/app/vendor/') || u.pathname.startsWith('/app/i18n/') || u.pathname.startsWith('/assets/fonts/'))) { const copy = res.clone(); caches.open('wl-' + VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
