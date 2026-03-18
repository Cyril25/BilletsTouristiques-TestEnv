// ============================================================
// Service Worker — BilletsTouristiques
// Stratégie :
//   - Cache First  : assets statiques (HTML, CSS, JS, fonts CDN)
//   - Network Only : API données (workers.dev, drive.google.com)
//                    Les données changent plusieurs fois par jour.
// ============================================================

const CACHE_NAME = 'billets-v27';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/billets.html',
    '/login.html',
    '/contact.html',
    '/frais-port.html',
    '/infos-collecteurs.html',
    '/reglement.html',
    '/liens.html',
    '/menu.html',
    '/style.css',
    '/app.js',
    '/global.js',
    '/users.html',
    '/users.js',
    '/collecteurs.html',
    '/collecteurs.js',
    '/profil.html',
    '/profil.js',
    '/mes-collectes.html',
    '/mes-collectes.js',
    '/mes-inscriptions.html',
    '/mes-inscriptions.js',
    '/billets-new.html',
    '/app-new.js',
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

    // Network Only pour les données dynamiques
    const isNetworkOnly = NETWORK_ONLY_ORIGINS.some(origin => url.hostname.includes(origin));
    if (isNetworkOnly) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache First pour les assets statiques et CDN (fonts, icons)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request).then(response => {
                // Ne met en cache que les réponses valides (GET uniquement)
                if (event.request.method !== 'GET' || !response || response.status !== 200) {
                    return response;
                }
                const toCache = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
                return response;
            });
        })
    );
});
