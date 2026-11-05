/* Service worker: menyimpan salinan web agar bisa dibuka ulang tanpa internet.
 * Strategi: ambil versi terbaru dari jaringan bila ada (maks. 4 detik), lalu simpan;
 * bila jaringan putus, pakai salinan yang tersimpan. Naikkan CACHE setiap rilis. */
const CACHE = 'modul-ski-v1';
const ASSETS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/data.js',
  './assets/plc.js',
  './assets/stations.js',
  './assets/widgets.js',
  './assets/app.js',
  './assets/img/image1.png', './assets/img/image2.png', './assets/img/image3.png', './assets/img/image4.png', './assets/img/image5.png',
  './assets/img/image6.png', './assets/img/image7.png', './assets/img/image8.png', './assets/img/image9.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('modul-ski-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  p.then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      withTimeout(fetch(req), 4000)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true }))
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : null))
          .then(hit => hit || Response.error()))
    );
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => Response.error())));
  }
});
