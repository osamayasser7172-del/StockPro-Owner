// ═══════════════════════════════════════════════════
//  StockPro — Service Worker (PWA Offline Support)
//  NOTE: Admin panel is NOT cached — it must always
//        fetch fresh from server to create real clients
// ═══════════════════════════════════════════════════
const CACHE_NAME = 'stockpro-v3'; // bumped to bust old cache
const ASSETS = [
    'stockpro.html',
    'stockpro.css',
    'stockpro.js',
    'stockpro-data.js',
    'manifest.json',
    // admin.html, admin.css, admin.js, sp-admin.js, sp-core.js
    // are intentionally NOT cached — they must always be fresh
];

// Install — cache client assets only
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate — DELETE all old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — network-first for API and admin, cache-first for client assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // NEVER cache admin panel files or API calls — always go to network
    if (url.pathname.includes('admin') ||
        url.pathname.includes('sp-admin') ||
        url.pathname.includes('sp-core') ||
        url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // For client assets: cache-first with network fallback
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            if (event.request.destination === 'document') {
                return caches.match('stockpro.html');
            }
        })
    );
});
