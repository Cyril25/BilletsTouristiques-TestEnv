// ============================================================
// 1. INITIALISATION FIREBASE (VIGILANCE ACCRUE)
// ============================================================

// On vérifie d'abord si la librairie Firebase est bien chargée dans le HTML
if (typeof firebase === 'undefined') {
    console.error("ERREUR CRITIQUE : Les scripts Firebase (app.js et auth.js) ne sont pas chargés dans le HTML avant global.js !");
} else {
    // On ne lance l'initialisation QUE si aucune app n'existe déjà
    if (!firebase.apps.length) {
        firebase.initializeApp({
            apiKey: "AIzaSyCZ_uO-eolAZJs6As82aicoSuZYmT-DeaY",
            authDomain: "asso-billet-site.firebaseapp.com",
            projectId: "asso-billet-site",
            storageBucket: "asso-billet-site.appspot.com",
            messagingSenderId: "644448143950",
            appId: "1:644448143950:web:f64ccc8f62883507ea111f"
        });
        console.log("Firebase initialisé avec succès.");
    }
}

// ============================================================
// 1b. CONFIGURATION SUPABASE (dual-env : staging vs prod)
// ============================================================
// Whitelist stricte — seuls ces hostnames sont autorisés.
// Évite qu'un sous-domaine contenant "staging" bascule accidentellement.
var STAGING_HOSTNAMES = ['billetstouristiques.netlify.app'];
var PROD_HOSTNAMES = ['cyril25.github.io'];
var _host = window.location.hostname;
var IS_STAGING = STAGING_HOSTNAMES.indexOf(_host) !== -1;
var IS_PROD = PROD_HOSTNAMES.indexOf(_host) !== -1;
var IS_LOCAL = (_host === 'localhost' || _host === '127.0.0.1');
if (!IS_STAGING && !IS_PROD && !IS_LOCAL) {
    console.warn('Hostname non whitelisté : ' + _host + ' — fallback prod');
}

var SUPABASE_URL = IS_STAGING
    ? 'https://ijxajtxnhbczgiarkefo.supabase.co'
    : 'https://lhwcoybugdsggcclhtgb.supabase.co';
var SUPABASE_ANON_KEY = IS_STAGING
    ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqeGFqdHhuaGJjemdpYXJrZWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjY0MTMsImV4cCI6MjA5MTY0MjQxM30.5t-P56E4QfJpDooveaYp6zEW1vqMsmnD3ejQ9ZhU8rg'
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxod2NveWJ1Z2RzZ2djY2xodGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODY5MzQsImV4cCI6MjA4ODU2MjkzNH0.I1CvqdFT4XPCCfIzJRlYNwKay2MVQ9YBB1_8qfJmQqQ';

// --- Bandeau staging ---
if (IS_STAGING) {
    document.addEventListener('DOMContentLoaded', function() {
        var banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff6600;color:#fff;text-align:center;padding:6px;font-weight:bold;font-size:14px;';
        banner.textContent = 'ENVIRONNEMENT STAGING — base de test';
        document.body.prepend(banner);
        document.body.style.marginTop = '32px';
    });
}

// --- Impersonation globale (superadmin uniquement) ---
window.impersonatedEmail = sessionStorage.getItem('impersonatedEmail') || '';
window.getActiveEmail = function() {
    return window.impersonatedEmail || (firebase.auth().currentUser && firebase.auth().currentUser.email) || '';
};

/**
 * Helper : fetch authentifié vers Supabase.
 * Récupère le Firebase ID token et l'envoie en Bearer.
 * @param {string} path - Chemin REST (ex: '/rest/v1/billets?select=*')
 * @param {object} options - Options fetch (method, body, headers supplémentaires)
 * @returns {Promise} - Promise avec les données JSON ou null (204)
 */
