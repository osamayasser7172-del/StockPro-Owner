// ═══════════════════════════════════════════════════
//  StockPro — Service Worker (PWA Offline Support)
// ═══════════════════════════════════════════════════
const CACHE_NAME = 'stockpro-v1';
const ASSETS = [
    'stockpro.html',
    'stockpro.css',
    'stockpro.js',
    'stockpro-data.js',
    'admin.html',
    'admin.css',
    'admin.js',
    'manifest.json',
];

// Install — cache all assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — serve from cache or network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                // Cache new requests
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Offline fallback
            if (event.request.destination === 'document') {
                return caches.match('stockpro.html');
            }
        })
    );
});
