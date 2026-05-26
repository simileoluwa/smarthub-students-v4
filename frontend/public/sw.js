const CACHE_NAME = 'smarthub-cache-v1';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  '/globals.css',
  '/favicon.ico',
  '/file.svg'
];

// 1. Install Event: Pre-cache standard offline fallback shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static offline assets...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Purging legacy cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Interception: Resilient caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Only process GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass database synchronization gateways (Supabase API is handled by local IndexedDB WAL outbox)
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1')) {
    return;
  }

  // A. Page Navigation Requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Put the fresh page in the cache
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });
          return response;
        })
        .catch(() => {
          // Network failed, try page cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Page not in cache, return the pre-cached premium /offline fallback page
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // B. Static Assets Caching (Next.js chunks, fonts, public SVGs)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-While-Revalidate: serve cached version instantly, fetch fresh copy in background
          fetch(request).then((freshResponse) => {
            if (freshResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, freshResponse);
              });
            }
          }).catch(() => {
            // Ignore background fetch failure when isolated
          });
          return cachedResponse;
        }

        // Cache miss: download from network and save
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseCopy);
            });
          }
          return response;
        });
      })
    );
  }
});