function supabaseFetch(path, options) {
    if (!options) options = {};
    // SEC-10 — Verifier que l'utilisateur est connecte avant d'appeler getIdToken
    if (!firebase.auth().currentUser) {
        return Promise.reject(new Error('Non authentifie'));
    }
    return firebase.auth().currentUser.getIdToken(false)
        .then(function(token) {
            var headers = {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            };
            // Fusionner les headers supplémentaires (ex: Prefer)
            if (options.headers) {
                var extra = options.headers;
                for (var key in extra) {
                    if (extra.hasOwnProperty(key)) {
                        headers[key] = extra[key];
                    }
                }
            }
            var fetchOptions = { method: options.method || 'GET', headers: headers };
            if (options.body) fetchOptions.body = options.body;
            return fetch(SUPABASE_URL + path, fetchOptions);
        })
        .then(function(response) {
            // SEC-15 — 204 n'a pas de body, 201 peut en avoir
            if (response.status === 204) return null;
            if (response.status === 201) return response.json().catch(function() { return null; });
            if (!response.ok) {
                return response.text().then(function(text) {
                    var msg = 'Erreur Supabase ' + response.status;
                    try { msg = JSON.parse(text).message || msg; } catch(e) {}
                    throw new Error(msg);
                });
            }
            return response.text().then(function(text) {
                if (!text) return null;
                return JSON.parse(text);
            });
        });
}

// ============================================================
// 2. LE VIGILE (SÉCURITÉ & NAVIGATION)
// ============================================================
document.addEventListener("DOMContentLoaded", function() {

    // Sécurité supplémentaire
    if (typeof firebase === 'undefined') return;

    var auth = firebase.auth();

    auth.onAuthStateChanged(function(user) {
        var path = window.location.pathname;
        var page = path.split("/").pop();
        var isLoginPage = (page === "login.html" || page === "login"); // petit fix au cas où

        if (user) {
            console.log("Utilisateur détecté : " + user.email);

            // --- VÉRIFICATION MEMBRES VIA SUPABASE ---
            firebase.auth().currentUser.getIdToken(false)
            .then(function(token) {
                return fetch(
                    SUPABASE_URL + '/rest/v1/membres?email=eq.' + encodeURIComponent(user.email) + '&select=role',
                    {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': 'Bearer ' + token
                        }
                    }
                );
            })
            .then(function(response) {
                if (!response.ok) throw new Error('Erreur Supabase ' + response.status);
                return response.json();
            })
            .then(function(rows) {
                if (rows && rows.length > 0) {
                    // --- AUTORISÉ : l'email est dans la table membres ---
                    console.log("Accès autorisé pour : " + user.email);
                    window.userRole = rows[0].role || 'member';

                    // Fire-and-forget : mettre à jour last_active_at
                    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(user.email), {
                        method: 'PATCH',
                        body: JSON.stringify({ last_active_at: new Date().toISOString() })
                    }).catch(function() {});

                    if (isLoginPage) {
                        window.location.href = "index.html";
                    } else {
                        // Guard admin : vérifier si la page requiert le rôle admin
                        // En impersonation, on utilise le rôle effectif (celui du membre impersonné)
                        var guardRole = window.userRole;
                        if (window.impersonatedEmail && (window.userRole === 'superadmin' || window.userRole === 'admin')) {
                            guardRole = 'member'; // sera vérifié ci-dessous via la requête
                        }
                        if (document.body.getAttribute('data-require-admin') === 'true' && guardRole !== 'admin' && guardRole !== 'superadmin') {
                            // En impersonation, on vérifie le rôle réel du membre impersonné
                            if (window.impersonatedEmail) {
                                var activeEmail = window.getActiveEmail();
                                supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(activeEmail) + '&select=role')
                                    .then(function(rows) {
                                        var role = (rows && rows.length > 0) ? rows[0].role || 'member' : 'member';
                                        if (role !== 'admin' && role !== 'superadmin') {
                                            window.location.href = 'index.html';
                                        } else {
                                            loadMenu();
                                            var appContent = document.getElementById('app-content');
                                            if (appContent) appContent.style.display = 'block';
                                        }
                                    })
                                    .catch(function() { window.location.href = 'index.html'; });
                                return;
                            }
                            window.location.href = 'index.html';
                            return;
                        }


                        loadMenu();
                        var appContent = document.getElementById('app-content');
                        if (appContent) appContent.style.display = 'block';
                    }
                } else {
                    // --- REFUSÉ : email inconnu ---
                    console.warn("Accès REFUSÉ. Email inconnu dans la table membres.");
                    auth.signOut().then(function() {
                        window.location.href = 'login.html?error=unauthorized';
                    });
                }
            })
            .catch(function(error) {
                console.error("Erreur lors de la vérification membres :", error);
                // SEC-09 — Afficher un message d'erreur au lieu d'une page blanche
                var appContent = document.getElementById('app-content');
                if (appContent) {
                    appContent.style.display = 'block';
                    appContent.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-danger, #CC4444);">' +
                        '<i class="fa-solid fa-circle-exclamation" style="font-size:2em;margin-bottom:12px;display:block;"></i>' +
                        '<strong>Erreur de connexion au serveur.</strong><br>' +
                        '<span style="color:var(--color-text-light, #666);">Veuillez rafraichir la page ou reessayer plus tard.</span>' +
                        '</div>';
                }
            });

        } else {
            // --- NON CONNECTÉ ---
            console.log("Non connecté -> Redirection");
            if (!isLoginPage) {
                window.location.href = "login.html";
            }
        }
    });
});

