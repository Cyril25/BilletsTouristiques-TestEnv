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
// 1b. CONFIGURATION SUPABASE
// ============================================================
var SUPABASE_URL = 'https://lhwcoybugdsggcclhtgb.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxod2NveWJ1Z2RzZ2djY2xodGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODY5MzQsImV4cCI6MjA4ODU2MjkzNH0.I1CvqdFT4XPCCfIzJRlYNwKay2MVQ9YBB1_8qfJmQqQ';

/**
 * Helper : fetch authentifié vers Supabase.
 * Récupère le Firebase ID token et l'envoie en Bearer.
 * @param {string} path - Chemin REST (ex: '/rest/v1/billets?select=*')
 * @param {object} options - Options fetch (method, body, headers supplémentaires)
 * @returns {Promise} - Promise avec les données JSON ou null (204)
 */
function supabaseFetch(path, options) {
    if (!options) options = {};
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
            if (response.status === 204 || response.status === 201) return null;
            if (!response.ok) {
                return response.text().then(function(text) {
                    var msg = 'Erreur Supabase ' + response.status;
                    try { msg = JSON.parse(text).message || msg; } catch(e) {}
                    throw new Error(msg);
                });
            }
            return response.json();
        });
}

// ============================================================
// 2. LE VIGILE (SÉCURITÉ & NAVIGATION)
// ============================================================
document.addEventListener("DOMContentLoaded", function() {

    // Sécurité supplémentaire
    if (typeof firebase === 'undefined') return;

    const auth = firebase.auth();

    auth.onAuthStateChanged(user => {
        const path = window.location.pathname;
        const page = path.split("/").pop();
        const isLoginPage = (page === "login.html" || page === "login"); // petit fix au cas où

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

                    if (isLoginPage) {
                        window.location.href = "index.html";
                    } else {
                        // Guard admin : vérifier si la page requiert le rôle admin
                        if (document.body.getAttribute('data-require-admin') === 'true' && window.userRole !== 'admin') {
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
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .catch(error => {
            console.error(error);
            alert("Erreur connexion : " + error.message);


        });








}

function logout() {
    if (typeof firebase === 'undefined') return;
    firebase.auth().signOut().then(() => {
        window.location.href = "login.html";
    });
}

// ============================================================
// 4. MENU (Mise à jour)
// ============================================================
function loadMenu() {
    const placeholder = document.getElementById("menu-placeholder");
    if (!placeholder) return;

    fetch("menu.html")
        .then(response => response.text())
        .then(html => {
            // 1. On injecte le HTML
            placeholder.innerHTML = html;

            // 2. On gère le lien actif
            highlightActiveLink();

            // 3. ON AFFICHE L'EMAIL
            const user = firebase.auth().currentUser;
            const emailSpan = document.getElementById("user-email-display");

            // On vérifie si l'utilisateur est là et si le span existe
            if (user && emailSpan) {
                emailSpan.textContent = user.email;
            }

            // STORY 1.2 — Menu conditionnel : afficher les liens admin uniquement pour les admins
            if (window.userRole === 'admin') {
                var adminLinks = document.querySelectorAll('.admin-only');
                adminLinks.forEach(function(el) { el.classList.remove('admin-only'); });
            }
        })
        .catch(err => console.error("Menu introuvable :", err));
}

function highlightActiveLink() {
    let page = window.location.pathname.split("/").pop();
    if(page === "") page = index.html;

    setTimeout(() => {
        const links = document.querySelectorAll(".nav-links a");
        links.forEach(link => {
            if(link.getAttribute("href") === page) link.classList.add("active");
        });
    }, 100);
}

function toggleMenu() {
    const nav = document.getElementById('nav-links');
    if(nav) nav.classList.toggle('active');
}

// ============================================================
// 5. SERVICE WORKER (Cache des assets statiques)
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .catch(err => console.warn('Service Worker non enregistré :', err));
    });
}
