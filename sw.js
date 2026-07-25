const SHELL_CACHE = 'qurtubi-shell-v1';
const DATA_CACHE = 'qurtubi-data-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data/surahs.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin) return;

  const isData = url.pathname.includes('/data/') || url.pathname.includes('/idx/');

  if(isData){
    // cache-first for data & index chunks (they never change once fetched)
    e.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(e.request).then(cached => cached || fetch(e.request).then(res => {
          if(res.ok) cache.put(e.request, res.clone());
          return res;
        }))
      )
    );
  } else {
    // network-first for app shell, fallback to cache
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(SHELL_CACHE).then(cache => cache.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