// ============================================================
// 3. FONCTIONS AUTH
// ============================================================
function loginWithGoogle() {
    if (typeof firebase === 'undefined') return;
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .catch(function(error) {
            console.error(error);
            alert("Erreur connexion : " + error.message);


        });








}

function logout() {
    if (typeof firebase === 'undefined') return;
    firebase.auth().signOut().then(function() {
        window.location.href = "login.html";
    });
}

// ============================================================
// 3b. DICTIONNAIRE DES VARIANTES
// ============================================================
// Codes BDD : NULL = Non renseigné (à vérifier), 'N' = Pas de variante (confirmé),
//             'A' = Anniversaire, 'D' = Doré
// Dictionnaire COMPLET (inclut NULL et N pour les contextes qui veulent expliciter l'état)
window.VARIANTE_LABELS_ALL = {
    '_null': 'Non renseigné',
    'N':     'Pas de variante',
    'A':     'Anniversaire',
    'D':     'Doré'
};
window.VARIANTE_LABELS_ALL_SHORT = {
    '_null': '?',
    'N':     'aucune',
    'A':     'anniv',
    'D':     'dorés'
};

// Vrai si le billet possède effectivement une variante (A/D uniquement)
function hasVarianteActive(code) {
    return !!(code && code !== 'N');
}
// Libellé long pour variante ACTIVE uniquement ('Anniversaire', 'Doré') ou '' sinon.
// → À utiliser pour les badges ⭐ qui ne doivent apparaître que s'il y a une variante.
function varianteLabel(code) {
    if (!hasVarianteActive(code)) return '';
    return window.VARIANTE_LABELS_ALL[code] || code;
}
// Idem, version courte ('anniv', 'dorés').
function varianteLabelShort(code) {
    if (!hasVarianteActive(code)) return '';
    return window.VARIANTE_LABELS_ALL_SHORT[code] || code;
}
// Libellé pour TOUS les états (y compris NULL et N).
// → À utiliser dans les filtres admin, fiche détail, exports, où on veut expliciter
//   la différence entre « Non renseigné » et « Pas de variante ».
function varianteLabelAny(code) {
    if (code == null) return window.VARIANTE_LABELS_ALL._null;
    return window.VARIANTE_LABELS_ALL[code] || code;
}
function varianteLabelAnyShort(code) {
    if (code == null) return window.VARIANTE_LABELS_ALL_SHORT._null;
    return window.VARIANTE_LABELS_ALL_SHORT[code] || code;
}

