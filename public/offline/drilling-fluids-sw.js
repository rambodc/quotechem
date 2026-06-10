const CACHE_NAME = 'quotechem-drilling-fluids-v3';
const OFFLINE_ROUTE = '/offline/drilling-fluids-report';
const MANIFEST_URL = '/offline/drilling-fluids-manifest.json';
const SHELL_URLS = [OFFLINE_ROUTE, MANIFEST_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('quotechem-drilling-fluids-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function shouldRuntimeCache(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/static/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname === '/logo192.png' ||
      url.pathname === '/logo512.png' ||
      url.pathname === MANIFEST_URL)
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    if (url.pathname !== OFFLINE_ROUTE) return;

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_ROUTE, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_ROUTE))
    );
    return;
  }

  if (event.request.method !== 'GET' || !shouldRuntimeCache(url)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
