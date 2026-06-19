/* Service Worker：缓存全部资源，离线可玩 */
const CACHE = 'westie-mixc-v1';
const ASSETS = [
  './', './index.html',
  './css/style.css',
  './js/audio.js', './js/game.js', './js/main.js',
  './lib/phaser.min.js',
  './manifest.webmanifest',
  './assets/bg_street.webp', './assets/bg_ground.webp',
  './assets/westie_run.webp', './assets/westie_run2.webp', './assets/westie_jump.webp',
  './assets/coin.webp', './assets/item_bone.webp', './assets/item_bag.webp',
  './assets/item_coffee.webp', './assets/item_toy.webp',
  './assets/obs_cart.webp', './assets/obs_cone.webp', './assets/obs_box.webp',
  './assets/prop_plant.webp', './assets/prop_balloons.webp',
  './assets/title_hero.webp',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