// ============================================================
// 4. MENU (Mise à jour)
// ============================================================
function loadMenu() {
    var placeholder = document.getElementById("menu-placeholder");
    if (!placeholder) return;

    fetch("menu.html?v=109")
        .then(function(response) { return response.text(); })
        .then(function(html) {
            // 1. On injecte le HTML
            placeholder.innerHTML = html;

            // 2. On gère le lien actif
            highlightActiveLink();

            // PWA — Afficher le bouton "Installer" si pertinent (iOS ou prompt déjà capturé)
            if (typeof window.__showInstallButtonIfRelevant === 'function') {
                window.__showInstallButtonIfRelevant();
            }

            // 3. ON AFFICHE L'EMAIL
            var user = firebase.auth().currentUser;
            var emailSpan = document.getElementById("user-email-display");

            // On vérifie si l'utilisateur est là et si le span existe
            if (user && emailSpan) {
                emailSpan.textContent = window.impersonatedEmail || user.email;
                // Bouton impersonation pour superadmin
                if (window.userRole === 'superadmin' && !document.getElementById('global-impersonate-btn')) {
                    var impBtn = document.createElement('button');
                    impBtn.id = 'global-impersonate-btn';
                    impBtn.className = 'btn-impersonate';
                    impBtn.title = 'Se connecter en tant que...';
                    impBtn.innerHTML = '<i class="fa-solid fa-user-secret"></i>';
                    impBtn.onclick = function() { window.showImpersonateModal(); };
                    emailSpan.parentNode.insertBefore(impBtn, emailSpan.nextSibling);
                }
                // Bannière impersonation
                renderImpersonateBanner();
            }

            // STORY 1.2 — Menu conditionnel : afficher les liens admin uniquement pour les admins
            // En mode impersonation, on affiche le menu selon le rôle de la personne impersonnée
            var activeEmail = window.getActiveEmail();
            var menuRolePromise;
            if (window.impersonatedEmail && (window.userRole === 'superadmin' || window.userRole === 'admin')) {
                menuRolePromise = supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(activeEmail) + '&select=role')
                    .then(function(rows) {
                        return (rows && rows.length > 0) ? rows[0].role || 'member' : 'member';
                    })
                    .catch(function() { return 'member'; });
            } else {
                menuRolePromise = Promise.resolve(window.userRole);
            }

            menuRolePromise.then(function(effectiveRole) {
                var adminLinks = document.querySelectorAll('[data-admin-only], .admin-only');
                if (effectiveRole === 'admin' || effectiveRole === 'superadmin') {
                    adminLinks.forEach(function(el) {
                        el.setAttribute('data-admin-only', '');
                        el.classList.remove('admin-only');
                    });
                } else {
                    adminLinks.forEach(function(el) {
                        el.classList.add('admin-only');
                    });
                }

                // QW-1 — Masquer "Mes collectes" pour les non-collecteurs
                supabaseFetch('/rest/v1/collecteurs?email_membre=eq.' + encodeURIComponent(activeEmail) + '&select=id')
                    .then(function(data) {
                        if (!data || data.length === 0) {
                            var collectesLink = document.querySelector('a[href="mes-collectes.html"]');
                            if (collectesLink) collectesLink.style.display = 'none';
                        }
                    })
                    .catch(function() {});
            });
        })
        .catch(function(err) { console.error("Menu introuvable :", err); });
}

function highlightActiveLink() {
    var page = window.location.pathname.split("/").pop();
    if(page === "") page = "index.html";

    setTimeout(function() {
        // QW-2 — Marquer le lien actif dans la navbar ET les dropdowns
        var links = document.querySelectorAll(".nav-links a");
        links.forEach(function(link) {
            if(link.getAttribute("href") === page) {
                link.classList.add("active");
                // Si le lien actif est dans un dropdown, marquer aussi le bouton parent
                var dropdown = link.closest('.dropdown');
                if (dropdown) {
                    var dropbtn = dropdown.querySelector('.dropbtn');
                    if (dropbtn) dropbtn.classList.add('active');
                }
            }
        });
    }, 100);
}

function toggleMenu() {
    var nav = document.getElementById('nav-links');
    if(nav) nav.classList.toggle('active');
}

// ============================================================
// 5. STORY 5.3 — VERIFICATION PROFIL COMPLET
// ============================================================

/**
 * Vérifie si le profil du membre connecté est complet (5 champs adresse renseignés).
 * Utilisée par Story 5.4 avant inscription.
 * @param {function} callback - Fonction appelée avec un booléen (true = complet)
 */
function isProfilComplet(callback) {
    var email = window.getActiveEmail();
    if (!email) { callback(false); return; }
    supabaseFetch('/rest/v1/membres?email=eq.' + encodeURIComponent(email) + '&select=nom,prenom,rue,code_postal,ville,pays')
        .then(function(data) {
            if (!data || data.length === 0) { callback(false); return; }
            var m = data[0];
            var complet = m.nom && m.prenom && m.rue && m.code_postal && m.ville && m.pays;
            callback(!!complet);
        })
        .catch(function() { callback(false); });
}

