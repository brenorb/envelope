const SHELL_CACHE = 'hosted-nowhere:shell:v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './sw.js',
  './__kehto/browser-host.js',
  './__kehto/config.json',
  './__kehto/nowhere-host.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('hosted-nowhere:shell:') && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(cacheShellRequest(request));
});

async function cacheShellRequest(request) {
  const cached = await caches.match(request);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match(new URL('./index.html', self.location).toString());
      if (fallback) return fallback;
    }
    throw error;
  }
}
