const SHELL_CACHE = 'hosted-nowhere:shell:v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
      const fallback = await caches.match(new URL('./', self.location).toString());
      if (fallback) return fallback;
    }
    throw error;
  }
}