// ============================================================
// 6. SERVICE WORKER (Cache des assets statiques)
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js')
            .catch(function(err) { console.warn('Service Worker non enregistré :', err); });
    });
}

// ============================================================
// 6b. PWA — Installation sur l'écran d'accueil
// ============================================================
// Injection du manifest et des meta PWA sur toutes les pages (évite de modifier chaque HTML)
(function injectPwaMeta() {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    function add(tag, attrs) {
        var el = document.createElement(tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        head.appendChild(el);
    }
    if (!document.querySelector('link[rel="manifest"]')) add('link', { rel: 'manifest', href: 'manifest.json' });
    if (!document.querySelector('meta[name="theme-color"]')) add('meta', { name: 'theme-color', content: '#5D3A7E' });
    if (!document.querySelector('link[rel="apple-touch-icon"]')) add('link', { rel: 'apple-touch-icon', href: 'icon.svg' });
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) add('meta', { name: 'apple-mobile-web-app-title', content: 'Billets T.' });
})();

// Détection iOS (Safari ne supporte pas beforeinstallprompt)
window.__isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
// Détection mode standalone (déjà installée)
window.__isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

window.__deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    var btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', function() {
    window.__deferredInstallPrompt = null;
    var btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
});

// Affiche le bouton sur iOS (pas de prompt natif → instructions manuelles)
window.__showInstallButtonIfRelevant = function() {
    var btn = document.getElementById('btn-install-pwa');
    if (!btn) return;
    if (window.__isStandalone) { btn.style.display = 'none'; return; }
    if (window.__isIos || window.__deferredInstallPrompt) {
        btn.style.display = '';
    }
};

window.installPwa = function() {
    // Cas iOS : afficher les instructions
    if (window.__isIos) {
        window.showIosInstallInstructions();
        return;
    }
    var p = window.__deferredInstallPrompt;
    if (!p) {
        alert("L'installation n'est pas disponible sur ce navigateur. Essayez Chrome ou Edge, ou utilisez le menu du navigateur \u00ab Installer l'application \u00bb.");
        return;
    }
    p.prompt();
    p.userChoice.then(function(res) {
        if (res && res.outcome === 'accepted') {
            var btn = document.getElementById('btn-install-pwa');
            if (btn) btn.style.display = 'none';
        }
        window.__deferredInstallPrompt = null;
    });
};

window.showIosInstallInstructions = function() {
    if (document.getElementById('ios-install-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'ios-install-overlay';
    overlay.className = 'ios-install-overlay';
    overlay.onclick = function() { overlay.remove(); };
    overlay.innerHTML =
        '<div class="ios-install-modal" onclick="event.stopPropagation()">' +
            '<button class="ios-install-close" onclick="document.getElementById(\'ios-install-overlay\').remove()" aria-label="Fermer">&times;</button>' +
            '<h3><i class="fa-solid fa-mobile-screen"></i> Installer sur l\'écran d\'accueil</h3>' +
            '<p>Sur iPhone / iPad (Safari) :</p>' +
            '<ol>' +
                '<li>Touchez l\'icône <strong>Partager</strong> <i class="fa-solid fa-arrow-up-from-bracket"></i> en bas de l\'écran.</li>' +
                '<li>Faites défiler puis choisissez <strong>« Sur l\'écran d\'accueil »</strong> <i class="fa-regular fa-square-plus"></i>.</li>' +
                '<li>Touchez <strong>« Ajouter »</strong> en haut à droite.</li>' +
            '</ol>' +
            '<p class="ios-install-note">L\'icône Billets Touristiques apparaîtra sur votre écran d\'accueil.</p>' +
        '</div>';
    document.body.appendChild(overlay);
};

// ============================================================
// 7. IMPERSONATION GLOBALE (superadmin uniquement)
// ============================================================

function renderImpersonateBanner() {
    var banner = document.getElementById('global-impersonate-banner');
    if (window.impersonatedEmail) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'global-impersonate-banner';
            banner.className = 'impersonate-banner';
            var body = document.body;
            body.insertBefore(banner, body.firstChild);
        }
        banner.innerHTML = '<i class="fa-solid fa-user-secret"></i> Vue en tant que <strong>' + window.impersonatedEmail + '</strong> ' +
            '<button class="btn-link" onclick="window.stopImpersonate()"><i class="fa-solid fa-xmark"></i> Revenir à mon compte</button>';
        banner.style.display = '';
    } else if (banner) {
        banner.style.display = 'none';
    }
}

