// 오프라인 실행용 서비스 워커: 네트워크 우선, 끊기면 캐시로 실행한다.
const CACHE = 'bio-arcade-v1';
const FILES = [
  './',
  'games/basepang/engine.js',
  'games/basepang/game.js',
  'games/basepang/index.html',
  'games/glucose/game.js',
  'games/glucose/index.html',
  'games/glucose/model.js',
  'games/mendel/game.js',
  'games/mendel/genetics.js',
  'games/mendel/index.html',
  'games/pedigree/game.js',
  'games/pedigree/index.html',
  'games/pedigree/pedigree.js',
  'games/quest/css/style.css',
  'games/quest/index.html',
  'games/quest/js/battles.js',
  'games/quest/js/data.js',
  'games/quest/js/main.js',
  'games/run/game.js',
  'games/run/index.html',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'index.html',
  'manifest.webmanifest',
  'shared/arcade.css',
  'shared/arcade.js',
  'shared/standards.js',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
});
