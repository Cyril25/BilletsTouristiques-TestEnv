// ============================================================
// Service Worker — BilletsTouristiques
// Stratégie :
//   - Network First : assets du site (HTML, CSS, JS)
//                     → mise à jour immédiate, cache en fallback offline
//   - Cache First   : CDN externes (fonts, icons)
//   - Network Only  : API données (supabase, workers.dev, google)
// ============================================================

const CACHE_NAME = 'billets-v155';

const STATIC_ASSETS = [
    './',
    'index.html',
    'billets.html',
    'login.html',
    'contact.html',
    'frais-port.html',
    'infos-collecteurs.html',
    'reglement.html',
    'liens.html',
    'menu.html',
    'style.css',
    'app.js',
    'global.js',
    'users.html',
    'users.js',
    'collecteurs.html',
    'collecteurs.js',
    'profil.html',
    'profil.js',
    'mes-collectes.html',
    'mes-collectes.js',
    'mes-inscriptions.html',
    'mes-inscriptions.js',
    'app-new.js',
    'admin-pre-inscriptions.html',
    'admin-pre-inscriptions.js',
    'ma-collection.html',
    'ma-collection.js',
    'billet.html',
    'billet.js',
];

// Domaines dont les réponses ne doivent JAMAIS être mises en cache
const NETWORK_ONLY_ORIGINS = [
    'workers.dev',
    'drive.google.com',
    'identitytoolkit.googleapis.com',
    'firestore.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseapp.com',
    'googleapis.com',
    'accounts.google.com',
    'supabase.co',
];

// ---------------------------------------------------------------
// Installation : pré-cache les assets statiques
// ---------------------------------------------------------------
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------
// Activation : supprime les anciens caches
// ---------------------------------------------------------------
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------
// Fetch : stratégie selon l'origine
// ---------------------------------------------------------------
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ignorer les schémas non-HTTP (extensions Chrome, etc.)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Network Only pour les données dynamiques
    const isNetworkOnly = NETWORK_ONLY_ORIGINS.some(origin => url.hostname.includes(origin));
    if (isNetworkOnly) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Assets du site → Network First (réseau d'abord, cache en fallback offline)
    var isSiteAsset = STATIC_ASSETS.some(function(asset) {
        return url.pathname.endsWith(asset) || url.pathname === '/' && asset === './';
    });

    if (isSiteAsset) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (event.request.method === 'GET' && response && response.status === 200) {
                    var toCache = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, toCache); });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Cache First pour CDN externes (fonts, icons)
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;

            return fetch(event.request).then(function(response) {
                if (event.request.method !== 'GET' || !response || response.status !== 200) {
                    return response;
                }
                var toCache = response.clone();
                caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, toCache); });
                return response;
            });
        })
    );
});