window.showImpersonateModal = function() {
    if (window.userRole !== 'superadmin') return;

    supabaseFetch('/rest/v1/membres?select=email,prenom,nom')
    .then(function(membres) {
        membres.sort(function(a, b) {
            var na = ((a.nom || '') + ' ' + (a.prenom || '')).trim().toLowerCase() || a.email.toLowerCase();
            var nb = ((b.nom || '') + ' ' + (b.prenom || '')).trim().toLowerCase() || b.email.toLowerCase();
            return na.localeCompare(nb);
        });
        var html = '<div class="impersonate-modal-overlay" onclick="window.closeImpersonateModal()">';
        html += '<div class="impersonate-modal" onclick="event.stopPropagation()">';
        html += '<button class="impersonate-modal-close" onclick="window.closeImpersonateModal()">&times;</button>';
        html += '<h2>Se connecter en tant que...</h2>';
        html += '<div class="impersonate-list">';
        var realEmail = firebase.auth().currentUser.email;
        membres.forEach(function(m) {
            var label = ((m.nom || '') + ' ' + (m.prenom || '')).trim() || m.email;
            var isSelf = m.email === realEmail;
            html += '<div class="impersonate-item' + (isSelf ? ' impersonate-item-self' : '') + '" onclick="window.selectImpersonate(\'' + m.email.replace(/'/g, "\\'") + '\')">';
            html += '<strong>' + label + '</strong><br><small>' + m.email + '</small>';
            if (isSelf) html += ' <em>(moi)</em>';
            html += '</div>';
        });
        html += '</div></div></div>';

        var container = document.getElementById('impersonate-modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'impersonate-modal-container';
            document.body.appendChild(container);
        }
        container.innerHTML = html;
    })
    .catch(function(err) {
        console.error('Erreur chargement membres:', err);
    });
};

window.closeImpersonateModal = function() {
    var container = document.getElementById('impersonate-modal-container');
    if (container) container.innerHTML = '';
};

window.selectImpersonate = function(email) {
    window.closeImpersonateModal();
    var realEmail = firebase.auth().currentUser.email;
    window.impersonatedEmail = (email === realEmail) ? '' : email;
    sessionStorage.setItem('impersonatedEmail', window.impersonatedEmail);

    // Mettre à jour l'affichage email
    var emailSpan = document.getElementById('user-email-display');
    if (emailSpan) emailSpan.textContent = window.impersonatedEmail || realEmail;

    renderImpersonateBanner();

    // Recharger la page pour appliquer le changement
    window.location.reload();
};

// ── Masques de saisie nom / prénom ──────────────────────────
// Nom → MAJUSCULES, Prénom → Première lettre de chaque mot en majuscule
// Fonctionne sur tout input ayant la classe .input-uppercase ou .input-capitalize,
// y compris ceux injectés dynamiquement (event delegation).
function toUpperCaseValue(val) {
    return val.toUpperCase();
}
function toCapitalizeValue(val) {
    return val.replace(/(^|\s|-|')(\S)/g, function(match, sep, letter) {
        return sep + letter.toUpperCase();
    });
}
document.addEventListener('input', function(e) {
    var el = e.target;
    if (el.tagName !== 'INPUT') return;
    if (el.classList.contains('input-uppercase')) {
        var start = el.selectionStart, end = el.selectionEnd;
        el.value = toUpperCaseValue(el.value);
        el.setSelectionRange(start, end);
    } else if (el.classList.contains('input-capitalize')) {
        var start = el.selectionStart, end = el.selectionEnd;
        el.value = toCapitalizeValue(el.value);
        el.setSelectionRange(start, end);
    }
});

window.stopImpersonate = function() {
    window.impersonatedEmail = '';
    sessionStorage.removeItem('impersonatedEmail');
    var emailSpan = document.getElementById('user-email-display');
    if (emailSpan) emailSpan.textContent = firebase.auth().currentUser.email;
    renderImpersonateBanner();
    window.location.reload();
};
