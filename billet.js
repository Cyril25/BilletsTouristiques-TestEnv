// ============================================================
// Fiche Billet — charge un billet par référence (?ref=XX-XXXX)
// et affiche son image avec un QR code pointant vers cette page.
// ============================================================

(function() {
    'use strict';

    var SITE_BASE = 'https://cyril25.github.io/BilletsTouristiques';

    // --- Helpers ---
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function resolveImageUrl(item, size) {
        if (item.ImageUrl) {
            return item.ImageUrl.replace('/upload/', '/upload/f_auto,q_auto,w_' + (size || 1000) + '/');
        }
        if (item.ImageId) {
            return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.ImageId) + '&sz=w' + (size || 1000);
        }
        return '';
    }

    function getQrUrl(ref) {
        var pageUrl = SITE_BASE + '/billet.html?ref=' + encodeURIComponent(ref);
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pageUrl);
    }

    // --- Init ---
    function init() {
        var params = new URLSearchParams(window.location.search);
        var ref = params.get('ref');

        if (!ref) {
            showError();
            return;
        }

        // Attendre l'auth Firebase puis charger le billet
        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) return; // global.js redirige vers login
            loadBillet(ref);
        });
    }

    function loadBillet(ref) {
        supabaseFetch('/rest/v1/billets?Reference=eq.' + encodeURIComponent(ref) + '&select=*')
            .then(function(rows) {
                if (!rows || rows.length === 0) {
                    showError();
                    return;
                }
                renderBillet(rows[0]);
            })
            .catch(function() {
                showError();
            });
    }

    function renderBillet(b) {
        document.getElementById('billet-loading').classList.add('hidden');
        document.getElementById('billet-content').classList.remove('hidden');

        // Image
        var imgUrl = resolveImageUrl(b, 1000);
        var imgEl = document.getElementById('billet-image');
        if (imgUrl) {
            imgEl.src = imgUrl;
            imgEl.alt = escapeHtml(b.NomBillet || 'Billet');
        } else {
            imgEl.style.display = 'none';
        }

        // QR code
        document.getElementById('billet-qr').src = getQrUrl(b.Reference);

        // Infos
        document.getElementById('billet-nom').textContent = b.NomBillet || '';
        document.getElementById('billet-ref').textContent = b.Reference || '';

        var lieu = [b.Cp, b.Ville, b.Dep, b.Pays].filter(Boolean).join(' — ');
        document.getElementById('billet-lieu').textContent = lieu;

        document.getElementById('billet-millesime').textContent = b.Millesime || '—';
        document.getElementById('billet-version').textContent = b.Version || '—';

        var catEl = document.getElementById('billet-categorie');
        catEl.textContent = b.Categorie || '—';

        // Thème (masquer si vide)
        if (b.Theme) {
            document.getElementById('billet-theme').textContent = b.Theme;
        } else {
            document.getElementById('billet-theme-row').style.display = 'none';
        }

        // Commentaire (masquer si vide)
        if (b.Commentaire) {
            document.getElementById('billet-commentaire').textContent = b.Commentaire;
        } else {
            document.getElementById('billet-commentaire-row').style.display = 'none';
        }

        // Titre de la page
        document.title = (b.Reference || 'Billet') + ' — ' + (b.NomBillet || 'Fiche Billet');
    }

    function showError() {
        document.getElementById('billet-loading').classList.add('hidden');
        document.getElementById('billet-error').classList.remove('hidden');
    }

    // Lancer au chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
